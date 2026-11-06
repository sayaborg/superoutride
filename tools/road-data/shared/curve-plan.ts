/**
 * A plan from a curve table ([Plan from a curve table](../../../docs/original-road-data.md#plan-from-a-curve-table)):
 * each interval an arc of the curvature its value gives, a straight where its value is 0, neighbours alike one piece;
 * a circuit's table read round as a loop, its runs of one sign and of zeros, and a road's that closes no lap turned as
 * its original's farthest sky layer turns.
 */
import type { PathPiece } from './course-path.js';
import { contractUnmet } from './conversion-errors.js';

/** A curve table's interval: its value and its length, metres. */
export interface CurveInterval {
  readonly value: number;
  readonly length: number;
}

/**
 * A curve table's plan: each interval an arc turning `scale` radians a value a metre of it (left positive), a straight
 * where the value is 0; neighbouring intervals of one value one piece.
 */
export function curvePlan(intervals: readonly CurveInterval[], scale: number): PathPiece[] {
  const pieces: { value: number; length: number }[] = [];
  for (const { value, length } of intervals) {
    if (!(length > 0)) throw contractUnmet('A curve table interval has no length');
    const last = pieces.at(-1);
    if (last && last.value === value) last.length += length;
    else pieces.push({ value, length });
  }
  return pieces.map(({ value, length }) => ({ length, turn: value * scale * length }));
}

/**
 * The plan of a road that closes no lap from its curve table: each value the pixels its original's farthest sky layer
 * turns over an interval of `length` metres, of `turn` pixels a turn, so that the road turns as the sky does; `sign` 1
 * where its original turns a positive value left, −1 where right. The table is not read round: its start and its end
 * part it.
 */
export function skyTurnPlan(values: readonly number[], length: number, turn: number, sign: 1 | -1): PathPiece[] {
  return curvePlan(
    values.map((value) => ({ value: sign * value, length })),
    (2 * Math.PI) / (turn * length),
  );
}

/** A run of a curve table read round as a loop: its first interval, its count and its sign (0 a straight). */
export interface CurveRun {
  readonly from: number;
  readonly count: number;
  readonly sign: number;
}

/**
 * A curve table's runs read round as a loop: each the most intervals in turn of one sign, values of one sign a corner
 * and zeros a straight; the table's start parts no run, so a run across it is one, starting before it.
 */
export function curveRuns(values: readonly number[]): CurveRun[] {
  const n = values.length;
  const sign = (i: number) => Math.sign(values[((i % n) + n) % n]!);
  if (values.every((_, i) => sign(i) === sign(0))) return [{ from: 0, count: n, sign: sign(0) }];
  let first = 0;
  while (sign(first - 1) === sign(first)) first--;
  const runs: CurveRun[] = [];
  for (let i = first; i < first + n;) {
    let count = 1;
    while (i + count < first + n && sign(i + count) === sign(i)) count++;
    runs.push({ from: ((i % n) + n) % n, count, sign: sign(i) });
    i += count;
  }
  return runs;
}
