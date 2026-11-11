/**
 * BIG RUN's plan ([Original road data](../../../docs/original-road-data.md#plan-from-a-tables-arcs), [BIG RUN road
 * data](../../../docs/big-run-road-data.md#its-plan)): each road's table of arcs laid by the shared rule, road 2 P and
 * road 1 beside it from its own table.
 */
import { arcPlan, secondRoad, type ArcPlanLimits, type ArcRecord } from '../shared/arc-plan.js';
import { ANGLE_RADIANS, type BigRunPlanRecord } from './big-run-road.js';

/** How far a record may depart from its table's next heading and position (K, 2026-11-09; record by record, 2026-11-11). */
export const PLAN_LIMITS: ArcPlanLimits = Object.freeze({ heading: (0.03 * Math.PI) / 180, position: 14 });

/**
 * A plan record as the shared rule reads it, its heading left positive in a plane whose x runs along heading 0: the
 * table's heading turns right, its +6 lies a quarter turn to the right.
 */
export const arcRecord = (r: BigRunPlanRecord): ArcRecord => ({
  start: r.start,
  radius: r.radius,
  side: r.side,
  heading: -r.heading * ANGLE_RADIANS,
  x: r.x,
  y: -r.y,
});

/**
 * A stage's plan to `end`: road 2's table laid as P (K, 2026-11-09), and road 1 beside it from its own table, each
 * record checked within `PLAN_LIMITS`, no arc tighter than `least` (metres, `leastLaneRadius`) at `metres` a position.
 */
export function bigRunPlan(
  road1: readonly BigRunPlanRecord[],
  road2: readonly BigRunPlanRecord[],
  end: number,
  metres: number,
  least: (from: number, to: number, side: 'left' | 'right') => number,
) {
  const [p, q] = [road2.map(arcRecord), road1.map(arcRecord)];
  const [pPlan, qPlan] = [p, q].map((t) => arcPlan(t, end, metres, least, PLAN_LIMITS)) as [
    ReturnType<typeof arcPlan>,
    ReturnType<typeof arcPlan>,
  ];
  return { p: pPlan, road1: qPlan, beside: secondRoad(p, pPlan, q, qPlan, end) };
}
