import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { compileRasterCourse, type RasterVertex } from '../core/course.js';
import { compileGuideCurve, type GuideCurve } from '../core/guide-curve.js';
import { tangentFromHeading, type Vec2 } from '../core/math.js';
import { createStageRoadView, type StageRoadView } from '../course/stage-road-view.js';
import {
  compileRouteBoundaryGateSet,
  type RouteBoundaryGateAuthoring,
  type RouteBoundaryGateSet,
} from '../gameplay/route-boundary-gates.js';
import { compileRouteDag, type RouteDag } from '../gameplay/route-dag.js';
import { createGuideChart, guideChartToWorld, type GuideChart } from '../gameplay/guide-chart.js';
import {
  compileRouteStageHandoffManifest,
  type RouteStageHandoffManifest,
  type RouteStageHandoffSeamAuthoring,
} from '../gameplay/route-stage-handoff.js';
import { StageSurfaceMapView } from '../physics/stage-surface-map-view.js';
import { CyclicSurfaceMap, type SurfaceBand } from '../physics/surface-map.js';
import {
  compileStageContinuationLink,
  type StageContinuationLink,
} from '../runtime/stage-continuation-link.js';
import type { GroundMapProfile } from '../visual/ground-map.js';
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
const SUCCESSOR_ENTRY_STRAIGHT = 35;
const SUCCESSOR_CLOSE_LENGTH = 55;
const SUCCESSOR_CURVE_SAMPLES = 64;

export interface M626SuccessorRuntimeSource {
  readonly guide: GuideCurve;
  readonly chart: GuideChart;
  readonly roadView: StageRoadView;
  readonly surfaceMap: StageSurfaceMapView;
  readonly groundProfile: GroundMapProfile;
  readonly link: StageContinuationLink;
  readonly sourceTransitionS: number;
  readonly sourceSeamS: number;
  readonly targetSeamS: number;
  readonly finishS: number;
}

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

export function createM626LiveGateSet(
  route: RouteDag,
  continuation: M626LiveContinuation,
): RouteBoundaryGateSet {
  return compileRouteBoundaryGateSet(route, [
    parentTransitionGate(continuation, 'G_LIVE_LEFT', 'S1_LEFT', 'LEFT'),
    parentTransitionGate(continuation, 'G_LIVE_RIGHT', 'S1_RIGHT', 'RIGHT'),
    successorTransitionGate(continuation.leftSuccessor, 'G_LIVE_STAGE2_L', 'S2L_CONTINUE'),
    successorTransitionGate(continuation.rightSuccessor, 'G_LIVE_STAGE2_R', 'S2R_CONTINUE'),
    successorFinishGate(continuation.leftSuccessor, 'G_LIVE_FINISH_L', 'GOAL_L'),
    successorFinishGate(continuation.rightSuccessor, 'G_LIVE_FINISH_R', 'GOAL_R'),
  ]);
}

