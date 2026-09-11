import type { GuidePath } from '../../core/guide-curve.js';
import { guidePathToWorld } from '../../core/guide-curve.js';
import type { JunctionCrossSectionProfile, JunctionSide } from '../../course/junction-cross-section.js';
import {
  compileRouteBoundaryGateSet,
  type RouteBoundaryGateAuthoring,
  type RouteBoundaryGateSet,
} from '../../gameplay/route-boundary-gates.js';
import type { RouteDag } from '../../gameplay/route-dag.js';
import { STADIUM_JUNCTION } from './stadium-junction.js';

/**
 * Physical branch-choice gate inside the fully separated child roads.
 *
 * It is intentionally downstream of the first mathematically separated cross-section. This gives
 * an ordinary physical vehicle enough road distance to enter one complete child carriageway before
 * arbitration while still leaving a distinct gate -> PENDING -> handoff-seam interval.
 */
export const STADIUM_ROUTE_GATE_S = 570;

/** DEV terminal FINISH on the ordinary single-road section after the route has become terminal. */
export const STADIUM_FINISH_GATE_S = 20;

/**
 * Bind the detached route DAG to the actual visible junction in the shared world frame.
 *
 * This detached route fixture reuses the same physical split for both route stages:
 * - first forward crossing chooses STAGE_2_L / STAGE_2_R;
 * - another explicit crossing chooses one of the four terminal outcomes;
 * - the next physical FINISH crossing completes the route.
 *
 * This does not create a closing segment or award a lap. This is validation content only. Route authority remains the world-space crossing itself; no
 * steering value, screen X or raw chainage is inspected by the route validator.
 */
export function createStadiumRouteBoundaryGateSet(
  route: RouteDag,
  guide: GuidePath,
  junction: JunctionCrossSectionProfile = STADIUM_JUNCTION,
): RouteBoundaryGateSet {
  if (!(STADIUM_ROUTE_GATE_S > junction.authoring.sSeparatedStart)) {
    throw new Error('visible route gate must be after full junction separation');
  }
  if (!(STADIUM_ROUTE_GATE_S < guide.length)) {
    throw new RangeError('visible route gate must lie inside the DEV course');
  }
  if (!(STADIUM_FINISH_GATE_S > 0 && STADIUM_FINISH_GATE_S < junction.authoring.sWidenStart)) {
    throw new Error('DEV finish gate must lie on the ordinary single-road section');
  }

  const authoring: RouteBoundaryGateAuthoring[] = [
    createStadiumTransitionGate(guide, junction, 'G_VISIBLE_S1_LEFT', 'S1_LEFT', 'LEFT'),
    createStadiumTransitionGate(guide, junction, 'G_VISIBLE_S1_RIGHT', 'S1_RIGHT', 'RIGHT'),
    createStadiumTransitionGate(guide, junction, 'G_VISIBLE_S2L_LEFT', 'S2L_LEFT', 'LEFT'),
    createStadiumTransitionGate(guide, junction, 'G_VISIBLE_S2L_RIGHT', 'S2L_RIGHT', 'RIGHT'),
    createStadiumTransitionGate(guide, junction, 'G_VISIBLE_S2R_LEFT', 'S2R_LEFT', 'LEFT'),
    createStadiumTransitionGate(guide, junction, 'G_VISIBLE_S2R_RIGHT', 'S2R_RIGHT', 'RIGHT'),
  ];

  const finish = guidePathToWorld(guide, STADIUM_FINISH_GATE_S, 0);
  for (const stageId of ['GOAL_LL', 'GOAL_LR', 'GOAL_RL', 'GOAL_RR']) {
    authoring.push({
      id: `G_VISIBLE_FINISH_${stageId}`,
      kind: 'FINISH',
      stageId,
      center: { x: finish.x, z: finish.z },
      heading: finish.heading,
      halfWidth: junction.authoring.parentRoadWidth * 0.5,
    });
  }

  return compileRouteBoundaryGateSet(route, authoring);
}

export function createStadiumTransitionGate(
  guide: GuidePath,
  junction: JunctionCrossSectionProfile,
  id: string,
  choiceId: string,
  side: JunctionSide,
): RouteBoundaryGateAuthoring {
  const l = junction.separatedChildCenterL(side);
  const point = guidePathToWorld(guide, STADIUM_ROUTE_GATE_S, l);
  return {
    id,
    kind: 'TRANSITION',
    choiceId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: junction.authoring.childRoadWidth * 0.5,
  };
}
