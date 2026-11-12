/**
 * A plan from a table's arcs ([Plan from a table's arcs](../../../docs/original-road-data.md#plan-from-a-tables-arcs)):
 * each record a straight or an arc to the next record's start, an arc's angle its length over its radius, the table's
 * headings and positions checking it, and a heading's jump laid as a turn added to the records beside it, as a heading
 * table's turn is between straights, keeping the lanes' least radius.
 */
import { contractUnmet, romDiffers } from './conversion-errors.js';
import type { PlanElement } from './heading-plan.js';

/**
 * A table's record: where along the road it starts (positions), a straight (radius 0) or an arc of `radius` positions
 * turning to `side`, and, where the table holds them, its heading where it starts (radians, left positive, the
 * direction (cos, sin)) and its position in the plane (positions).
 */
export interface ArcRecord {
  readonly start: number;
  readonly radius: number;
  readonly side: 'left' | 'right';
  readonly heading?: number;
  readonly x?: number;
  readonly y?: number;
}

/** How far the plan may lie from the table's headings (radians) and positions (positions) where each record starts. */
export interface ArcPlanLimits {
  readonly heading: number;
  readonly position: number;
}

/** A second road's jump back onto P where it meets it again: at `at`, by `heading` radians and `position` positions. */
export interface ArcJumpBack {
  readonly at: number;
  readonly heading: number;
  readonly position: number;
}

/** A heading's jump laid as a turn: over positions `[from, to]`, turning `turn` radians (left positive). */
export interface ArcTurn {
  readonly from: number;
  readonly to: number;
  readonly turn: number;
}

/** The angle `a` brought within half a turn either side of 0. */
const wrapped = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** A pose in a table's plane: its position (positions) and heading (radians, left positive, the direction (cos, sin)). */
export interface ArcPose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** Pose `p` taken `d` positions on, turning `turn` radians evenly over them: by its chord. */
function advanced(p: ArcPose, turn: number, d: number): ArcPose {
  const chord = turn === 0 ? d : (2 * Math.sin(turn / 2) * d) / turn;
  return {
    x: p.x + chord * Math.cos(p.heading + turn / 2),
    y: p.y + chord * Math.sin(p.heading + turn / 2),
    heading: p.heading + turn,
  };
}

/** A record's pose where it starts, as its table holds it. */
const poseOf = (r: ArcRecord): ArcPose => ({ x: r.x!, y: r.y!, heading: r.heading! });

/**
 * The plan of `records` up to `end`, a position `metres` long, no element turning tighter than `least(from, to, side)`
 * (`leastLaneRadius`, metres, over positions `[from, to]` on the curve's inside `side`):
 * - each record a straight or an arc to the next record's start (the last's to `end`), an arc's angle its length over
 *   its radius, to its side; the table's degrees, being rounded, are not read; straights one after another one;
 * - where the table holds headings and positions, each record is laid from its own heading and position and taken
 *   against the next record's within `limits`, record by record;
 * - a record's heading that departs by more than the limit from the one its record before reaches, so laid, is a jump;
 *   it is laid as a turn of the jump's angle, its curvature added to the records' either side, over the fewest whole
 *   positions alike either side of the record's start at which the curvature on each side keeps `least`, the distances
 *   along the road unchanged; between two straights, a turn of its angle alone;
 * - a record where the road, a second road, meets P again (`meets`, its starts), departing beyond `limits` from what
 *   its record before reaches, jumps back onto P: the plan starts again from it, neither a turn nor a departure, and
 *   how far it jumps is reported;
 * - the plan is laid on from the first record's heading and position, and how far it departs from the table's headings
 *   and positions where each record starts is reported, a position since the last turn or jump back, with no limit.
 * Stops where a turn takes more than the records beside it hold, two turns overlap or reach the table's start or `end`,
 * an arc turns tighter than `least`, or a record departs from the table beyond `limits`.
 * Returns the plan's elements (positions), its start heading, its turns, the most a record departs from the table's next
 * heading and position (`fidelity`), the most the plan laid on departs from them (`departure`), how far each turn
 * moves the plan from the table's positions after it, and its jumps back onto P (`jumpsBack`).
 */
