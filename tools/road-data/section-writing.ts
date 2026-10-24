/**
 * How the originals' Sections are written ([OUTRUN road data](../../docs/outrun-road-data.md#course-documents)):
 * knots simplified, sprites repeated, pictures raised, a road's plan as written and its Sections cut where their
 * road comes near itself.
 */
import { requireInput } from '../course/authoring-io.js';
import type { CoursePath } from './course-path.js';
import { normalFromHeading } from '../../src/core/math.js';
import {
  compilePlanPath,
  projectPlanSegmentInterval,
  samplePlanPath,
  type PlanPathProjection,
  type PlanPathSample,
  type PlanSegmentGeometry,
} from '../../src/course/geometry/plan-path.js';
import { createPlanClearance } from '../../src/course/plan-clearance.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';

/** A cut keeps this far from a gate, metres. */
const GATE_ROOM = 2;
/** A station this near a joint of its Section's plan, metres, is written at the joint. */
export const JOINT_SNAP = 2e-6;

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));

/** A picture's reach left and right of its base point, metres: to its texels' outer edges. */
export const pictureReach = ({ width, anchorX }: { readonly width: number; readonly anchorX: number }) =>
  [(anchorX + 0.5) / SPRITE_SOURCE_TEXELS_PER_METER, (width - 0.5 - anchorX) / SPRITE_SOURCE_TEXELS_PER_METER] as const;

/**
 * The ground's width beside a course's road ([Original road data](../../docs/original-road-data.md#the-ground-beside-the-road)):
 * how far beyond the outermost lane's edge on its side the farthest of the pictures `standing` on the ground reaches,
 * metres; each stands at `lateral` right of P, reaching `reach` left and right of it, the outermost lanes' edges
 * `edges` left and right of P there. 0 with none beyond.
 */
export function groundWidth(
  standing: Iterable<{
    readonly lateral: number;
    readonly reach: readonly [number, number];
    readonly edges: readonly [number, number];
  }>,
): number {
  let most = 0;
  for (const { lateral, reach, edges } of standing)
    most = Math.max(most, reach[0] - lateral - edges[0], lateral + reach[1] - edges[1]);
  return round(most);
}

/** Knots without repeats of a position, nor knots where the value neither starts nor stops changing. */
export function simplified(knots: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const knot of knots) {
    if (out.length && out.at(-1)![0] === knot[0]) continue;
    const [a, b] = [out.at(-2), out.at(-1)];
    if (a && b && (b[1] - a[1]) * (knot[0] - b[0]) === (knot[1] - b[1]) * (b[0] - a[0])) out.pop();
    out.push(knot);
  }
  return out;
}

/** Repeated sprites keep their stations to within this, metres: each occurrence is a micrometre-rounded station. */
const REPEAT_TOLERANCE = 2e-6;

/**
 * Sprite elements with each run of equal sprites without a body (all but `at`) at equal spacing written as one repeat
 * of its first: the original brings out a strip's pieces, and many objects, at a steady rate. An entry may be a unit,
 * sprites at one station (a board and its edge), repeated together. Runs are found in station order, each as long as it
 * keeps its spacing; the rest stay as they are, a body where its station is exactly.
 */
export function repeated<T extends { readonly at: { readonly offset: number }; readonly body: unknown }>(
  sprites: readonly (T | readonly T[])[],
) {
  const groups = new Map<string, (readonly T[])[]>();
  for (const [k, entry] of sprites.entries()) {
    const unit: readonly T[] = Array.isArray(entry) ? entry : [entry as T];
    const key = unit.every((s) => s.body === null)
      ? JSON.stringify(unit.map((s) => ({ ...s, at: null })))
      : `body ${k}`;
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  }
  return [...groups.values()].flatMap((group) => {
    const sorted = [...group].sort((a, b) => a[0]!.at.offset - b[0]!.at.offset);
    const out: (T | { kind: 'repeat'; every: number; count: number; elements: T[] })[] = [];
    for (let i = 0; i < sorted.length;) {
      const first = sorted[i]!;
      const offset = (n: number) => sorted[n]![0]!.at.offset;
      const every = round((sorted[i + 1] ? offset(i + 1) : offset(i)) - offset(i));
      let count = 1;
      while (
        every > 0 &&
        i + count < sorted.length &&
        Math.abs(offset(i + count) - (offset(i) + count * every)) <= REPEAT_TOLERANCE
      )
        count++;
      out.push(...(count > 1 ? [{ kind: 'repeat' as const, every, count, elements: [...first] }] : first));
      i += count;
    }
    return out;
  });
}

