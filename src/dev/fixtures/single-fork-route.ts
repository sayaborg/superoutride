import { guidePathToWorld, type GuidePath } from '../../core/guide-curve.js';
import type { JunctionCrossSectionProfile, JunctionSide } from '../../course/junction-cross-section.js';
import {
  compileRouteBoundaryGateSet,
  type RouteBoundaryGateAuthoring,
  type RouteBoundaryGateSet,
} from '../../gameplay/route-boundary-gates.js';
import { compileRouteDag, type RouteDag } from '../../gameplay/route-dag.js';
import { STADIUM_HANDOFF_SEAM_S } from '../courses/stadium-handoff.js';
import { STADIUM_JUNCTION } from '../courses/stadium-junction.js';
import { createStadiumTransitionGate, STADIUM_ROUTE_GATE_S } from '../courses/stadium-route-gates.js';

export const SINGLE_FORK_FINISH_GATE_S = 700;

export function createSingleForkRouteDag(): RouteDag {
  return compileRouteDag(
    'STAGE_1',
    [
      { id: 'STAGE_1', kind: 'STAGE' },
      { id: 'GOAL_L', kind: 'TERMINAL' },
      { id: 'GOAL_R', kind: 'TERMINAL' },
    ],
    [
      { id: 'S1_LEFT', fromStageId: 'STAGE_1', toStageId: 'GOAL_L' },
      { id: 'S1_RIGHT', fromStageId: 'STAGE_1', toStageId: 'GOAL_R' },
    ],
  );
}

export function createSingleForkGateSet(
  route: RouteDag,
  guide: GuidePath,
  junction: JunctionCrossSectionProfile = STADIUM_JUNCTION,
): RouteBoundaryGateSet {
  if (!(STADIUM_ROUTE_GATE_S > junction.authoring.sSeparatedStart)) {
    throw new Error('live route gate must lie on fully separated child roads');
  }
  if (!(SINGLE_FORK_FINISH_GATE_S > STADIUM_HANDOFF_SEAM_S)) {
    throw new Error('live finish must be after the child handoff seam');
  }
  if (!(SINGLE_FORK_FINISH_GATE_S < guide.length)) {
    throw new RangeError('live finish must occur before the open DEV course endpoint');
  }

  return compileRouteBoundaryGateSet(route, [
    createStadiumTransitionGate(guide, junction, 'G_LIVE_LEFT', 'S1_LEFT', 'LEFT'),
    createStadiumTransitionGate(guide, junction, 'G_LIVE_RIGHT', 'S1_RIGHT', 'RIGHT'),
    finishGate(guide, junction, 'G_LIVE_FINISH_L', 'GOAL_L', 'LEFT'),
    finishGate(guide, junction, 'G_LIVE_FINISH_R', 'GOAL_R', 'RIGHT'),
  ]);
}

function finishGate(
  guide: GuidePath,
  junction: JunctionCrossSectionProfile,
  id: string,
  stageId: string,
  side: JunctionSide,
): RouteBoundaryGateAuthoring {
  const l = junction.separatedChildCenterL(side);
  const point = guidePathToWorld(guide, SINGLE_FORK_FINISH_GATE_S, l);
  return {
    id,
    kind: 'FINISH',
    stageId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: junction.authoring.childRoadWidth * 0.5,
  };
}
