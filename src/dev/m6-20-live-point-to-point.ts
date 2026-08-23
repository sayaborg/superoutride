import { guideCourseToWorld, type GuideCurve } from '../core/guide-curve.js';
import type { JunctionCrossSectionProfile, JunctionSide } from '../course/junction-cross-section.js';
import { compileRouteBoundaryGateSet, type RouteBoundaryGateAuthoring, type RouteBoundaryGateSet } from '../gameplay/route-boundary-gates.js';
import { compileRouteDag, type RouteDag } from '../gameplay/route-dag.js';
import { M6_13_JUNCTION } from './m6-13-junction.js';
import { M6_15_ROUTE_GATE_S } from './m6-15-visible-route-gates.js';
import { M6_17_HANDOFF_SEAM_S } from './m6-17-handoff-seams.js';

export const M6_20_FINISH_GATE_S = 700;

export function createM620LivePointToPointRouteDag(): RouteDag {
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

export function createM620LivePointToPointGateSet(
  route: RouteDag,
  guide: GuideCurve,
  junction: JunctionCrossSectionProfile = M6_13_JUNCTION,
): RouteBoundaryGateSet {
  if (!(M6_15_ROUTE_GATE_S > junction.authoring.sSeparatedStart)) {
    throw new Error('live route gate must lie on fully separated child roads');
  }
  if (!(M6_20_FINISH_GATE_S > M6_17_HANDOFF_SEAM_S)) {
    throw new Error('live finish must be after the child handoff seam');
  }
  if (!(M6_20_FINISH_GATE_S < guide.length)) {
    throw new RangeError('live finish must occur before the closed DEV course seam');
  }

  return compileRouteBoundaryGateSet(route, [
    transitionGate(guide, junction, 'G_LIVE_LEFT', 'S1_LEFT', 'LEFT'),
    transitionGate(guide, junction, 'G_LIVE_RIGHT', 'S1_RIGHT', 'RIGHT'),
    finishGate(guide, junction, 'G_LIVE_FINISH_L', 'GOAL_L', 'LEFT'),
    finishGate(guide, junction, 'G_LIVE_FINISH_R', 'GOAL_R', 'RIGHT'),
  ]);
}

function transitionGate(
  guide: GuideCurve,
  junction: JunctionCrossSectionProfile,
  id: string,
  choiceId: string,
  side: JunctionSide,
): RouteBoundaryGateAuthoring {
  const l = junction.separatedChildCenterL(side);
  const point = guideCourseToWorld(guide, M6_15_ROUTE_GATE_S, l);
  return {
    id,
    kind: 'TRANSITION',
    choiceId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: junction.authoring.childRoadWidth * 0.5,
  };
}

function finishGate(
  guide: GuideCurve,
  junction: JunctionCrossSectionProfile,
  id: string,
  stageId: string,
  side: JunctionSide,
): RouteBoundaryGateAuthoring {
  const l = junction.separatedChildCenterL(side);
  const point = guideCourseToWorld(guide, M6_20_FINISH_GATE_S, l);
  return {
    id,
    kind: 'FINISH',
    stageId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: junction.authoring.childRoadWidth * 0.5,
  };
}