export function arcPlan(
  records: readonly ArcRecord[],
  end: number,
  metres: number,
  least: (from: number, to: number, side: 'left' | 'right') => number,
  limits: ArcPlanLimits,
  meets: readonly number[] = [],
) {
  if (records.length === 0) throw contractUnmet('A table of arcs has no record');
  const endOf = (i: number) => (i + 1 < records.length ? records[i + 1]!.start : end);
  records.forEach((r, i) => {
    if (!(endOf(i) > r.start)) throw contractUnmet(`A table's record at ${r.start} has no length`);
    if (r.radius < 0) throw contractUnmet(`A table's record at ${r.start} has a negative radius`);
  });
  const turnOf = (i: number) => {
    const r = records[i]!;
    return r.radius === 0 ? 0 : ((r.side === 'left' ? 1 : -1) * (endOf(i) - r.start)) / r.radius;
  };
  /** A record's curvature: radians a position, left positive. */
  const curvatureOf = (i: number) => turnOf(i) / (endOf(i) - records[i]!.start);
  const checked = records.every((r) => r.heading !== undefined && r.x !== undefined && r.y !== undefined);
  // Record by record: each laid from its own heading and position to the next's start and taken against the next's; a
  // heading departing beyond the limit a jump.
  const jumps: { at: number; turn: number }[] = [];
  const fidelity = { heading: 0, position: 0 };
  const meeting = new Set(meets);
  const jumpsBack: ArcJumpBack[] = [];
  if (checked) {
    for (let i = 1; i < records.length; i++) {
      const reached = advanced(poseOf(records[i - 1]!), turnOf(i - 1), records[i]!.start - records[i - 1]!.start);
      const next = records[i]!;
      const departs = Math.hypot(next.x! - reached.x, next.y! - reached.y);
      const jump = wrapped(next.heading! - reached.heading);
      if (meeting.has(next.start) && (Math.abs(jump) > limits.heading || departs > limits.position)) {
        jumpsBack.push({ at: next.start, heading: Math.abs(jump), position: departs });
        continue;
      }
      fidelity.position = Math.max(fidelity.position, departs);
      if (Math.abs(jump) <= limits.heading) {
        fidelity.heading = Math.max(fidelity.heading, Math.abs(jump));
        continue;
      }
      jumps.push({ at: i, turn: jump });
    }
    if (fidelity.position > limits.position)
      throw romDiffers(`A record departs from its table by ${fidelity.position} positions`);
  }
  // Each jump a turn added to the records either side, over the fewest whole positions alike either side of it at which
  // the curvature on each side keeps the lanes' least radius: between straights, the turn's own over both sides.
  const turns: ArcTurn[] = jumps.map(({ at, turn }) => {
    const s = records[at]!.start;
    const [before, after] = [curvatureOf(at - 1), curvatureOf(at)];
    const keeps = (from: number, to: number, curvature: number) =>
      curvature === 0 || metres / Math.abs(curvature) >= least(from, to, curvature > 0 ? 'left' : 'right');
    const kept = (n: number) =>
      before === after
        ? keeps(s - n, s + n, turn / (2 * n) + before)
        : keeps(s - n, s, turn / (2 * n) + before) && keeps(s, s + n, turn / (2 * n) + after);
    const holds = (n: number) => s - n >= records[at - 1]!.start && s + n <= endOf(at);
    let n = 1;
    while (holds(n) && !kept(n)) n++;
    if (!holds(n)) throw contractUnmet(`The turn at ${s} takes more than the records beside it hold`);
    if (s - n <= records[0]!.start || s + n >= end) throw contractUnmet(`The turn at ${s} reaches the table's ends`);
    return { from: s - n, to: s + n, turn };
  });
  turns.forEach((t, k) => {
    if (k > 0 && t.from < turns[k - 1]!.to)
      throw contractUnmet(`The turns at ${turns[k - 1]!.from} and ${t.from} overlap`);
  });
  // The elements: the records' arcs and straights, each turn added to the records it lies over, a turn between two
  // straights one element.
  const pieces: PlanElement[] = [];
  records.forEach((r, i) => {
    const [from, to] = [r.start, endOf(i)];
    const turn = turnOf(i);
    if (turn !== 0 && r.radius * metres < least(from, to, r.side))
      throw contractUnmet(`The arc at ${from} turns tighter than its lanes' least radius`);
    pieces.push({ from, to, turn });
  });
  const cut: (PlanElement & { readonly of?: ArcTurn; readonly own?: number })[] = [];
  for (const p of pieces) {
    let from = p.from;
    // A record's turn over `[a, b]` of it: its whole turn over the whole of it.
    const share = (a: number, b: number) =>
      a === p.from && b === p.to ? p.turn : (p.turn * (b - a)) / (p.to - p.from);
    for (const t of turns) {
      if (t.to <= from || t.from >= p.to) continue;
      if (t.from > from) cut.push({ from, to: t.from, turn: share(from, t.from) });
      const [a, b] = [Math.max(t.from, from), Math.min(t.to, p.to)];
      cut.push({ from: a, to: b, turn: (t.turn * (b - a)) / (t.to - t.from) + share(a, b), of: t, own: share(a, b) });
      from = b;
    }
    if (from < p.to) cut.push({ from, to: p.to, turn: share(from, p.to) });
  }
  const elements: PlanElement[] = [];
  for (const [k, { of, own, ...e }] of cut.entries()) {
    const before = elements.at(-1);
    // A turn's halves over two straights: one element, its turn the jump's.
    const halves = of !== undefined && cut[k - 1]?.of === of && own === 0 && cut[k - 1]!.own === 0;
    if (halves) elements[elements.length - 1] = { from: before!.from, to: e.to, turn: of.turn };
    else if (e.turn === 0 && before?.turn === 0) elements[elements.length - 1] = { ...before, to: e.to };
    else elements.push(e);
  }
  // The plan laid on from the first record, taken against the table where each record starts.
  const departure = { heading: 0, position: 0 };
  const shifts: number[] = [];
  if (checked) {
    let pose = poseOf(records[0]!);
    let [ox, oy, k, turned] = [0, 0, 0, 0];
    const startsAt = new Map(records.map((r, i) => [r.start, i]));
    const take = (p: number) => {
      const i = startsAt.get(p);
      // A record whose start lies within a turn is the jump's own: the turn departs from it by design.
      if (i === undefined || turns.some((t) => t.from < p && p < t.to)) return;
      const r = records[i]!;
      // A jump back onto P: the plan starts again from its record.
      if (jumpsBack.some((b) => b.at === p)) {
        [pose, ox, oy] = [poseOf(r), 0, 0];
        return;
      }
      if (turned < turns.length && turns[turned]!.to <= p) {
        // A turn's end: the plan from here is taken against the table's positions after it, its shift reported.
        [ox, oy] = [r.x! - pose.x, r.y! - pose.y];
        shifts.push(Math.hypot(ox, oy));
        turned++;
      }
      departure.heading = Math.max(departure.heading, Math.abs(wrapped(pose.heading - r.heading!)));
      departure.position = Math.max(departure.position, Math.hypot(r.x! - ox - pose.x, r.y! - oy - pose.y));
    };
    take(records[0]!.start);
    const stops = [...new Set([...elements.flatMap((e) => [e.from, e.to]), ...records.map((r) => r.start)])].sort(
      (a, b) => a - b,
    );
    for (let s = 0; s + 1 < stops.length; s++) {
      const [a, b] = [stops[s]!, stops[s + 1]!];
      while (k + 1 < elements.length && elements[k]!.to <= a) k++;
      const e = elements[k]!;
      pose = advanced(pose, (e.turn * (b - a)) / (e.to - e.from), b - a);
      take(b);
    }
  }
  return {
    elements,
    start: records[0]!.heading ?? 0,
    turns,
    fidelity,
    departure,
    shifts,
    jumpsBack,
  };
}

