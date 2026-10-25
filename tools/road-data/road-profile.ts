/**
 * A stage's profile from its height tables ([Original road data](../../docs/original-road-data.md#profile)): each
 * table's entries become changes of grade where the camera passes them, scaled by one constant, `c_look`, fitted so the
 * road's top in this game's drawing matches the original's ([hills](../../docs/original-road-data.md#hills)).
 */
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { cameraDistance, RENDER_FAR_DEPTH_METERS, RENDER_NEAR_DEPTH_METERS } from '../../src/view/camera.js';
import { computedValue } from '../authoring/course-joints.js';
import { ENTRY, entrySpans, type TableRun } from './hills.js';

/** An entry's value that changes the grade by `c_look`. */
const UNIT = 576;
/** The original's screen: its rows and its level road's top. */
const ORIGINAL_ROWS = 224;
export const ORIGINAL_LEVEL_TOP = 151;
/** This game's camera: its depth behind the player, rows and the depths at which it reads the road's top, metres. */
const DEPTH = cameraDistance(CAMERA_DEFINITION);
const ROWS = 2 * CAMERA_DEFINITION.horizonRow;
const NEAREST = RENDER_NEAR_DEPTH_METERS;
const READ_STEP = 1;

/**
 * A change of grade by `change` × `c_look` over road positions `[from, to)`; `held` when a shape held on the nearest
 * segment makes it (kinds 1 to 3), not an entry slid past.
 */
export interface GradeRamp {
  readonly from: number;
  readonly to: number;
  readonly change: number;
  readonly held: boolean;
}

/**
 * The grade's changes a table run makes, the camera passing them:
 * - kind 0: each entry slid past changes the grade by entry / 576 over its span;
 * - kinds 1 and 2: the first entry, which lies on the nearest segment while the shape rises, holds and returns,
 *   changes it by entry / 576 for each 2.125 × step positions it lies there at full share (half while rising or
 *   returning);
 * - kind 3: its entries slid in as kind 0's, then the entry it holds on the nearest segment as kind 1's;
 * - kind 4: none (the horizon's base is kept).
 */
export function gradeRamps(run: TableRun): GradeRamp[] {
  const { table, start, rise, holdEnd, end } = run;
  if (table.kind === 4) return [];
  const ramps: GradeRamp[] = [];
  let at = start;
  if (table.kind === 0 || table.kind === 3) {
    entrySpans(table)
      .slice(0, table.entries.length - 6)
      .forEach((span, k) => {
        if (table.entries[k]) ramps.push({ from: at, to: at + span, change: table.entries[k]! / UNIT, held: false });
        at += span;
      });
    if (table.kind === 0) return ramps;
  }
  const held = table.kind === 3 ? table.entries[table.entries.length - 6]! : table.entries[0]!;
  const span = ENTRY * table.step;
  const rate = held / UNIT / span;
  if (!held) return ramps;
  if (table.kind !== 3) ramps.push({ from: start, to: rise, change: (rate * (rise - start)) / 2, held: true });
  if (holdEnd > rise) ramps.push({ from: rise, to: holdEnd, change: rate * (holdEnd - rise), held: true });
  ramps.push({ from: holdEnd, to: end, change: (rate * (end - holdEnd)) / 2, held: true });
  return ramps;
}

/** A stretch of constant vertical curvature (1/m) over stations `[from, to)`, metres. */
export interface Bend {
  readonly from: number;
  readonly to: number;
  readonly curvature: number;
}

/** A point where the grade changes by `change` at station `at`, metres: a vertical curve of no length. */
export interface Kink {
  readonly at: number;
  readonly change: number;
}

/** A profile from bends and kinks: its height and grade at any station, level and at 0 at station 0. */
export interface Profile {
  readonly bends: readonly Bend[];
  readonly kinks: readonly Kink[];
  height(s: number): number;
  grade(s: number): number;
}

/** Stations nearer than this are one, a nanometre: two computations of one station differ by less. */
const ONE = 1e-9;

/**
 * The profile of `bends`, which may overlap: their curvatures add, and of `kinks`, the grade changing at each by its
 * change. The result's bends do not overlap and break at every bend's ends, at `breaks` and at the kinks, stations
 * within `ONE` one; its kinks are one at a station, in order.
 */