export function createM626LiveHandoffManifest(
  route: RouteDag,
  continuation: M626LiveContinuation,
): RouteStageHandoffManifest {
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
  const raster = source.guide.raster;
  const seamIndex = raster.vertexS.findIndex((s) => s >= SUCCESSOR_SOURCE_SEAM_MIN_S);
  if (seamIndex < 0) throw new RangeError(`M6.26 ${side} child is too short for successor seam`);
  const sourceSeamS = raster.vertexS[seamIndex]!;
  const sourceStartIndex = findLastVertexAtOrBefore(raster.vertexS, sourceSeamS - SUCCESSOR_OVERLAP_MARGIN);
  const sharedEndIndex = raster.vertexS.findIndex((s, index) => index > seamIndex && s >= sourceSeamS + SUCCESSOR_OVERLAP_MARGIN);
  if (sourceStartIndex <= 0 || sharedEndIndex < 0) {
    throw new RangeError(`M6.26 ${side} child lacks successor overlap envelope`);
  }

  const prefix = raster.vertices.slice(sourceStartIndex, sharedEndIndex + 1).map((vertex) => ({ ...vertex }));
  const divergence = prefix[prefix.length - 1]!;
  const start = prefix[0]!;
  const outgoingHeading = raster.segments[sharedEndIndex]!.heading;
  const incomingStartHeading = raster.segments[sourceStartIndex - 1]!.heading;
  const outgoingTangent = tangentFromHeading(outgoingHeading);
  const incomingStartTangent = tangentFromHeading(incomingStartHeading);
  const curveStart = addScaled(divergence, outgoingTangent, SUCCESSOR_ENTRY_STRAIGHT);
  const closeApproach = addScaled(start, incomingStartTangent, -SUCCESSOR_CLOSE_LENGTH);
  const sideFactor = side === 'LEFT' ? 1 : -1;
  const control1 = addScaled(curveStart, outgoingTangent, 260 + sideFactor * 25);
  const control2 = addScaled(closeApproach, incomingStartTangent, -(220 - sideFactor * 20));
  const continuation: RasterVertex[] = [{ ...curveStart }];
  for (let i = 1; i <= SUCCESSOR_CURVE_SAMPLES; i += 1) {
    continuation.push(cubicBezier(curveStart, control1, control2, closeApproach, i / SUCCESSOR_CURVE_SAMPLES));
  }

  const successorRaster = compileRasterCourse([...prefix, ...continuation]);
  const guide = compileGuideCurve(successorRaster, {
    lMax: source.guide.lMax,
    mMin: source.guide.mMin,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  if (!(guide.length > 2 * 150)) throw new Error(`M6.26 ${side} successor Guide must exceed 2*dMax`);

  const origin = source.chart.lateralOrigin;
  const chart = createGuideChart(`${side}_SUCCESSOR`, guide, origin);
  const roadView = createStageRoadView({
    id: `${side}_SUCCESSOR_VIEW`,
    sourceLateralOrigin: origin,
    groundLeft: GROUND_HALF_WIDTH,
    groundRight: GROUND_HALF_WIDTH,
    roadLeft: ROAD_HALF_WIDTH,
    roadRight: ROAD_HALF_WIDTH,
    shoulderWidth: SHOULDER_WIDTH,
  });
  const sourceSurfaceMap = new CyclicSurfaceMap(guide.length, [{
    sStart: 0,
    name: `${side}_SUCCESSOR_STAGE`,
    bands: childSurfaceBands(origin),
  }]);
  const surfaceMap = new StageSurfaceMapView(sourceSurfaceMap, roadView);
  const sourceStartS = raster.vertexS[sourceStartIndex]!;
  const groundProfile: GroundMapProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: ROAD_HALF_WIDTH,
    roadRight: ROAD_HALF_WIDTH,
    shoulderWidth: SHOULDER_WIDTH,
    roadCenterL: origin,
    chainageOffsetS: (source.groundProfile.chainageOffsetS ?? 0) + sourceStartS,
  };

  const targetSeamIndex = seamIndex - sourceStartIndex;
  const targetSeamS = successorRaster.vertexS[targetSeamIndex]!;
  const link = compileStageContinuationLink({
    id: `${side}_CHILD_TO_SUCCESSOR`,
    sourceFrame: source.chart,
    targetFrame: chart,
    sourceSeamS,
    targetSeamS,
    sourceLocalL: 0,
    targetLocalL: 0,
    overlapBehind: CURRENT_CAMERA_DISTANCE_METERS,
    overlapAhead: CURRENT_CAMERA_DISTANCE_METERS,
  });
  const sourceTransitionS = sourceSeamS - SUCCESSOR_TRANSITION_LEAD;
  const finishS = targetSeamS + SUCCESSOR_FINISH_AFTER_SEAM;
  if (!(sourceTransitionS > 300)) throw new Error(`M6.26 ${side} transition must occur after child terrain settles`);
  if (!(finishS < guide.length - 20)) throw new Error(`M6.26 ${side} finish must precede successor closure seam`);

  return Object.freeze({
    guide,
    chart,
    roadView,
    surfaceMap,
    groundProfile,
    link,
    sourceTransitionS,
    sourceSeamS,
    targetSeamS,
    finishS,
  });
}

function parentTransitionGate(
  continuation: M626LiveContinuation,
  id: string,
  choiceId: string,
  side: 'LEFT' | 'RIGHT',
): RouteBoundaryGateAuthoring {
  const l = M6_13_JUNCTION.separatedChildCenterL(side);
  const point = guideChartToWorld(continuation.base.charts.parent, M6_15_ROUTE_GATE_S, l);
  return transitionGateAuthoring(id, choiceId, point, ROAD_HALF_WIDTH);
}

function successorTransitionGate(
  successor: M626SuccessorRuntimeSource,
  id: string,
  choiceId: string,
): RouteBoundaryGateAuthoring {
  const point = guideChartToWorld(successor.link.sourceFrame as GuideChart, successor.sourceTransitionS, 0);
  return transitionGateAuthoring(id, choiceId, point, ROAD_HALF_WIDTH);
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

function childSurfaceBands(origin: number): SurfaceBand[] {
  return [
    { lMin: origin - GROUND_HALF_WIDTH, lMax: origin - ROAD_HALF_WIDTH, type: 'SHOULDER' },
    { lMin: origin - ROAD_HALF_WIDTH, lMax: origin + ROAD_HALF_WIDTH, type: 'ASPHALT' },
    { lMin: origin + ROAD_HALF_WIDTH, lMax: origin + GROUND_HALF_WIDTH, type: 'SHOULDER' },
  ];
}

function findLastVertexAtOrBefore(values: readonly number[], target: number): number {
  let found = -1;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i]! <= target) found = i;
    else break;
  }
  return found;
}

function addScaled(point: Vec2, direction: Vec2, scale: number): Vec2 {
  return { x: point.x + direction.x * scale, z: point.z + direction.z * scale };
}

function cubicBezier(a: Vec2, b: Vec2, c: Vec2, d: Vec2, t: number): RasterVertex {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    z: u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z,
  };
}