/**
 * Sprite elements, each raised off the ground (a nonzero `groundOffset`) whose picture `split` names shown by that
 * picture's `-raised` image: a picture standing at its foot on the ground stands on its bottom edge raised off it
 * ([Original road data](../../docs/original-road-data.md#foot-shadows)).
 */
export function raisedSplit<T>(elements: readonly T[], split: ReadonlySet<string>): T[] {
  return elements.map((e) => {
    const element = e as { kind?: string; image?: string; groundOffset?: number; elements?: readonly unknown[] };
    if (element.kind === 'repeat') return { ...e, elements: raisedSplit(element.elements!, split) };
    return element.groundOffset && split.has(element.image!) ? { ...e, image: `${element.image}-raised` } : e;
  });
}

/**
 * Where P's road over `[from, to]` (metres), written as one Section, comes near itself: each pair of P's metres, the
 * earlier and the later, where the Section's plan clearance on a side ([Architecture](../../docs/architecture.md#plan-authority))
 * falls short of `need(u, side)`, the least radius its lanes there keep (`leastLaneRadius`), sampled every `step`
 * metres. The clearance falls short because another passage of the Section comes within twice the need, the passage
 * the clearance's circle touches; a curve keeps its lanes' need by its plan (`headingPlan`).
 */
export function passagePairs(
  path: CoursePath,
  from: number,
  to: number,
  need: (u: number, side: 'left' | 'right') => number,
  step: number,
): [number, number][] {
  const origin = path.station(from);
  const at = (s: number) => path.along(origin + s);
  const plan = compilePlanPath({ x: 0, z: 0, heading: 0 }, planGeometry(writtenPlan(path, { from, to })));
  const clearance = createPlanClearance(plan);
  const sample: PlanPathSample = { x: 0, z: 0, s: 0, heading: 0, segmentIndex: 0 };
  const scratch: PlanPathSample = { ...sample };
  const projection: PlanPathProjection = { s: 0, l: 0, segmentIndex: 0, distanceSquared: 0, isFoot: false };
  const pairs: [number, number][] = [];
  for (let k = 0; k * step <= plan.length; k++) {
    const s = Math.min(k * step, plan.length);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'right' ? 1 : -1;
      const wanted = need(at(s), side);
      const c = clearance(s, sign, wanted);
      if (c >= wanted) continue;
      // The passage the circle of radius c touches: of the segments that come as near as c, the farthest along.
      samplePlanPath(plan, s, sample);
      const n = normalFromHeading(sample.heading);
      const touch = { x: sample.x + sign * c * n.x, z: sample.z + sign * c * n.z };
      let other = s;
      for (const segment of plan.segments) {
        projectPlanSegmentInterval(segment, touch, segment.sStart, segment.sEnd, projection, scratch);
        if (Math.sqrt(projection.distanceSquared) <= c * (1 + 1e-9) && Math.abs(projection.s - s) > Math.abs(other - s))
          other = projection.s;
      }
      pairs.push([at(Math.min(s, other)), at(Math.max(s, other))]);
    }
  }
  return pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/**
 * Cuts of P's `[from, to]` (metres) where its road comes near itself (`passagePairs`, with `need` the least radius its
 * lanes keep, or `need(u, side)`). While a pair remains, the earliest later passage with the latest earlier one (with
 * `once`, every pair whose earlier one lies before that later one, where one cut parts them all), it is cut between
 * them, at the middle of the longest straight there, else halfway, keeping clear of the gates (metres along P). Where
 * the ground beyond the road stops being one-to-one is the course format's
 * ([Architecture](../../docs/architecture.md#plan-authority)).
 */