export function profileOf(
  bends: readonly Bend[],
  breaks: readonly number[] = [],
  kinks: readonly Kink[] = [],
): Profile {
  const cuts: number[] = [];
  for (const at of [...bends.flatMap((b) => [b.from, b.to]), ...breaks, ...kinks.map((k) => k.at)].sort(
    (a, b) => a - b,
  ))
    if (!cuts.length || at - cuts.at(-1)! > ONE) cuts.push(at);
  // Each node a piece's start or a kink, its grade and height there; past it the grade is constant until the next.
  const nodes: { from: number; to: number; curvature: number; grade: number; height: number }[] = [];
  const turns: Kink[] = [];
  let grade = 0,
    height = 0,
    last = 0;
  for (let i = 0; i < cuts.length; i++) {
    const from = cuts[i]!,
      to = cuts[i + 1] ?? from;
    // The tangent to this piece.
    height += grade * (from - last);
    last = from;
    const change = kinks.reduce((sum, k) => (Math.abs(k.at - from) <= ONE ? sum + k.change : sum), 0);
    if (change !== 0) {
      grade += change;
      turns.push({ at: from, change });
      nodes.push({ from, to: from, curvature: 0, grade, height });
    }
    const curvature = bends.reduce((k, b) => (b.from <= from + ONE && to <= b.to + ONE ? k + b.curvature : k), 0);
    if (curvature === 0 || to === from) continue;
    nodes.push({ from, to, curvature, grade, height });
    height += grade * (to - from) + (curvature * (to - from) ** 2) / 2;
    grade += curvature * (to - from);
    last = to;
  }
  const find = (s: number) => {
    let lo = 0,
      hi = nodes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nodes[mid]!.from <= s) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  };
  const at = (s: number) => {
    const i = find(s);
    if (i < 0) return { grade: 0, height: 0 };
    const p = nodes[i]!;
    const x = Math.min(s, p.to) - p.from;
    const g = p.grade + p.curvature * x,
      h = p.height + p.grade * x + (p.curvature * x * x) / 2;
    return { grade: g, height: h + g * Math.max(0, s - p.to) };
  };
  return {
    bends: nodes.filter((p) => p.curvature !== 0).map(({ from, to, curvature }) => ({ from, to, curvature })),
    kinks: turns,
    height: (s) => at(s).height,
    grade: (s) => at(s).grade,
  };
}

/**
 * This game's road top at camera station `s`: the least row of the road ahead up to the far depth (or `end`), the
 * camera `DEPTH` behind the player at its height above the road there, pitched with the road's grade there, as the
 * product camera stands at rest.
 */
export function roadTopRow(profile: Profile, s: number, end: number): number {
  const { focalLength: f, horizonRow, height } = CAMERA_DEFINITION;
  const base = s + DEPTH;
  const pitch = -Math.atan(profile.grade(base));
  const cameraY = profile.height(base) + (height + DEPTH * Math.sin(pitch)) / Math.cos(pitch);
  const horizon = horizonRow - f * Math.sin(pitch);
  let top = Infinity;
  for (let d = NEAREST; d <= RENDER_FAR_DEPTH_METERS && s + d <= end; d += READ_STEP)
    top = Math.min(top, horizon - (f / d) * (profile.height(s + d) - cameraY) * Math.cos(pitch));
  return top;
}

/** The level road's top on this game's screen. */
export const LEVEL_TOP = roadTopRow(profileOf([]), 0, Infinity);

/** A road top's rise above the level road's, as a share of its screen's height: the original's and this game's. */
export const originalLook = (row: number) => (ORIGINAL_LEVEL_TOP - row) / ORIGINAL_ROWS;
export const gameLook = (row: number) => (LEVEL_TOP - row) / ROWS;

/**
 * `c_look` by table kind, fitted on COCONUT BEACH (`npm run road-data -- outrun-look`): kind 0's entries and kind 3's slid in
 * by the least squares match of the road's top over its kind 0 tables, kinds 1 and 2 and kind 3's hold over its kind
 * 1 table, the other fixed.
 */
