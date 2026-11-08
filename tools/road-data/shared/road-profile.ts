/**
 * A road's profile ([Original road data](../../../docs/original-road-data.md#profile)): its bends and kinks, its height and
 * grade at any station, and a Section's profile knots.
 */
import { micrometre } from './section-writing.js';
import { computedValue } from '../../authoring/course-joints.js';
import { WRITTEN_SLACK } from './shared-constants.js';

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

/**
 * A profile from bends and kinks: its height and grade at any station, at height 0 at station 0, its grade there a
 * kink's at 0 (level without one).
 */
export interface Profile {
  readonly bends: readonly Bend[];
  readonly kinks: readonly Kink[];
  height(s: number): number;
  grade(s: number): number;
}

/**
 * Stations nearer than this are one, a micrometre, as stations are written: two computations of one station (a piece's
 * cell border and a passage's end at one road position) differ by less.
 */
const SAME_STATION = 1e-6;

/**
 * The profile of `bends`, which may overlap: their curvatures add, and of `kinks`, the grade changing at each by its
 * change. The result's bends do not overlap and break at every bend's ends, at `breaks` and at the kinks, stations
 * within `SAME_STATION` one; its kinks are one at a station, in order.
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
    if (!cuts.length || at - cuts.at(-1)! > SAME_STATION) cuts.push(at);
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
    const change = kinks.reduce((sum, k) => (Math.abs(k.at - from) <= SAME_STATION ? sum + k.change : sum), 0);
    if (change !== 0) {
      grade += change;
      turns.push({ at: from, change });
      nodes.push({ from, to: from, curvature: 0, grade, height });
    }
    const curvature = bends.reduce(
      (k, b) => (b.from <= from + SAME_STATION && to <= b.to + SAME_STATION ? k + b.curvature : k),
      0,
    );
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

/** A grade's change over stations, metres. */
export interface Change {
  readonly from: number;
  readonly to: number;
  readonly change: number;
}
export const bendOf = ({ from, to, change }: Change): Bend => ({ from, to, curvature: change / (to - from) });

/** A curve is written this much shorter at each end, so curves that meet stay apart through rounding, metres. */
const CURVE_GAP = WRITTEN_SLACK;

/**
 * The stations of `road`'s lowest and highest points over `[0, lap)`, each the first from its start of equal ones: at a
 * bend's end, a kink, 0 or where a bend's grade passes 0, as the height is quadratic on each bend and straight between.
 */
export function heightExtremes(road: Profile, lap: number) {
  const zero = (b: Bend) => b.from - road.grade(b.from) / b.curvature;
  const candidates = [0, ...road.bends.flatMap((b) => [b.from, b.to, zero(b)]), ...road.kinks.map((k) => k.at)]
    .filter((s) => s >= 0 && s < lap)
    .sort((x, y) => x - y);
  return {
    lowest: candidates.reduce((best, s) => (road.height(s) < road.height(best) ? s : best), 0),
    highest: candidates.reduce((best, s) => (road.height(s) > road.height(best) ? s : best), 0),
  };
}

/**
 * A lap's road heights, `lap` metres long, within `rise`: where its highest and lowest lie farther apart, its bends'
 * curvatures and its kinks' changes all times one factor, its height everywhere so, so that they lie exactly `rise`
 * apart; else `road` itself ([A course's model](../../../docs/original-road-data.md#rules-of-the-originals)). With the
 * factor, 1 where it is unchanged.
 */
export function withinRise(road: Pick<Profile, 'bends' | 'kinks'>, lap: number, rise: number) {
  const profile = profileOf(road.bends, [], road.kinks);
  const { lowest, highest } = heightExtremes(profile, lap);
  const apart = profile.height(highest) - profile.height(lowest);
  if (apart <= rise) return { road, factor: 1 };
  const factor = rise / apart;
  return {
    road: {
      bends: road.bends.map((b) => ({ ...b, curvature: b.curvature * factor })),
      kinks: road.kinks.map((k) => ({ ...k, change: k.change * factor })),
    },
    factor,
  };
}

/**
 * A Section's profile knots, stations `[from, to]`: its ends, a PVI for each of the profile's bends within, at the
 * intersection of the tangents at the bend's ends, and one of no curve at each of its kinks within. A knot next to an end that joins another Section lies on that end's
 * tangent, so the Sections' grades agree there (`joinsBefore`, `joinsAfter`), its end at `size` from its start as the
 * Section's plan writes it (its stations' difference unless given).
 */
export function sectionProfile(
  profile: Profile,
  from: number,
  to: number,
  joinsBefore: boolean,
  joinsAfter: boolean,
  size = to - from,
) {
  const knots = [{ s: from, y: profile.height(from), curveLength: 0 }];
  for (const { from: a, to: b } of profile.bends) {
    // A bend broken at a cut ends where the Section does, but for its station's rounding.
    if (a < from - 1e-6 || b > to + 1e-6) continue;
    // To the step of computed values, finer than a station's, so that its tangents' grades hold at both its ends.
    const s = computedValue((a + b) / 2);
    knots.push({
      s,
      y: profile.height(a) + profile.grade(a) * (s - a),
      curveLength: micrometre(b - a - 2 * CURVE_GAP),
    });
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
    const s = (knots[2]!.y - knots[0]!.y + g0 * from - g2 * (from + size)) / (g0 - g2);
    // Its curve as long as the nearer end leaves room for, as the Section is written.
    const room = micrometre(2 * Math.min(s - from, from + size - s) - 2 * CURVE_GAP);
    knots[1] = {
      ...knots[1]!,
      s,
      y: knots[0]!.y + g0 * (s - from),
      curveLength: Math.min(knots[1]!.curveLength, room),
    };
    return knots;
  }
  // On the tangents as the stations are written, offsets from `from` to the step of computed values, so that the grades
  // hold however near the knot lies.
  const offset = (s: number) => computedValue(s - from);
  if (n > 2 && joinsBefore) knots[1]!.y = knots[0]!.y + profile.grade(from) * offset(knots[1]!.s);
  if (n > 2 && joinsAfter)
    knots[n - 2]!.y = knots[n - 1]!.y - profile.grade(to) * (computedValue(size) - offset(knots[n - 2]!.s));
  return knots;
}
