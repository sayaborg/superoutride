/**
 * What OUTRUN's roads are made from beside their pieces ([Original road data](../../docs/original-road-data.md)): a
 * stage's path P as straights and arcs, its road width from its width points, and the helpers a Section's writing
 * shares (lanes' knots, repeated sprites, profile knots).
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { START_WIDTH } from './outrun-cross-section.js';
import type { Profile } from './outrun-profile.js';
import type { CurvePoint, Path, WidthHeightPoint } from './outrun-road.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const CONVERSION_VERSION = 9;

/** The road width approaches a width point's target by its speed × 16 / 303 units a position. */
const WIDTH_RATE = 16 / 303;
/** A stage's turn at a join is spread over a position or two: headings are read this far inside a segment. */
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
 * The plan: the curves' segments, moved back by the path's offset, laid on the path to `end`. A straight's heading is
 * the path's inside it, which must not vary; an arc turns from the heading at its start to the heading at its end, each
 * a neighbouring straight's or, between two arcs, the path's at the join, so the arcs' turns sum to the path's. Each
 * arc turns the side its kind says.
 */
export function stagePlan(curves: readonly CurvePoint[], path: Path, offset: number, end: number): PlanSegment[] {
  const headings = pathHeadings(path);
  requireInput(end < headings.length, '/path', `The path ends before position ${end}`);
  const starts = curves.map((c) => Math.max(0, c.position - offset));
  const segments = curves.map((c, i) => ({ kind: c.kind, from: starts[i]!, to: Math.min(starts[i + 1] ?? end, end) }));
  const straight = segments.map((s) => {
    if (s.kind !== 1) return null;
    const inside = Array.from(headings.subarray(s.from + JOIN, s.to - JOIN + 1));
    requireInput(inside.length > 0, `/curves/${s.from}`, `The straight at ${s.from} is too short to read`);
    const least = Math.min(...inside),
      most = Math.max(...inside);
    requireInput(
      most - least <= STRAIGHT_TOLERANCE,
      `/curves/${s.from}`,
      `The path turns on the straight at ${s.from}`,
    );
    return (least + most) / 2;
  });
  // The heading where segment i begins: a straight's own, the straight's before it, or the path's between two arcs.
  const headingAt = (i: number) => straight[i] ?? straight[i - 1] ?? headings[segments[i]!.from]!;
  return segments.map((s, i) => {
    if (s.kind === 1) return { from: s.from, to: s.to, turn: 0 };
    const turn = (straight[i + 1] ?? (i + 1 < segments.length ? headingAt(i + 1) : headings[s.to]!)) - headingAt(i);
    requireInput(
      Math.sign(turn) === (s.kind === 3 ? 1 : -1),
      `/curves/${s.from}`,
      `The path turns ${turn > 0 ? 'left' : 'right'} on the curve at ${s.from} of kind ${s.kind}`,
    );
    return { from: s.from, to: s.to, turn };
  });
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
 * of its first: the original brings out a strip's pieces, and many objects, at a steady rate. Runs are found in station
 * order, each as long as it keeps its spacing; the rest stay as they are, a body where its station is exactly.
 */
export function repeated<T extends { readonly at: { readonly offset: number }; readonly body: unknown }>(
  sprites: readonly T[],
) {
  const groups = new Map<string, T[]>();
  for (const [k, sprite] of sprites.entries()) {
    const key = sprite.body === null ? JSON.stringify({ ...sprite, at: null }) : `body ${k}`;
    groups.set(key, [...(groups.get(key) ?? []), sprite]);
  }
  return [...groups.values()].flatMap((group) => {
    const sorted = [...group].sort((a, b) => a.at.offset - b.at.offset);
    const out: (T | { kind: 'repeat'; every: number; count: number; elements: [T] })[] = [];
    for (let i = 0; i < sorted.length;) {
      const first = sorted[i]!;
      const every = round((sorted[i + 1]?.at.offset ?? first.at.offset) - first.at.offset);
      let count = 1;
      while (
        every > 0 &&
        i + count < sorted.length &&
        Math.abs(sorted[i + count]!.at.offset - (first.at.offset + count * every)) <= REPEAT_TOLERANCE
      )
        count++;
      out.push(count > 1 ? { kind: 'repeat', every, count, elements: [first] } : first);
      i += count;
    }
    return out;
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
    if (a < from || b > to) continue;
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
