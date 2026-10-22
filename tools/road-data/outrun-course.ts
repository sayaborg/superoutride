/**
 * What OUTRUN's roads are made from beside their pieces ([Original road data](../../docs/original-road-data.md)): a
 * stage's path P as straights and arcs, its road width from its width points, and the helpers a Section's writing
 * shares (lanes' knots, repeated sprites, profile knots).
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { START_WIDTH } from './outrun-cross-section.js';
import type { Profile } from './road-profile.js';
import type { CurvePoint, Path, WidthHeightPoint } from './road-tables.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const CONVERSION_VERSION = 15;

/** The road width approaches a width point's target by its speed × 16 / 303 units a position. */
export const WIDTH_RATE = 16 / 303;
/**
 * At a join of its curves the path turns over a position or two beyond its curves' rates: the plan gives each join this
 * many positions either side, and reads a curve's own turn this far inside it.
 */
const JOIN = 2;
/** A straight's heading varies by at most this much inside it, radians. */
const STRAIGHT_TOLERANCE = (0.1 * Math.PI) / 180;

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));

/** The path's heading at each position, radians, unwrapped: counterclockwise positive in its vectors' (x, y). */
function pathHeadings(path: Path): Float64Array {
  const headings = new Float64Array(path.x.length);
  for (let i = 0; i < headings.length; i++) {
    const a = Math.atan2(path.y[i]!, path.x[i]!);
    if (i === 0) headings[i] = a;
    else {
      const step = a - Math.atan2(path.y[i - 1]!, path.x[i - 1]!);
      headings[i] = headings[i - 1]! + Math.atan2(Math.sin(step), Math.cos(step));
    }
  }
  return headings;
}

/** A plan element over road positions `[from, to)`: a straight, or an arc turning left (+) or right (−). */
export interface PlanSegment {
  readonly from: number;
  readonly to: number;
  readonly turn: number;
}

/**
 * The plan: P turning as the path does, at one rate between breaks: the ends, and `JOIN` positions either side of each
 * join of the curves (moved back by the path's offset), so that the turn the path makes at a join beyond its curves'
 * rates stays there. A straight holds one heading, the middle of the path's inside it, which must not vary; an arc
 * turns inside it the side its kind says.
 */
export function stagePlan(curves: readonly CurvePoint[], path: Path, offset: number, end: number): PlanSegment[] {
  const headings = pathHeadings(path);
  requireInput(end < headings.length, '/path', `The path ends before position ${end}`);
  const starts = curves.map((c) => Math.max(0, c.position - offset));
  const straights: { from: number; to: number; heading: number }[] = [];
  curves.forEach((c, i) => {
    const [from, to] = [starts[i]!, Math.min(starts[i + 1] ?? end, end)];
    if (to <= from) return;
    // Inside the curve, where it is long enough to have an inside.
    const [a, b] = to - from > 2 * JOIN ? [from + JOIN, to - JOIN] : [from, to];
    if (c.kind === 1) {
      requireInput(to - from > 2 * JOIN, `/curves/${from}`, `The straight at ${from} is too short to read`);
      const inside = Array.from(headings.subarray(a, b + 1));
      const [least, most] = [Math.min(...inside), Math.max(...inside)];
      requireInput(most - least <= STRAIGHT_TOLERANCE, `/curves/${from}`, `The path turns on the straight at ${from}`);
      straights.push({ from, to, heading: (least + most) / 2 });
      return;
    }
    const turn = headings[b]! - headings[a]!;
    requireInput(
      Math.sign(turn) === (c.kind === 3 ? 1 : -1),
      `/curves/${from}`,
      `The path turns ${turn > 0 ? 'left' : 'right'} on the curve at ${from} of kind ${c.kind}`,
    );
  });
  const breaks = [...new Set([0, end, ...starts.slice(1).flatMap((j) => [j - JOIN, j + JOIN])])]
    .filter((p) => p >= 0 && p <= end)
    .sort((x, y) => x - y);
  const heading = (p: number) => straights.find((s) => s.from <= p && p <= s.to)?.heading ?? headings[p]!;
  return breaks.slice(1).map((to, i) => ({ from: breaks[i]!, to, turn: heading(to) - heading(breaks[i]!) }));
}

/**
 * The road width along a stage, units, as knots `[position, width]` to `end`: from `start` at 0 (450 at the game's start),
 * each width point approaches its target from its position at its rate until it is reached or the next point begins.
 */
export function roadWidths(points: readonly WidthHeightPoint[], end: number, start = START_WIDTH): [number, number][] {
  const targets = points.filter((p) => p.kind !== 0 && p.position < end);
  const knots: [number, number][] = [[0, start]];
  let width = start;
  targets.forEach((p, i) => {
    const next = targets[i + 1]?.position ?? end;
    knots.push([p.position, width]);
    const rate = Math.abs(p.speed) * WIDTH_RATE;
    if (p.value === width) return;
    requireInput(rate > 0, `/widthsHeights/${p.position}`, `The width point at ${p.position} has no speed`);
    const reach = p.position + Math.abs(p.value - width) / rate;
    if (reach < next) {
      width = p.value;
      knots.push([reach, width]);
    } else {
      width += Math.sign(p.value - width) * rate * (next - p.position);
      knots.push([next, width]);
    }
  });
  knots.push([end, width]);
  return simplified(knots);
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

/** A curve is written this much shorter at each end, so curves that meet stay apart through rounding, metres. */
const CURVE_GAP = 2e-6;

/**
 * A Section's profile knots, stations `[from, to]`: its ends, and a PVI for each of the profile's bends within, at the
 * intersection of the tangents at the bend's ends. A knot next to an end that joins another Section lies on that end's
 * tangent, so the Sections' grades agree there (`joinsBefore`, `joinsAfter`).
 */
export function sectionProfile(profile: Profile, from: number, to: number, joinsBefore: boolean, joinsAfter: boolean) {
  const knots = [{ s: from, y: profile.height(from), curveLength: 0 }];
  for (const { from: a, to: b } of profile.bends) {
    // A bend broken at a cut ends where the Section does, but for its station's rounding.
    if (a < from - 1e-6 || b > to + 1e-6) continue;
    // To the step of computed values, finer than a station's, so that its tangents' grades hold at both its ends.
    const s = computedValue((a + b) / 2);
    knots.push({ s, y: profile.height(a) + profile.grade(a) * (s - a), curveLength: round(b - a - 2 * CURVE_GAP) });
  }
  knots.push({ s: to, y: profile.height(to), curveLength: 0 });
  const n = knots.length;
  if (n > 2 && joinsBefore) knots[1]!.y = knots[0]!.y + profile.grade(from) * (knots[1]!.s - from);
  if (n > 2 && joinsAfter) knots[n - 2]!.y = knots[n - 1]!.y - profile.grade(to) * (to - knots[n - 2]!.s);
  return knots;
}