/** A plan's poses: laid by `elements` from `start`, the pose at station `from` within or before them. */
class PlanWalk {
  private readonly at: { readonly s: number; readonly pose: ArcPose; readonly e: number }[] = [];
  constructor(
    private readonly elements: readonly PlanElement[],
    from: number,
    start: ArcPose,
  ) {
    let [s, pose] = [from, start];
    elements.forEach((e, i) => {
      if (e.to <= from) return;
      this.at.push({ s, pose, e: i });
      pose = advanced(pose, (e.turn * (e.to - s)) / (e.to - e.from), e.to - s);
      s = e.to;
    });
    this.at.push({ s, pose, e: -1 });
  }
  /** The pose at station `s`, within the walk's stations. */
  pose(s: number): ArcPose {
    let i = this.at.length - 1;
    while (i > 0 && this.at[i]!.s > s) i--;
    const { s: from, pose, e } = this.at[i]!;
    if (e < 0) return pose;
    const el = this.elements[e]!;
    return advanced(pose, (el.turn * (s - from)) / (el.to - el.from), s - from);
  }
}

/**
 * A parting of a second road from P: positions `[from, to)`, whether it meets P again at `to`, whether by a jump back
 * onto P, and its miss there.
 */
export interface ArcParting {
  readonly from: number;
  readonly to: number;
  readonly meets: boolean;
  readonly jumps: boolean;
  readonly miss: number;
}

/** Whether two records are one: one start, arc and pose, and one end. */
const sameRecord = (a: ArcRecord, aEnd: number, b: ArcRecord, bEnd: number) =>
  a.start === b.start &&
  aEnd === bEnd &&
  a.radius === b.radius &&
  (a.radius === 0 || a.side === b.side) &&
  a.heading === b.heading &&
  a.x === b.x &&
  a.y === b.y;

/** Whether each of the second's records `q` is one with P's `p`: one start, arc and pose, and one end. */
function oneWithP(p: readonly ArcRecord[], q: readonly ArcRecord[], end: number) {
  const endOf = (t: readonly ArcRecord[], i: number) => (i + 1 < t.length ? t[i + 1]!.start : end);
  const pAt = new Map(p.map((r, i) => [r.start, i]));
  return q.map((r, j) => {
    const i = pAt.get(r.start);
    return i !== undefined && sameRecord(p[i]!, endOf(p, i), r, endOf(q, j));
  });
}

