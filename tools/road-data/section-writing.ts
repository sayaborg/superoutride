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

/** A cut keeps this far from a gate, metres. */
const GATE_ROOM = 2;
/** A written station, length or lateral: to the micrometre, as the course format holds them. */
export const micrometre = (value: number) => Number((Math.round(value / 1e-6) * 1e-6).toFixed(6));
/**
 * Two written micrometres, metres: two stations reckoned apart and each written to the micrometre lie within this when
 * they are one (a station at a joint, a repeated sprite's station), and two curves that meet are written this much
 * shorter, so that they stay apart.
 */
export const WRITTEN_SLACK = 2e-6;
/** An offset within this of a Section's end, metres, is written at its end. */
const END_SNAP = 1e-5;

/** A lateral at a lane's centre, where each grid slot the conversions write stands. */
export const laneCentre = (lane: string) => ({ lane, side: 'center' as const, offset: 0 });

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
      const every = micrometre((sorted[i + 1] ? offset(i + 1) : offset(i)) - offset(i));
      let count = 1;
      while (
        every > 0 &&
        i + count < sorted.length &&
        Math.abs(offset(i + count) - (offset(i) + count * every)) <= WRITTEN_SLACK
      )
        count++;
      out.push(...(count > 1 ? [{ kind: 'repeat' as const, every, count, elements: [...first] }] : first));
      i += count;
    }
    return out;
  });
}

/**
 * Half `h` of each `period` counted from `zero` over `[a, b]`, as a Section writes a stripe: a part half where `a` falls
 * in one, then the whole halves as one repeat at the period as written (`round`), as many as end within `b` at it, then
 * what is left to `b`. `strip` makes each stretch from its two ends.
 */