export const LOOK: Readonly<Record<0 | 1, number>> = Object.freeze({ 0: 0.131, 1: 0.55 });

/** A grade's change over stations, metres. */
export interface Change {
  readonly from: number;
  readonly to: number;
  readonly change: number;
}
export const bendOf = ({ from, to, change }: Change): Bend => ({ from, to, curvature: change / (to - from) });

/** The grade's changes of a stage's table runs at `look`, an entry slid past by kind 0's, a held shape by kind 1's. */
export function tableChanges(
  runs: readonly TableRun[],
  look: Readonly<Record<0 | 1, number>>,
  stationOf: (position: number) => number,
): Change[] {
  return runs.flatMap(gradeRamps).map((r) => ({
    from: stationOf(r.from),
    to: stationOf(r.to),
    change: r.change * look[r.held ? 1 : 0],
  }));
}

/**
 * The steepest grade a held shape makes: the steepest a slid table reaches from level, 0.393 (0x3C's, 0x3B's, 0x2F's
 * and 0x32's tables at the slid `c_look`).
 */
export const STEEPEST = 0.393;

/** A change of grade cut to end by `end`, its curvature kept; null where it begins there or beyond. */
const cutAt = (c: Change, end: number): Change | null =>
  c.from >= end
    ? null
    : c.to <= end
      ? c
      : { from: c.from, to: end, change: (c.change * (end - c.from)) / (c.to - c.from) };

/**
 * A stage's grade changes from its table runs at `look`, cut where the stage ends at `cut`, to the road's `end`
 * (stations by `stationOf`): each table's, a held shape's ending where the grade reaches ±`STEEPEST`, then the grade the
 * table leaves returned to 0 over the stretch to the next table's start (the last's to `end`); where that stretch is
 * empty, the grade is carried to the next.
 */
export function stageGrades(
  runs: readonly TableRun[],
  look: Readonly<Record<0 | 1, number>>,
  stationOf: (position: number) => number,
  cut: number,
  end: number,
): Change[] {
  const out: Change[] = [];
  const add = (c: Change | null) => {
    if (c && c.to > c.from && c.change !== 0) out.push(c);
  };
  runs.forEach((run, i) => {
    for (const r of gradeRamps(run)) {
      const c = cutAt({ from: stationOf(r.from), to: stationOf(r.to), change: r.change * look[r.held ? 1 : 0] }, cut);
      if (!c || !r.held) {
        add(c);
        continue;
      }
      // The room left to the steepest grade, the way the shape bends.
      const room = Math.sign(c.change) * STEEPEST - profileOf(out.map(bendOf)).grade(c.from);
      if (Math.sign(room) !== Math.sign(c.change)) continue;
      add(
        Math.abs(c.change) <= Math.abs(room)
          ? c
          : { from: c.from, to: c.from + ((c.to - c.from) * room) / c.change, change: room },
      );
    }
    const from = Math.min(stationOf(run.end), cut),
      to = Math.min(end, stationOf(runs[i + 1]?.start ?? Infinity));
    if (to > from) add({ from, to, change: -profileOf(out.map(bendOf)).grade(from) });
  });
  return out;
}

/** The stretch over which a closed road takes and leaves its tilt, metres. */
const TILT_RAMP = RENDER_FAR_DEPTH_METERS;

/**
 * `changes` closed: any grade left at `end` (a table running to it) returned to 0 over the last `TILT_RAMP` metres,
 * then the road tilted by one constant grade, taken over its first `TILT_RAMP` metres and left over its last, so that
 * it ends level at height 0 at `end` as it begins: a road's ends join others' level at height 0.
 */
export function closedGrades(changes: readonly Change[], end: number): Change[] {
  const left = profileOf(changes.map(bendOf)).grade(end);
  const level = left === 0 ? [...changes] : [...changes, { from: end - TILT_RAMP, to: end, change: -left }];
  const tilt = -profileOf(level.map(bendOf)).height(end) / (end - TILT_RAMP);
  return [...level, { from: 0, to: TILT_RAMP, change: tilt }, { from: end - TILT_RAMP, to: end, change: -tilt }];
}

