/**
 * CHASE H.Q.'s plan ([Original road data](../../../docs/original-road-data.md#plan-from-a-curve-table)): a course's
 * records turned as its far sky band turns, a positive curve right, and where the course crosses itself, its passages'
 * positions the heights' fixed points.
 */
import { CoursePath, type PathPiece } from '../shared/course-path.js';
import { skyTurnPlan } from '../shared/curve-plan.js';
import { roadCells } from '../shared/overpasses.js';
import { RECORD_UNITS } from '../taito/course-records.js';
import { SKY_TURN } from './chase-hq-backgrounds.js';
import { STEP_METRES } from './chase-hq-heights.js';
import { POSITION_METRES, readSkyTurn, type ChaseHqRecord } from './chase-hq-road.js';

/** A record's length, metres. */
export const RECORD_METRES = RECORD_UNITS * POSITION_METRES;

/**
 * A course's plan from its records' curves: each record the far band's pixels its curve's size turns it a record
 * (its turn table's word over 8, 0x6332), of its 768 pixels a turn, a positive curve turning right (the research note).
 */
export function coursePieces(main: Uint8Array, records: readonly ChaseHqRecord[]): PathPiece[] {
  const turn = readSkyTurn(main);
  const values = records.map((r) => (Math.sign(r.curve) * turn[Math.abs(r.curve)]!) / 8);
  return skyTurnPlan(values, RECORD_METRES, SKY_TURN, -1);
}

/** Where two passages of a course cross: their stations, metres along it, the first the nearer its start. */
export type Crossing = readonly [number, number];

/**
 * Where the plan `pieces` crosses itself up to `to` metres: each pair of its line's stretches a step long at least
 * `PASSAGES_APART` apart along it that meet, their meeting point's stations, a crossing found in two neighbouring
 * stretches once.
 */
export function crossings(pieces: readonly PathPiece[], to: number): Crossing[] {
  const path = new CoursePath(pieces);
  const step = STEP_METRES;
  const cells = roadCells(path, { from: 0, to, step, sides: () => [0, 0] });
  const out: [number, number][] = [];
  for (const [a, b] of cells.pairs) {
    const p = [path.aside(a, 0), path.aside(Math.min(to, a + step), 0)];
    const q = [path.aside(b, 0), path.aside(Math.min(to, b + step), 0)];
    const [dx, dy, ex, ey] = [p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y, q[1]!.x - q[0]!.x, q[1]!.y - q[0]!.y];
    const den = dx * ey - dy * ex;
    if (den === 0) continue;
    const [fx, fy] = [q[0]!.x - p[0]!.x, q[0]!.y - p[0]!.y];
    const t = (fx * ey - fy * ex) / den,
      v = (fx * dy - fy * dx) / den;
    if (t < 0 || t > 1 || v < 0 || v > 1) continue;
    const c: [number, number] = [a + t * step, b + v * step];
    if (!out.some((o) => Math.abs(o[0] - c[0]) < step && Math.abs(o[1] - c[1]) < step)) out.push(c);
  }
  return out;
}