export function stripeHalves<T>(
  h: 0 | 1,
  period: number,
  zero: number,
  a: number,
  b: number,
  strip: (from: number, to: number) => T,
) {
  const half = period / 2;
  const phase = zero + h * half;
  const first = phase + Math.ceil((a - phase) / period - 1e-9) * period;
  const out: (T | { kind: 'repeat'; every: number; count: number; elements: T[] })[] = [];
  if (first - period + half > a + 1e-6) out.push(strip(a, Math.min(b, first - period + half)));
  const every = micrometre(period);
  const count = first + half <= b + 1e-9 ? Math.max(0, Math.floor((b - first - half + 1e-9) / every) + 1) : 0;
  const within = count > 0 && first + half + (count - 1) * every > b ? count - 1 : count;
  if (within > 0) {
    const element = strip(first, first + half);
    out.push(within === 1 ? element : { kind: 'repeat', every, count: within, elements: [element] });
  }
  const last = first + within * period;
  if (last < b - 1e-6) out.push(strip(last, b));
  return out;
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
  const at = (s: number) => from + s;
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

/** A stretch of P, metres along it. */
export interface Stretch {
  readonly a: number;
  readonly b: number;
}

/**
 * Cuts of P's `[from, to]` (metres) where its road comes near itself (`passagePairs` every `step` metres, with `need`
 * the least radius its lanes keep, or `need(u, side)`) ([Original road data](../../docs/original-road-data.md#9-sections-gates-limits-of-admission)).
 * While a pair remains, one cut parts every pair whose earlier passage lies before the earliest later one where one
 * can, else the earliest later passage's pairs: between them, where `one` says the road is one road (all of it by
 * default) and before the `finish` (the format keeps it in the course's last Section), at the middle of the longest
 * straight there, else of the longest such stretch, clear of the gates (metres along P) by `GATE_ROOM`, else on from
 * that stretch's middle by half metres until clear. Where the ground beyond the
 * road stops being one-to-one is the course format's ([Architecture](../../docs/architecture.md#plan-authority)).
 */
export function domainCuts(
  path: CoursePath,
  from: number,
  to: number,
  need: number | ((u: number, side: 'left' | 'right') => number),
  gates: readonly number[],
  options: {
    readonly step?: number;
    readonly one?: (a: number, b: number) => readonly Stretch[];
    readonly finish?: number;
  } = {},
): number[] {
  const step = options.step ?? 2.5;
  const pairs = passagePairs(path, from, to, typeof need === 'number' ? () => need : need, step);
  if (!pairs.length) return [];
  const later = Math.min(...pairs.map(([, b]) => b));
  const latest = Math.max(...pairs.filter(([a]) => a < later).map(([a]) => a)) + step;
  const earlier = latest < later ? latest : Math.max(...pairs.filter(([, b]) => b === later).map(([a]) => a)) + step;
  const clear = (u: number) => gates.every((g) => Math.abs(g - u) > GATE_ROOM);
  const stretches = (options.one ?? ((a, b) => [{ a, b }]))(earlier, Math.min(later, options.finish ?? later)).filter(
    (t) => t.b > t.a,
  );
  const straights = path.elements
    .filter((e) => e.turn === 0)
    .flatMap((e) => stretches.map((t) => ({ a: Math.max(t.a, e.start), b: Math.min(t.b, e.start + e.length) })));
  const longest = (all: readonly Stretch[]) => [...all].sort((x, y) => y.b - y.a - (x.b - x.a));
  const middle = (all: readonly Stretch[]) =>
    longest(all.filter((t) => t.b - t.a > 2 * GATE_ROOM && clear((t.a + t.b) / 2))).map((t) => (t.a + t.b) / 2)[0];
  let cut = middle(straights) ?? middle(stretches);
  const widest = longest(stretches)[0];
  if (cut === undefined && widest) {
    cut = (widest.a + widest.b) / 2;
    for (let d = 0; !clear(cut) && d < widest.b - widest.a; d += 0.5) cut = (widest.a + widest.b) / 2 + d;
  }
  requireInput(
    cut !== undefined && cut > earlier && cut < later && clear(cut),
    '/plan',
    `No cut parts the road's passages at ${earlier} m`,
  );
  return [
    ...domainCuts(path, from, cut, need, gates, options),
    cut,
    ...domainCuts(path, cut, to, need, gates, options),
  ];
}

/**
 * Where a stretch's objects at sorted places `at` (n of them) are cut into the fewest parts of at most `limit` each
 * that `fits` takes (by default every cut does): k parts, the j-th cut (1 ≤ j < k) at the place of the ⌊j·n/k⌋-th
 * object (0 from), whose place's objects go to the later part. No cut where all fit in one part.
 */
export function cutsByCount(
  at: readonly number[],
  limit: number,
  fits: (cuts: readonly number[]) => boolean = () => true,
): number[] {
  for (let k = Math.max(1, Math.ceil(at.length / limit)); k <= at.length + 1; k++) {
    const cuts = Array.from({ length: k - 1 }, (_, j) => at[Math.floor(((j + 1) * at.length) / k)]!);
    const ends = [-Infinity, ...cuts, Infinity];
    const counts = cuts
      .map((_, j) => j)
      .concat(k - 1)
      .map((j) => at.filter((q) => q >= ends[j]! && q < ends[j + 1]!).length);
    if (counts.every((n) => n <= limit) && fits(cuts)) return cuts;
  }
  throw new RangeError(`No cuts part ${at.length} objects into parts of at most ${limit}`);
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

/**
 * A piece's plan: P's elements over it, on the plane, its joints at their stations to the micrometre; or, `exact`, as
 * they are, so that a lap closes as P does.
 */
export function writtenPlan(
  path: CoursePath,
  piece: { readonly from: number; readonly to: number },
  exact = false,
): WrittenElement[] {
  const elements: WrittenElement[] = [];
  const fixed = exact ? (value: number) => value : micrometre;
  // Each joint at its station from the piece's start to the micrometre, so the lengths add to the stations.
  const station = (u: number) => fixed(u - piece.from);
  for (const e of path.elements) {
    const [a, b] = [Math.max(e.start, piece.from), Math.min(e.start + e.length, piece.to)];
    if (b - a <= 1e-9) continue;
    const length = fixed(station(b) - station(a));
    const id = `${e.turn === 0 ? 's' : 'c'}${elements.length}`;
    if (e.turn === 0) elements.push({ kind: 'straight', id, length });
    else {
      const turn = (e.turn * (b - a)) / e.length;
      elements.push({
        kind: 'arc',
        id,
        length,
        radius: fixed(length / Math.abs(turn)),
        turn: turn > 0 ? 'left' : 'right',
      });
    }
  }
  return elements;
}

/**
 * A Section's stations as written, from its plan as written (`elements`): its length, its first joint, and a station's
 * Position from that joint, to the micrometre, a station within `WRITTEN_SLACK` of a joint the joint's (a position
 * reckoned apart from the plan's elements can round to the micrometre beside it), within `END_SNAP` of the end the end,
 * and never before the start; and whether two stations are `apart` as written, as a stretch's ends must be for it to be
 * written.
 */
export function sectionStations(elements: readonly WrittenElement[]) {
  const size = elements.reduce((sum, e) => sum + e.length, 0);
  const joint = elements[0]!.id;
  const joints = elements.map((_, i) => micrometre(elements.slice(0, i).reduce((sum, e) => sum + e.length, 0)));
  const at = (s: number) => {
    const offset = micrometre(s);
    const written = joints.find((j) => Math.abs(j - offset) <= WRITTEN_SLACK) ?? offset;
    return { joint, offset: written > size - END_SNAP ? size : Math.max(0, written) };
  };
  const apart = (a: number, b: number) => at(b).offset > at(a).offset;
  return { size, joint, at, apart };
}

/** A checkpoint's or the finish's id and course station. */
export interface CourseGate {
  readonly id: string;
  readonly s: number;
}

/**
 * The checkpoints and the finish of a Section from course station `origin` (`stations`, its stations as written): each
 * after its start and up to its end, within `WRITTEN_SLACK`, a gate at its station; one at a Section's start is the
 * Section before's.
 */
export function sectionGates(
  stations: ReturnType<typeof sectionStations>,
  origin: number,
  checkpoints: readonly CourseGate[],
  finish: CourseGate,
) {
  const holds = (s: number) => s > origin + WRITTEN_SLACK && s <= origin + stations.size + WRITTEN_SLACK;
  const gate = <K extends string>(kind: K, g: CourseGate) => ({ kind, id: g.id, at: stations.at(g.s - origin) });
  return [
    ...checkpoints.filter((c) => holds(c.s)).map((c) => gate('checkpoint', c)),
    ...(holds(finish.s) ? [gate('finish', finish)] : []),
  ];
}