export function domainCuts(
  path: CoursePath,
  from: number,
  to: number,
  need: number | ((u: number, side: 'left' | 'right') => number),
  gates: readonly number[],
  once = false,
): number[] {
  const step = 2.5;
  const pairs = passagePairs(path, from, to, typeof need === 'number' ? () => need : need, step);
  if (!pairs.length) return [];
  const later = Math.min(...pairs.map(([, b]) => b));
  // With `once`, one cut parts every pair whose earlier cell lies before the earliest later cell, where one can; else
  // the earliest later cell's pairs are parted first.
  const latest = Math.max(...pairs.filter(([a]) => a < later).map(([a]) => a)) + step;
  const earlier =
    once && latest < later ? latest : Math.max(...pairs.filter(([, b]) => b === later).map(([a]) => a)) + step;
  const clear = (u: number) => gates.every((g) => Math.abs(g - u) > GATE_ROOM);
  const straights = path.elements
    .map((e) => ({ a: Math.max(e.start, earlier), b: Math.min(e.start + e.length, later), turn: e.turn }))
    .filter((e) => e.turn === 0 && e.b - e.a > 2 * GATE_ROOM && clear((e.a + e.b) / 2))
    .sort((x, y) => y.b - y.a - (x.b - x.a));
  let cut = straights.length ? (straights[0]!.a + straights[0]!.b) / 2 : (earlier + later) / 2;
  for (let d = 0; !clear(cut) && d < later - earlier; d += 0.5) cut = (earlier + later) / 2 + d;
  requireInput(cut > earlier && cut < later && clear(cut), '/plan', `No cut parts the road's passages at ${earlier} m`);
  return [...domainCuts(path, from, cut, need, gates, once), cut, ...domainCuts(path, cut, to, need, gates, once)];
}

/** A written plan's geometry in the course format's terms (arcs turn right positive). */
export const planGeometry = (written: readonly WrittenElement[]): PlanSegmentGeometry[] =>
  written.map((e) =>
    e.kind === 'straight'
      ? { kind: 'straight', length: e.length }
      : { kind: 'arc', radius: e.radius!, turn: ((e.turn === 'left' ? -1 : 1) * e.length) / e.radius! },
  );

/** A plan element as written. */
export interface WrittenElement {
  readonly kind: string;
  readonly id: string;
  readonly length: number;
  readonly radius?: number;
  readonly turn?: string;
}

/** A piece's plan: P's elements over it, on the plane, its joints at their stations to the micrometre. */
export function writtenPlan(path: CoursePath, piece: { readonly from: number; readonly to: number }): WrittenElement[] {
  const elements: WrittenElement[] = [];
  // Each joint at its station from the piece's start to the micrometre, so the lengths add to the stations.
  const station = (u: number) => round(path.station(u) - path.station(piece.from));
  for (const e of path.elements) {
    const [a, b] = [Math.max(e.start, piece.from), Math.min(e.start + e.length, piece.to)];
    if (b - a <= 1e-9) continue;
    const length = round(station(b) - station(a));
    const id = `${e.turn === 0 ? 's' : 'c'}${elements.length}`;
    if (e.turn === 0) elements.push({ kind: 'straight', id, length });
    else {
      const turn = (e.turn * (b - a)) / e.length;
      elements.push({
        kind: 'arc',
        id,
        length,
        radius: round(length / Math.abs(turn)),
        turn: turn > 0 ? 'left' : 'right',
      });
    }
  }
  return elements;
}
