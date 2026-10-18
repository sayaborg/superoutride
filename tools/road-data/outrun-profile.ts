/**
 * A stage's profile from its height tables ([Original road data](../../docs/original-road-data.md#profile)): each
 * table's entries become changes of grade where the camera passes them, scaled by one constant, `c_look`, fitted so the
 * road's top in this game's drawing matches the original's ([hills](../../docs/original-road-data.md#hills)).
 */
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { cameraDistance, RENDER_FAR_DEPTH_METERS, RENDER_NEAR_DEPTH_METERS } from '../../src/view/camera.js';
import { ENTRY, entrySpans, type TableRun } from './outrun-hills.js';

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
/** The look a crossing's separation may change: rows of the road's top on this game's screen. */
export const LOOK_ROWS = 1;

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

/** A profile from bends: its height and grade at any station, level and at 0 at station 0. */
export interface Profile {
  readonly bends: readonly Bend[];
  height(s: number): number;
  grade(s: number): number;
}

/**
 * The profile of `bends`, which may overlap: their curvatures add. The result's bends do not overlap and break at
 * every bend's ends and at `breaks`.
 */
export function profileOf(bends: readonly Bend[], breaks: readonly number[] = []): Profile {
  const cuts = [...new Set([...bends.flatMap((b) => [b.from, b.to]), ...breaks])].sort((a, b) => a - b);
  const pieces: { from: number; to: number; curvature: number; grade: number; height: number }[] = [];
  let grade = 0,
    height = 0,
    last = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i]!,
      to = cuts[i + 1]!;
    const curvature = bends.reduce((k, b) => (b.from <= from && to <= b.to ? k + b.curvature : k), 0);
    // The tangent to this piece.
    height += grade * (from - last);
    last = from;
    if (curvature === 0) continue;
    pieces.push({ from, to, curvature, grade, height });
    height += grade * (to - from) + (curvature * (to - from) ** 2) / 2;
    grade += curvature * (to - from);
    last = to;
  }
  // Each piece's start, its grade and height there; past it the grade is constant until the next.
  const find = (s: number) => {
    let lo = 0,
      hi = pieces.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pieces[mid]!.from <= s) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  };
  const at = (s: number) => {
    const i = find(s);
    if (i < 0) return { grade: 0, height: 0 };
    const p = pieces[i]!;
    const x = Math.min(s, p.to) - p.from;
    const g = p.grade + p.curvature * x,
      h = p.height + p.grade * x + (p.curvature * x * x) / 2;
    return { grade: g, height: h + g * Math.max(0, s - p.to) };
  };
  return {
    bends: pieces.map(({ from, to, curvature }) => ({ from, to, curvature })),
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
 * `c_look` by table kind, fitted on COCONUT BEACH (`npm run road-data -- look`): kind 0's entries and kind 3's slid in
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

/** The most the road's top moves on this game's screen, at cameras from `from` to `to`, from `before` to `after`. */
function lookChange(before: Profile, after: Profile, from: number, to: number, end: number): number {
  let most = 0;
  // A camera past the last of the road reads no top.
  for (let s = Math.max(0, from); s <= Math.min(to, end - NEAREST); s += 2)
    most = Math.max(most, Math.abs(roadTopRow(after, s, end) - roadTopRow(before, s, end)));
  return most;
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
 * `changes` with the road tilted by one constant grade, taken over its first `TILT_RAMP` metres and left over its last,
 * so that it ends at height 0 at `end` as it begins: a road's ends join others' at height 0.
 */
export function closedGrades(changes: readonly Change[], end: number): Change[] {
  const tilt = -profileOf(changes.map(bendOf)).height(end) / (end - TILT_RAMP);
  return [...changes, { from: 0, to: TILT_RAMP, change: tilt }, { from: end - TILT_RAMP, to: end, change: -tilt }];
}

/** The height two passages of a crossing are kept apart, metres. */
const CLEARANCE = 6;

/** Where a plan passes over itself: pairs of stations, the earlier passage's then the later's, whose roads overlap. */
export type Crossing = readonly (readonly [number, number])[];

/**
 * A crossing's passages kept `CLEARANCE` apart: where they are nearer, the higher is raised and the lower lowered by
 * the same smooth bump, each over the shortest stretch (from 100 m by 20 m within the road's `[0, end]`) that moves the
 * road's top on this game's screen by at most `LOOK_ROWS`, else the longest; the bump grows until every overlapping
 * pair is apart.
 */
export function separatedCrossings(changes: readonly Change[], crossings: readonly Crossing[], end: number): Change[] {
  let out = [...changes];
  for (const pairs of crossings) {
    const before = profileOf(out.map(bendOf));
    const apart = (p: Profile) => Math.min(...pairs.map(([a, b]) => Math.abs(p.height(a) - p.height(b))));
    if (apart(before) >= CLEARANCE) continue;
    const middle = (k: 0 | 1) => pairs.reduce((sum, pair) => sum + pair[k], 0) / pairs.length;
    const [a, b] = [middle(0), middle(1)];
    const up = before.height(b) >= before.height(a) ? 1 : -1;
    // A bump of `rise` at s over [s − L, s + L]: grades out to ±2·rise/L and back, curvature 4·rise/L².
    const bump = (s: number, rise: number, L: number): Change[] => [
      { from: s - L, to: s - L / 2, change: (2 * rise) / L },
      { from: s - L / 2, to: s + L / 2, change: (-4 * rise) / L },
      { from: s + L / 2, to: s + L, change: (2 * rise) / L },
    ];
    const reach = Math.min(a, end - b, (b - a) / 2);
    const with_ = (rise: number, L: number) => [...out, ...bump(a, -up * rise, L), ...bump(b, up * rise, L)];
    let rise = (CLEARANCE - apart(before)) / 2,
      L = Math.min(100, reach);
    for (let i = 0; i < 200 && apart(profileOf(with_(rise, L).map(bendOf))) < CLEARANCE; i++) rise += 0.1;
    while (L + 20 <= reach) {
      const after = profileOf(with_(rise, L).map(bendOf));
      if (
        Math.max(
          lookChange(before, after, a - L - RENDER_FAR_DEPTH_METERS, a + L, end),
          lookChange(before, after, b - L - RENDER_FAR_DEPTH_METERS, b + L, end),
        ) <= LOOK_ROWS
      )
        break;
      L += 20;
    }
    out = with_(rise, L);
  }
  return out;
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
