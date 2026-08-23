import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import type { GuideCurve } from '../core/guide-curve.js';
import {
  compileRouteBoundaryGateSet,
  type RouteBoundaryGateAuthoring,
  type RouteBoundaryGateSet,
} from '../gameplay/route-boundary-gates.js';
import { compileRouteDag, type RouteDag } from '../gameplay/route-dag.js';
import { guideChartToWorld, type GuideChart } from '../gameplay/guide-chart.js';
import {
  compileRouteStageHandoffManifest,
  type RouteStageHandoffManifest,
  type RouteStageHandoffSeamAuthoring,
} from '../gameplay/route-stage-handoff.js';
import {
  createRasterStageSuccessor,
  type RasterSuccessorRuntimeSource,
} from '../runtime/raster-stage-successor.js';
import { M6_13_JUNCTION } from './m6-13-junction.js';
import { M6_15_ROUTE_GATE_S } from './m6-15-visible-route-gates.js';
import { M6_17_HANDOFF_SEAM_S } from './m6-17-handoff-seams.js';
import {
  createM622ChildStageContinuation,
  type M622ChildStageContinuation,
  type M622ChildStageRuntimeSource,
} from './m6-22-child-stage-continuation.js';

const ROAD_HALF_WIDTH = 3.5;
const GROUND_HALF_WIDTH = 4.5;
const SHOULDER_WIDTH = 1;
const SUCCESSOR_SOURCE_SEAM_MIN_S = 340;
const SUCCESSOR_OVERLAP_MARGIN = 30;
const SUCCESSOR_TRANSITION_LEAD = 20;
const SUCCESSOR_FINISH_AFTER_SEAM = 150;
const SUCCESSOR_DEFORMATION_METERS = 3;
const GENTLE_TURN_LIMIT_DEGREES = 5;
const MIN_DEFORMATION_RUN_VERTICES = 5;
const SUCCESSOR_D_MAX = 150;
const FINISH_CLOSURE_MARGIN = 20;

export type M626SuccessorRuntimeSource = RasterSuccessorRuntimeSource;

export interface M626LiveContinuation {
  readonly base: M622ChildStageContinuation;
  readonly leftSuccessor: M626SuccessorRuntimeSource;
  readonly rightSuccessor: M626SuccessorRuntimeSource;
  readonly charts: readonly GuideChart[];
}

export function createM626LiveRouteDag(): RouteDag {
  return compileRouteDag(
    'STAGE_1',
    [
      { id: 'STAGE_1', kind: 'STAGE' },
      { id: 'STAGE_2_L', kind: 'STAGE' },
      { id: 'STAGE_2_R', kind: 'STAGE' },
      { id: 'GOAL_L', kind: 'TERMINAL' },
      { id: 'GOAL_R', kind: 'TERMINAL' },
    ],
    [
      { id: 'S1_LEFT', fromStageId: 'STAGE_1', toStageId: 'STAGE_2_L' },
      { id: 'S1_RIGHT', fromStageId: 'STAGE_1', toStageId: 'STAGE_2_R' },
      { id: 'S2L_CONTINUE', fromStageId: 'STAGE_2_L', toStageId: 'GOAL_L' },
      { id: 'S2R_CONTINUE', fromStageId: 'STAGE_2_R', toStageId: 'GOAL_R' },
    ],
  );
}

export function createM626LiveContinuation(parentGuide: GuideCurve): M626LiveContinuation {
  const base = createM622ChildStageContinuation(parentGuide);
  const leftSuccessor = createSuccessorSource(base.left, 'LEFT');
  const rightSuccessor = createSuccessorSource(base.right, 'RIGHT');
  const charts = Object.freeze([
    base.charts.parent,
    base.charts.left,
    base.charts.right,
    leftSuccessor.chart,
    rightSuccessor.chart,
  ]);
  return Object.freeze({ base, leftSuccessor, rightSuccessor, charts });
}

export function createM626LiveGateSet(route: RouteDag, continuation: M626LiveContinuation): RouteBoundaryGateSet {
  return compileRouteBoundaryGateSet(route, [
    parentTransitionGate(continuation, 'G_LIVE_LEFT', 'S1_LEFT', 'LEFT'),
    parentTransitionGate(continuation, 'G_LIVE_RIGHT', 'S1_RIGHT', 'RIGHT'),
    successorTransitionGate(continuation.leftSuccessor, 'G_LIVE_STAGE2_L', 'S2L_CONTINUE'),
    successorTransitionGate(continuation.rightSuccessor, 'G_LIVE_STAGE2_R', 'S2R_CONTINUE'),
    successorFinishGate(continuation.leftSuccessor, 'G_LIVE_FINISH_L', 'GOAL_L'),
    successorFinishGate(continuation.rightSuccessor, 'G_LIVE_FINISH_R', 'GOAL_R'),
  ]);
}