/**
 * `c_look` refitted from `runs`' tables against the original's road top `original(position)` at road positions
 * `positions` (the camera's, stations by `stationOf`, the road to `end`): kind 0's by the least squares match of the
 * two looks, rows over each screen's height, around its kind 0 tables (from the view's depth before each to its end),
 * then kind 1's around its others with kind 0's fixed. The grades the tables leave are not returned for the fit.
 */
export function fitLook(
  runs: readonly TableRun[],
  original: (position: number) => number,
  positions: readonly number[],
  stationOf: (position: number) => number,
  end: number,
): Record<0 | 1, number> {
  const ahead = RENDER_FAR_DEPTH_METERS / (stationOf(1) - stationOf(0));
  const kindAt = (p: number) => runs.find((r) => p >= r.start - ahead && p < r.end)?.table.kind;
  const squares = (look: Record<0 | 1, number>, held: boolean) => {
    const profile = profileOf(tableChanges(runs, look, stationOf).map(bendOf));
    let sum = 0;
    for (const p of positions) {
      const kind = kindAt(p);
      if (kind === undefined || (kind === 0) === held) continue;
      sum += (gameLook(roadTopRow(profile, stationOf(p), end)) - originalLook(original(p))) ** 2;
    }
    return sum;
  };
  // A scan of [0, most] by 1/40 of it, then halving steps about the best.
  const least = (f: (c: number) => number, most: number) => {
    let best = 0,
      value = f(0),
      step = most / 40;
    for (let c = step; c <= most + 1e-9; c += step) {
      const v = f(c);
      if (v < value) [best, value] = [c, v];
    }
    for (let i = 0; i < 16; i++, step /= 2)
      for (const c of [best - step / 2, best + step / 2]) {
        const v = f(c);
        if (c >= 0 && v < value) [best, value] = [c, v];
      }
    return Math.round(best * 1000) / 1000;
  };
  const slid = least((c) => squares({ 0: c, 1: 0 }, false), 0.5);
  return { 0: slid, 1: least((c) => squares({ 0: slid, 1: c }, true), 2) };
}

/** The load at `kmh` on the profile's sharpest bend over stations `[from, to]`, g: 1 level, below 0 the car leaves. */
export function leastLoad(profile: Profile, from: number, to: number, kmh: number): number {
  const v = kmh / 3.6;
  let least = 1;
  for (const b of profile.bends)
    if (b.to > from && b.from < to) least = Math.min(least, 1 + (v * v * b.curvature) / 9.80665);
  return least;
}

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));

/** A curve is written this much shorter at each end, so curves that meet stay apart through rounding, metres. */
const CURVE_GAP = 2e-6;

/**
 * A Section's profile knots, stations `[from, to]`: its ends, a PVI for each of the profile's bends within, at the
 * intersection of the tangents at the bend's ends, and one of no curve at each of its kinks within. A knot next to an end that joins another Section lies on that end's
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
  // Each kink within, a knot of no curve.
  for (const { at } of profile.kinks)
    if (at > from + 1e-6 && at < to - 1e-6) knots.push({ s: computedValue(at), y: profile.height(at), curveLength: 0 });
  knots.sort((p, q) => p.s - q.s);
  knots.push({ s: to, y: profile.height(to), curveLength: 0 });
  const n = knots.length;
  if (n === 3 && joinsBefore && joinsAfter) {
    // One bend over the whole Section: its knot where the tangents at both its ends meet, so both grades hold.
    const [g0, g2] = [profile.grade(from), profile.grade(to)];
    const s = (knots[2]!.y - knots[0]!.y + g0 * from - g2 * to) / (g0 - g2);
    knots[1] = { ...knots[1]!, s, y: knots[0]!.y + g0 * (s - from) };
    return knots;
  }
  if (n > 2 && joinsBefore) knots[1]!.y = knots[0]!.y + profile.grade(from) * (knots[1]!.s - from);
  if (n > 2 && joinsAfter) knots[n - 2]!.y = knots[n - 1]!.y - profile.grade(to) * (to - knots[n - 2]!.s);
  return knots;
}
