/**
 * CHASE H.Q.'s plan ([Original road data](../../../docs/original-road-data.md#plan-from-a-curve-table)): a course's
 * records turned as its far sky band turns, a positive curve right.
 */
import type { PathPiece } from '../shared/course-path.js';
import { skyTurnPlan } from '../shared/curve-plan.js';
import { RECORD_UNITS } from '../taito/course-records.js';
import { SKY_TURN } from './chase-hq-backgrounds.js';
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