/** Where a second road `q` meets P's `p` again: the starts of its records one with P's after one that is not. */
export function meetingsWithP(p: readonly ArcRecord[], q: readonly ArcRecord[], end: number): number[] {
  const one = oneWithP(p, q, end);
  return q.filter((_, j) => j > 0 && one[j] && !one[j - 1]).map((r) => r.start);
}

/** The least cosine between the two roads' headings at which a lateral across P is taken: 60°. */
const ACROSS = 0.5;

/**
 * A second road from its own table `q` beside P's `p` ([Plan from a table's arcs](../../../docs/original-road-data.md#plan-from-a-tables-arcs)),
 * each table's plan its `arcPlan` (`pPlan`, `qPlan`) and P laid from its first record:
 * - where the two tables hold one record (start, arc, pose and end), the two roads are one;
 * - where they part, the second is laid by its own plan from P's pose where they part, and where they are one again its
 *   miss of P there is spread straight along the road over the parting, so that it meets P where they do; one that
 *   never meets P again, or meets it by a jump back (`qPlan`'s `jumpsBack`), keeps its own plan;
 * - where they start apart, the second is laid from its own first pose, taken in the tables' plane as P's is, its miss
 *   where they first meet spread the same way.
 * Returns its partings, its pose at its own station (`pose`), and its lateral at P's station (`lateralAt`, positions
 * right of P, across P, 0 where the two are one), which is refused where it heads more than 60° from P.
 */
export function secondRoad(
  p: readonly ArcRecord[],
  pPlan: ReturnType<typeof arcPlan>,
  q: readonly ArcRecord[],
  qPlan: ReturnType<typeof arcPlan>,
  end: number,
) {
  if (![...p, ...q].every((r) => r.heading !== undefined && r.x !== undefined && r.y !== undefined))
    throw contractUnmet("A second road's tables hold no poses");
  const endOf = (t: readonly ArcRecord[], i: number) => (i + 1 < t.length ? t[i + 1]!.start : end);
  const one = oneWithP(p, q, end);
  const back = new Set(qPlan.jumpsBack.map((b) => b.at));
  const P = new PlanWalk(pPlan.elements, p[0]!.start, poseOf(p[0]!));
  // The partings: the runs of the second's records that are not P's, each its own plan laid from where it parts.
  const partings: (ArcParting & { readonly walk: PlanWalk; readonly dx: number; readonly dy: number })[] = [];
  for (let j = 0; j < q.length; j++) {
    if (one[j]) continue;
    let k = j;
    while (k + 1 < q.length && !one[k + 1]) k++;
    const [from, to] = [q[j]!.start, endOf(q, k)];
    const meets = k + 1 < q.length;
    const jumps = meets && back.has(to);
    const walk = new PlanWalk(qPlan.elements, from, j === 0 ? poseOf(q[0]!) : P.pose(from));
    const [at, there] = [walk.pose(to), P.pose(to)];
    const miss = meets ? Math.hypot(at.x - there.x, at.y - there.y) : 0;
    const [dx, dy] = meets && !jumps ? [at.x - there.x, at.y - there.y] : [0, 0];
    partings.push({ from, to, meets, jumps, miss, walk, dx, dy });
    j = k;
  }
  const partingAt = (s: number) => partings.find((g) => g.from <= s && s < g.to);
  /** The second's pose at its own station `s`: P's where the two are one; its own, its miss spread, where they part. */
  const pose = (s: number): ArcPose => {
    const g = partingAt(s);
    if (!g) return P.pose(s);
    const own = g.walk.pose(s);
    const f = (s - g.from) / (g.to - g.from);
    return { x: own.x - g.dx * f, y: own.y - g.dy * f, heading: own.heading };
  };
  const lateralAt = (s: number) => {
    if (!partingAt(s)) return 0;
    const at = P.pose(s);
    const [ux, uy] = [Math.cos(at.heading), Math.sin(at.heading)];
    // The second's station abreast of P's: where the line across P at `s` meets it.
    let t = s;
    for (let n = 0; n < 8; n++) {
      const o = pose(t);
      const cos = Math.cos(o.heading - at.heading);
      if (cos < ACROSS) throw contractUnmet(`A second road heads more than 60° from P at ${s}`);
      t -= ((o.x - at.x) * ux + (o.y - at.y) * uy) / cos;
    }
    const o = pose(t);
    return (o.x - at.x) * uy - (o.y - at.y) * ux;
  };
  return {
    partings: partings.map(({ from, to, meets, jumps, miss }): ArcParting => ({ from, to, meets, jumps, miss })),
    pose,
    lateralAt,
  };
}