export function createM626LiveHandoffManifest(route: RouteDag, continuation: M626LiveContinuation): RouteStageHandoffManifest {
  const authoring: RouteStageHandoffSeamAuthoring[] = [
    parentHandoffSeam(continuation, 'S1_LEFT', continuation.base.charts.left, 'LEFT'),
    parentHandoffSeam(continuation, 'S1_RIGHT', continuation.base.charts.right, 'RIGHT'),
    successorHandoffSeam(continuation.leftSuccessor, 'S2L_CONTINUE'),
    successorHandoffSeam(continuation.rightSuccessor, 'S2R_CONTINUE'),
  ];
  return compileRouteStageHandoffManifest(route, continuation.charts, authoring);
}

function createSuccessorSource(
  source: M622ChildStageRuntimeSource,
  side: 'LEFT' | 'RIGHT',
): M626SuccessorRuntimeSource {
  const successor = createRasterStageSuccessor(source, {
    id: `${side}_CHILD_TO_SUCCESSOR`,
    chartId: `${side}_SUCCESSOR`,
    roadViewId: `${side}_SUCCESSOR_VIEW`,
    surfaceSectionName: `${side}_SUCCESSOR_STAGE`,
    sourceSeamMinS: SUCCESSOR_SOURCE_SEAM_MIN_S,
    overlapMargin: SUCCESSOR_OVERLAP_MARGIN,
    transitionLead: SUCCESSOR_TRANSITION_LEAD,
    finishAfterSeam: SUCCESSOR_FINISH_AFTER_SEAM,
    deformationMeters: SUCCESSOR_DEFORMATION_METERS,
    deformationDirection: side === 'LEFT' ? -1 : 1,
    gentleTurnLimitDegrees: GENTLE_TURN_LIMIT_DEGREES,
    minDeformationRunVertices: MIN_DEFORMATION_RUN_VERTICES,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
    dMax: SUCCESSOR_D_MAX,
    finishClosureMargin: FINISH_CLOSURE_MARGIN,
    groundHalfWidth: GROUND_HALF_WIDTH,
    roadHalfWidth: ROAD_HALF_WIDTH,
    shoulderWidth: SHOULDER_WIDTH,
  });
  if (!(successor.sourceTransitionS > 300)) {
    throw new Error(`M6.26 ${side} transition must occur after child terrain settles`);
  }
  return successor;
}

function parentTransitionGate(
  continuation: M626LiveContinuation,
  id: string,
  choiceId: string,
  side: 'LEFT' | 'RIGHT',
): RouteBoundaryGateAuthoring {
  const l = M6_13_JUNCTION.separatedChildCenterL(side);
  return transitionGateAuthoring(
    id,
    choiceId,
    guideChartToWorld(continuation.base.charts.parent, M6_15_ROUTE_GATE_S, l),
    ROAD_HALF_WIDTH,
  );
}

function successorTransitionGate(
  successor: M626SuccessorRuntimeSource,
  id: string,
  choiceId: string,
): RouteBoundaryGateAuthoring {
  return transitionGateAuthoring(
    id,
    choiceId,
    guideChartToWorld(successor.link.sourceFrame as GuideChart, successor.sourceTransitionS, 0),
    ROAD_HALF_WIDTH,
  );
}

function successorFinishGate(
  successor: M626SuccessorRuntimeSource,
  id: string,
  stageId: string,
): RouteBoundaryGateAuthoring {
  const point = guideChartToWorld(successor.chart, successor.finishS, 0);
  return {
    id,
    kind: 'FINISH',
    stageId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: ROAD_HALF_WIDTH,
  };
}

function parentHandoffSeam(
  continuation: M626LiveContinuation,
  choiceId: string,
  target: GuideChart,
  side: 'LEFT' | 'RIGHT',
): RouteStageHandoffSeamAuthoring {
  const l = M6_13_JUNCTION.separatedChildCenterL(side);
  const point = guideChartToWorld(continuation.base.charts.parent, M6_17_HANDOFF_SEAM_S, l);
  return {
    id: `H_${choiceId}`,
    choiceId,
    targetChartId: target.id,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: ROAD_HALF_WIDTH,
  };
}

function successorHandoffSeam(
  successor: M626SuccessorRuntimeSource,
  choiceId: string,
): RouteStageHandoffSeamAuthoring {
  const point = guideChartToWorld(successor.link.sourceFrame as GuideChart, successor.sourceSeamS, 0);
  return {
    id: `H_${choiceId}`,
    choiceId,
    targetChartId: successor.chart.id,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: ROAD_HALF_WIDTH,
  };
}

function transitionGateAuthoring(
  id: string,
  choiceId: string,
  point: { readonly x: number; readonly z: number; readonly heading: number },
  halfWidth: number,
): RouteBoundaryGateAuthoring {
  return {
    id,
    kind: 'TRANSITION',
    choiceId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth,
  };
}
