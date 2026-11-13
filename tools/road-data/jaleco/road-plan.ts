/**
 * The plan of JALECO's driving board's two roads ([Original road
 * data](../../../docs/original-road-data.md#plan-from-a-tables-arcs), [BIG RUN road
 * data](../../../docs/big-run-road-data.md#its-plan)): each road's table of arcs laid by the shared rule, road 2 P and
 * road 1 beside it from its own table.
 */
import { arcPlan, meetingsWithP, secondRoad, type ArcPlanLimits, type ArcRecord } from '../shared/arc-plan.js';
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
 * `leastLaneRadius`) at `metres` a position.
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
  return { p: pPlan, road1: qPlan, beside: secondRoad(p!, pPlan, q!, qPlan, end) };
}

/**
 * A turn the original shows at right angles (K, 2026-11-13): its tables' heading jump at `at`, and the jumps after it
 * that the same corner takes in (`joins`).
 */
export interface RightAngle {
  readonly at: number;
  readonly joins: readonly number[];
}

/**
 * A road's records with each right angle a quarter turn to its jump's side: the records from its jump on turned about
 * the jump's start by what the quarter turn adds to the jump, and those from each joined jump on turned back by that
 * jump, so that the plan lays the corner as one turn and the road on from it as its tables run.
 */
export function rightAngled(
  records: readonly RoadPlanRecord[],
  angles: readonly RightAngle[],
  tables: RoadTablesAt,
): readonly RoadPlanRecord[] {
  const units = tables.turnUnits;
  const wrap = (u: number) => ((((u + units / 2) % units) + units) % units) - units / 2;
  const jumpAt = (rs: readonly RoadPlanRecord[], at: number) => {
    const k = rs.findIndex((r) => r.start === at);
    if (k < 1) throw new RangeError(`No record starts a jump at ${at}`);
    return { k, by: wrap(rs[k]!.heading - rs[k - 1]!.heading) };
  };
  // The records from the k-th on turned by `by` units about the k-th's start.
  const turned = (rs: readonly RoadPlanRecord[], k: number, by: number) => {
    const [px, py] = [rs[k]!.x, rs[k]!.y];
    const [c, s] = [Math.cos(by * angleRadians(tables)), Math.sin(by * angleRadians(tables))];
    return rs.map((r, i) =>
      i < k
        ? r
        : {
            ...r,
            heading: (((r.heading + by) % units) + units) % units,
            x: px + (r.x - px) * c - (r.y - py) * s,
            y: py + (r.x - px) * s + (r.y - py) * c,
          },
    );
  };
  let out = records;
  for (const angle of angles) {
    const { k, by } = jumpAt(out, angle.at);
    out = turned(out, k, Math.sign(by) * (units / 4) - by);
    for (const at of angle.joins) {
      const joined = jumpAt(out, at);
      out = turned(out, joined.k, -joined.by);
    }
  }
  return out;
}
