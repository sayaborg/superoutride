/**
 * A plan from a table's arcs ([Plan from a table's arcs](../../../docs/original-road-data.md#plan-from-a-tables-arcs)):
 * each record a straight or an arc to the next record's start, an arc's angle its length over its radius, the table's
 * headings and positions checking it, and a heading's jump between two straights laid as a turn at the lanes' least
 * radius, as a heading table's turn is.
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

/** A heading's jump laid as a turn: over positions `[from, to]`, turning `turn` radians (left positive). */
export interface ArcTurn {
  readonly from: number;
  readonly to: number;
  readonly turn: number;
}

/** The angle `a` brought within half a turn either side of 0. */
const wrapped = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/**
 * The plan of `records` up to `end`, a position `metres` long, no element turning tighter than `least(from, to, side)`
 * (`leastLaneRadius`, metres, over positions `[from, to]` on the curve's inside `side`):
 * - each record a straight or an arc to the next record's start (the last's to `end`), an arc's angle its length over
 *   its radius, to its side; the table's degrees, being rounded, are not read; straights one after another one;
 * - where the table holds headings and positions, the plan is laid from the first record's, and where a record starts
 *   its heading and position are checked against the table's within `limits`, a position since the last turn;
 * - a record's heading that departs from the plan's by more than the limit is a jump; between two straights it is laid
 *   as a turn of the jump's angle over the fewest whole positions alike either side of the record's start at which its
 *   radius keeps `least`, taken from the straights, the distances along the road unchanged.
 * Stops where a jump has an arc either side, a turn takes more than a straight holds, two turns overlap or reach the
 * table's start or `end`, an arc turns tighter than `least`, or the plan departs from the table beyond `limits`.
 * Returns the plan's elements (positions), its start heading, its turns, the most it departs from the table's headings
 * and positions, and how far each turn moves the plan from the table's positions after it.
 */
export function arcPlan(
  records: readonly ArcRecord[],
  end: number,
  metres: number,
  least: (from: number, to: number, side: 'left' | 'right') => number,
  limits: ArcPlanLimits,
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
  const checked = records.every((r) => r.heading !== undefined && r.x !== undefined && r.y !== undefined);
  // The jumps: where a record's heading departs from the one the records before it reach.
  const jumps: { at: number; turn: number }[] = [];
  if (checked) {
    let heading = records[0]!.heading!;
    for (let i = 1; i < records.length; i++) {
      heading += turnOf(i - 1);
      const jump = wrapped(records[i]!.heading! - heading);
      if (Math.abs(jump) <= limits.heading) continue;
      if (records[i - 1]!.radius !== 0 || records[i]!.radius !== 0)
        throw romDiffers(`A table's heading jumps at ${records[i]!.start} beside an arc`);
      jumps.push({ at: i, turn: jump });
      heading = records[i]!.heading!;
    }
  }
  // Each jump a turn over the fewest whole positions either side of it that keep the lanes' least radius.
  const turns: ArcTurn[] = jumps.map(({ at, turn }) => {
    const s = records[at]!.start;
    const side = turn > 0 ? 'left' : 'right';
    let n = 1;
    while ((2 * n * metres) / Math.abs(turn) < least(s - n, s + n, side)) n++;
    if (s - n < records[at - 1]!.start || s + n > endOf(at))
      throw contractUnmet(`The turn at ${s} takes more than the straights beside it hold`);
    if (s - n <= records[0]!.start || s + n >= end) throw contractUnmet(`The turn at ${s} reaches the table's ends`);
    return { from: s - n, to: s + n, turn };
  });
  turns.forEach((t, k) => {
    if (k > 0 && t.from < turns[k - 1]!.to)
      throw contractUnmet(`The turns at ${turns[k - 1]!.from} and ${t.from} overlap`);
  });
  // The elements: the records' arcs and straights, the straights beside a turn shortened by it.
  const pieces: PlanElement[] = [];
  records.forEach((r, i) => {
    const [from, to] = [r.start, endOf(i)];
    const turn = turnOf(i);
    if (turn !== 0 && r.radius * metres < least(from, to, r.side))
      throw contractUnmet(`The arc at ${from} turns tighter than its lanes' least radius`);
    pieces.push({ from, to, turn });
  });
  const cut: PlanElement[] = [];
  for (const p of pieces) {
    let from = p.from;
    for (const t of turns) {
      if (t.to <= from || t.from >= p.to) continue;
      if (t.from > from) cut.push({ from, to: t.from, turn: 0 });
      if (t.from >= p.from) cut.push({ from: t.from, to: t.to, turn: t.turn });
      from = t.to;
    }
    if (from < p.to) cut.push({ from, to: p.to, turn: p.turn });
  }
  const elements: PlanElement[] = [];
  for (const e of cut) {
    const before = elements.at(-1);
    if (e.turn === 0 && before?.turn === 0) elements[elements.length - 1] = { ...before, to: e.to };
    else elements.push(e);
  }
  // The plan walked exactly, checked against the table where each record starts.
  let [heading, position] = [0, 0];
  const shifts: number[] = [];
  if (checked) {
    const first = records[0]!;
    let [x, y, h] = [first.x!, first.y!, first.heading!];
    let [ox, oy, k, turned] = [0, 0, 0, 0];
    const startsAt = new Map(records.map((r, i) => [r.start, i]));
    const check = (p: number) => {
      const i = startsAt.get(p);
      // A record whose start lies within a turn is the jump's own: the turn departs from it by design.
      if (i === undefined || turns.some((t) => t.from < p && p < t.to)) return;
      const r = records[i]!;
      if (turned < turns.length && turns[turned]!.to <= p) {
        // A turn's end: the plan from here is compared with the table's positions after it, its shift reported.
        [ox, oy] = [r.x! - x, r.y! - y];
        shifts.push(Math.hypot(ox, oy));
        turned++;
      }
      heading = Math.max(heading, Math.abs(wrapped(h - r.heading!)));
      position = Math.max(position, Math.hypot(r.x! - ox - x, r.y! - oy - y));
    };
    check(first.start);
    const stops = [...new Set([...elements.flatMap((e) => [e.from, e.to]), ...records.map((r) => r.start)])].sort(
      (a, b) => a - b,
    );
    for (let s = 0; s + 1 < stops.length; s++) {
      const [a, b] = [stops[s]!, stops[s + 1]!];
      while (k + 1 < elements.length && elements[k]!.to <= a) k++;
      const e = elements[k]!;
      const turn = (e.turn * (b - a)) / (e.to - e.from);
      const d = b - a;
      const chord = turn === 0 ? d : (2 * Math.sin(turn / 2) * d) / turn;
      [x, y] = [x + chord * Math.cos(h + turn / 2), y + chord * Math.sin(h + turn / 2)];
      h += turn;
      check(b);
    }
    if (heading > limits.heading || position > limits.position)
      throw romDiffers(`The plan departs from its table by ${heading} radians and ${position} positions`);
  }
  return {
    elements,
    start: records[0]!.heading ?? 0,
    turns,
    fidelity: { heading, position },
    shifts,
  };
}
