import { compileRouteDag, type RouteDag } from '../gameplay/route-dag.js';

/** Small OutRun-style DEV graph used by route-boundary integration tests. */
export function createM6DebugRouteDag(): RouteDag {
  return compileRouteDag(
    'STAGE_1',
    [
      { id: 'STAGE_1', kind: 'STAGE' },
      { id: 'STAGE_2_L', kind: 'STAGE' },
      { id: 'STAGE_2_R', kind: 'STAGE' },
      { id: 'GOAL_LL', kind: 'TERMINAL' },
      { id: 'GOAL_LR', kind: 'TERMINAL' },
      { id: 'GOAL_RL', kind: 'TERMINAL' },
      { id: 'GOAL_RR', kind: 'TERMINAL' },
    ],
    [
      { id: 'S1_LEFT', fromStageId: 'STAGE_1', toStageId: 'STAGE_2_L' },
      { id: 'S1_RIGHT', fromStageId: 'STAGE_1', toStageId: 'STAGE_2_R' },
      { id: 'S2L_LEFT', fromStageId: 'STAGE_2_L', toStageId: 'GOAL_LL' },
      { id: 'S2L_RIGHT', fromStageId: 'STAGE_2_L', toStageId: 'GOAL_LR' },
      { id: 'S2R_LEFT', fromStageId: 'STAGE_2_R', toStageId: 'GOAL_RL' },
      { id: 'S2R_RIGHT', fromStageId: 'STAGE_2_R', toStageId: 'GOAL_RR' },
    ],
  );
}
