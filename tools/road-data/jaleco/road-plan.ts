/**
 * The plan of JALECO's driving board's two roads ([Original road
 * data](../../../docs/original-road-data.md#plan-from-a-tables-arcs), [BIG RUN road
 * data](../../../docs/big-run-road-data.md#its-plan)): each road's table of arcs laid by the shared rule, road 2 P and
 * road 1 beside it from its own table.
 */
import {
  arcPlan,
  crossingStreets,
  meetingsWithP,
  secondRoad,
  type ArcPlanLimits,
  type ArcRecord,
  type ArcTurn,
} from '../shared/arc-plan.js';
import { angleRadians, type RoadPlanRecord, type RoadTablesAt } from './road-tables.js';

/**
 * A plan record as the shared rule reads it, its heading left positive in a plane whose x runs along heading 0: the
 * table's heading turns right, its +6 lies a quarter turn to the right.
 */
export const arcRecord = (tables: RoadTablesAt, r: RoadPlanRecord): ArcRecord => ({
  start: r.start,
  radius: r.radius,
  side: r.side,
  heading: -r.heading * angleRadians(tables),
  x: r.x,
  y: -r.y,
});

/**
 * A stage's plan to `end`: road 2's table laid as P (K, 2026-11-09), and road 1 beside it from its own table, each
 * record checked within `limits` but where road 1 jumps back onto P, no arc tighter than `least` (metres,
 * `leastLaneRadius`) at `metres` a position; and the streets that cross at a turn of P's (`streets`).
 */
export function twoRoadPlan(
  tables: RoadTablesAt,
  road1: readonly RoadPlanRecord[],
  road2: readonly RoadPlanRecord[],
  end: number,
  metres: number,
  least: (from: number, to: number, side: 'left' | 'right') => number,
  limits: ArcPlanLimits,
) {
  const [p, q] = [road2, road1].map((records) => records.map((r) => arcRecord(tables, r)));
  const pPlan = arcPlan(p!, end, metres, least, limits);
  const qPlan = arcPlan(q!, end, metres, least, limits, meetingsWithP(p!, q!, end));
  return {
    p: pPlan,
    road1: qPlan,
    beside: secondRoad(p!, pPlan, q!, qPlan, end),
    streets: (turn: ArcTurn) => crossingStreets(p!, pPlan, turn),
  };
}

/**
 * A turn the original shows at right angles (K, 2026-11-15): about the start of the record at `at`, to `side`, laid at
 * `degrees`; where two straight streets cross (`crossing`, a trial, K, 2026-11-27), the street it leaves drawn on ahead
 * of it unless it is a T (`ahead`), and otherwise a turn of 90° with the street across painted as ground.
 */
export interface RightAngle {
  readonly at: number;
  readonly side: 'left' | 'right';
  readonly degrees: number;
  readonly crossing: boolean;
  readonly ahead: boolean;
}

/**
 * A road's records with each right angle turned by its degrees to its side: the records from its record on turned about
 * that record's start, so that the plan lays the corner as a turn about it and the road on from it as its tables run.
 */
export function rightAngled(
  records: readonly RoadPlanRecord[],
  angles: readonly RightAngle[],
  tables: RoadTablesAt,
): readonly RoadPlanRecord[] {
  const units = tables.turnUnits;
  let out = records;
  for (const angle of angles) {
    const k = out.findIndex((r) => r.start === angle.at);
    if (k < 1) throw new RangeError(`No record starts a right angle at ${angle.at}`);
    const by = ((angle.side === 'right' ? 1 : -1) * units * angle.degrees) / 360;
    const [px, py] = [out[k]!.x, out[k]!.y];
    const [c, s] = [Math.cos(by * angleRadians(tables)), Math.sin(by * angleRadians(tables))];
    out = out.map((r, i) =>
      i < k
        ? r
        : {
            ...r,
            heading: (((r.heading + by) % units) + units) % units,
            x: px + (r.x - px) * c - (r.y - py) * s,
            y: py + (r.x - px) * s + (r.y - py) * c,
          },
    );
  }
  return out;
}
