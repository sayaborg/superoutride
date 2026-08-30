import {
  compileRouteBoundaryGateSet,
  type RouteBoundaryGateSet,
} from '../gameplay/route-boundary-gates.js';
import type { RouteDag } from '../gameplay/route-dag.js';

/** World-space gate geometry for the detached M6 DEV route graph. */
export function createM6DebugRouteBoundaryGateSet(route: RouteDag): RouteBoundaryGateSet {
  return compileRouteBoundaryGateSet(route, [
    { id: 'G_S1_LEFT', kind: 'TRANSITION', choiceId: 'S1_LEFT', center: { x: -3, z: 10 }, heading: 0, halfWidth: 2 },
    { id: 'G_S1_RIGHT', kind: 'TRANSITION', choiceId: 'S1_RIGHT', center: { x: 3, z: 10 }, heading: 0, halfWidth: 2 },
    { id: 'G_S2L_LEFT', kind: 'TRANSITION', choiceId: 'S2L_LEFT', center: { x: -7, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'G_S2L_RIGHT', kind: 'TRANSITION', choiceId: 'S2L_RIGHT', center: { x: -2, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'G_S2R_LEFT', kind: 'TRANSITION', choiceId: 'S2R_LEFT', center: { x: 2, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'G_S2R_RIGHT', kind: 'TRANSITION', choiceId: 'S2R_RIGHT', center: { x: 7, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'G_GOAL_LL', kind: 'FINISH', stageId: 'GOAL_LL', center: { x: -8, z: 30 }, heading: 0, halfWidth: 2 },
    { id: 'G_GOAL_LR', kind: 'FINISH', stageId: 'GOAL_LR', center: { x: -3, z: 30 }, heading: 0, halfWidth: 2 },
    { id: 'G_GOAL_RL', kind: 'FINISH', stageId: 'GOAL_RL', center: { x: 3, z: 30 }, heading: 0, halfWidth: 2 },
    { id: 'G_GOAL_RR', kind: 'FINISH', stageId: 'GOAL_RR', center: { x: 8, z: 30 }, heading: 0, halfWidth: 2 },
  ]);
}
