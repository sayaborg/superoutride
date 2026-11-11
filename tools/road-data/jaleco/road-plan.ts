/**
 * The plan of JALECO's driving board's two roads ([Original road
 * data](../../../docs/original-road-data.md#plan-from-a-tables-arcs), [BIG RUN road
 * data](../../../docs/big-run-road-data.md#its-plan)): each road's table of arcs laid by the shared rule, road 2 P and
 * road 1 beside it from its own table.
 */
import { arcPlan, secondRoad, type ArcPlanLimits, type ArcRecord } from '../shared/arc-plan.js';
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
 * record checked within `limits`, no arc tighter than `least` (metres, `leastLaneRadius`) at `metres` a position.
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
  const [pPlan, qPlan] = [p!, q!].map((t) => arcPlan(t, end, metres, least, limits)) as [
    ReturnType<typeof arcPlan>,
    ReturnType<typeof arcPlan>,
  ];
  return { p: pPlan, road1: qPlan, beside: secondRoad(p!, pPlan, q!, qPlan, end) };
}
