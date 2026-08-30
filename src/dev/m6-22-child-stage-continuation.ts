import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from '../core/presentation-scale.js';
import { compileRasterCourse, type RasterVertex } from '../core/course.js';
import { compileGuideCurve, guideCourseToWorld, type GuideCurve } from '../core/guide-curve.js';
import { tangentFromHeading, type Vec2 } from '../core/math.js';
import type { JunctionCrossSectionProfile } from '../course/junction-cross-section.js';
import { createStageRoadView, type StageRoadView } from '../course/stage-road-view.js';
import { createGuideChart, guideChartToWorld, type GuideChart } from '../gameplay/guide-chart.js';
import {
  compileRouteBoundaryGateSet,
  type RouteBoundaryGateAuthoring,
  type RouteBoundaryGateSet,
} from '../gameplay/route-boundary-gates.js';
import type { RouteDag } from '../gameplay/route-dag.js';
import {
  compileRouteStageHandoffManifest,
  type RouteStageHandoffManifest,
  type RouteStageHandoffSeamAuthoring,
} from '../gameplay/route-stage-handoff.js';
import { StageSurfaceMapView } from '../physics/stage-surface-map-view.js';
import { SurfaceMap, type SurfaceBand } from '../physics/surface-map.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import type { GroundMapProfile } from '../visual/ground-map.js';
import { HeightProfile } from '../visual/height-profile.js';
import { VisualProfile } from '../visual/visual-profile.js';
import { rgba } from '../render/software-surface.js';
import { M6_13_JUNCTION } from './m6-13-junction.js';
import { M6_15_ROUTE_GATE_S } from './m6-15-visible-route-gates.js';
import { M6_17_HANDOFF_SEAM_S } from './m6-17-handoff-seams.js';

export const M6_22_CHILD_FINISH_S = 250;

const CHILD_OVERLAP_BEHIND_METERS = 10;
const CHILD_OVERLAP_AHEAD_METERS = 60;

const CHILD_GROUND_HALF_WIDTH = 4.5;
const CHILD_ROAD_HALF_WIDTH = 3.5;
const CHILD_SHOULDER_WIDTH = 1;
const CHILD_CURVE_SAMPLES = 60;
const CHILD_ENTRY_STRAIGHT = 30;
const CHILD_CLOSE_LENGTH = 50;

export interface M622StageGuideCharts {
  readonly parent: GuideChart;
  readonly left: GuideChart;
  readonly right: GuideChart;
}

export interface M622ChildStageRuntimeSource {
  readonly guide: GuideCurve;
  readonly chart: GuideChart;
  readonly roadView: StageRoadView;
  readonly surfaceMap: StageSurfaceMapView;
  readonly heightProfile: HeightProfile;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: GroundMapProfile;
}

export interface M622ChildStageContinuation {
  readonly charts: M622StageGuideCharts;
  readonly left: M622ChildStageRuntimeSource;
  readonly right: M622ChildStageRuntimeSource;
  readonly parentSourceStartS: number;
  readonly handoffLocalS: number;
}

/**
 * Parent-stage physical split authority consumed by the reusable child-stage compiler.
 * The historical M6 fixture remains the default; later browser compositions may place the same
 * ordinary gate -> PENDING -> seam boundary on a different open parent Guide.
 */
export interface M622ParentForkGeometry {
  readonly junction: JunctionCrossSectionProfile;
  readonly routeGateS: number;
  readonly handoffSeamS: number;
  /** Omission preserves the historical M6 closed-back DEV child shape. */
  readonly childContinuation?: 'FORWARD_OPEN';
}

export const M6_22_PARENT_FORK_GEOMETRY: Readonly<M622ParentForkGeometry> = Object.freeze({
  junction: M6_13_JUNCTION,
  routeGateS: M6_15_ROUTE_GATE_S,
  handoffSeamS: M6_17_HANDOFF_SEAM_S,
});

interface ChildShape {
  readonly startHandle: number;
  readonly endHandle: number;
}

/**
 * Build two independent post-handoff Raster/Guide courses.
 *
 * Each child begins at the same parent raster vertex before the handoff seam and copies the parent
 * raster vertices through a point well after the seam. Therefore child chainage differs only by a
 * constant offset throughout the overlap, preserving the exact D_cam-behind camera geometry at
 * COMMIT. After the shared prefix each child owns a different long continuation and course length.
 */
export function createM622ChildStageContinuation(
  parentGuide: GuideCurve,
  fork: M622ParentForkGeometry = M6_22_PARENT_FORK_GEOMETRY,
): M622ChildStageContinuation {
  const parentRaster = parentGuide.raster;
  validateParentFork(parentGuide, fork);
  const overlap = selectChildOverlapVertices(parentGuide, fork.handoffSeamS);
  const parentSourceStartS = parentRaster.vertexS[overlap.startIndex]!;
  if (!(parentSourceStartS < fork.handoffSeamS - CURRENT_CAMERA_DISTANCE_METERS)) {
    throw new Error('M6.22 child source must begin more than D_cam before the handoff seam');
  }
  const sharedEndS = parentRaster.vertexS[overlap.endIndex]!;
  if (!(sharedEndS > fork.handoffSeamS + CURRENT_CAMERA_DISTANCE_METERS)) {
    throw new Error('M6.22 child source must remain shared beyond the handoff seam');
  }

  const leftGuide = createChildGuide(
    parentGuide,
    overlap,
    { startHandle: 250, endHandle: 200 },
    'LEFT',
    fork.childContinuation,
  );
  const rightGuide = createChildGuide(
    parentGuide,
    overlap,
    { startHandle: 300, endHandle: 250 },
    'RIGHT',
    fork.childContinuation,
  );
  const leftOrigin = fork.junction.separatedChildCenterL('LEFT');
  const rightOrigin = fork.junction.separatedChildCenterL('RIGHT');
  const charts: M622StageGuideCharts = Object.freeze({
    parent: createGuideChart('PARENT', parentGuide, 0),
    left: createGuideChart('LEFT_CHILD', leftGuide, leftOrigin),
    right: createGuideChart('RIGHT_CHILD', rightGuide, rightOrigin),
  });

  const left = createChildRuntimeSource(leftGuide, charts.left, 'LEFT', leftOrigin, parentSourceStartS);
  const right = createChildRuntimeSource(rightGuide, charts.right, 'RIGHT', rightOrigin, parentSourceStartS);
  const handoffLocalS = fork.handoffSeamS - parentSourceStartS;

  return Object.freeze({ charts, left, right, parentSourceStartS, handoffLocalS });
}

export function createM622RouteStageHandoffManifest(
  route: RouteDag,
  parentGuide: GuideCurve,
  continuation: M622ChildStageContinuation,
  fork: M622ParentForkGeometry = M6_22_PARENT_FORK_GEOMETRY,
): RouteStageHandoffManifest {
  const authoring: RouteStageHandoffSeamAuthoring[] = [
    handoffSeam(parentGuide, 'S1_LEFT', continuation.charts.left, continuation.handoffLocalS, fork),
    handoffSeam(parentGuide, 'S1_RIGHT', continuation.charts.right, continuation.handoffLocalS, fork),
  ];
  return compileRouteStageHandoffManifest(
    route,
    [continuation.charts.parent, continuation.charts.left, continuation.charts.right],
    authoring,
  );
}

export function createM622LivePointToPointGateSet(
  route: RouteDag,
  parentGuide: GuideCurve,
  continuation: M622ChildStageContinuation,
  fork: M622ParentForkGeometry = M6_22_PARENT_FORK_GEOMETRY,
): RouteBoundaryGateSet {
  if (!(fork.routeGateS > fork.junction.authoring.sSeparatedStart)) {
    throw new Error('M6.22 route gate must lie on fully separated parent roads');
  }
  if (!(M6_22_CHILD_FINISH_S > continuation.handoffLocalS)) {
    throw new Error('M6.22 child finish must occur after handoff in child-local chainage');
  }

  return compileRouteBoundaryGateSet(route, [
    transitionGate(parentGuide, 'G_LIVE_LEFT', 'S1_LEFT', 'LEFT', fork),
    transitionGate(parentGuide, 'G_LIVE_RIGHT', 'S1_RIGHT', 'RIGHT', fork),
    childFinishGate('G_LIVE_FINISH_L', 'GOAL_L', continuation.charts.left),
    childFinishGate('G_LIVE_FINISH_R', 'GOAL_R', continuation.charts.right),
  ]);
}

function createChildGuide(
  parentGuide: GuideCurve,
  overlap: { readonly startIndex: number; readonly endIndex: number },
  shape: ChildShape,
  side: 'LEFT' | 'RIGHT',
  continuationKind: M622ParentForkGeometry['childContinuation'],
): GuideCurve {
  const parentRaster = parentGuide.raster;
  const prefix = parentRaster.vertices
    .slice(overlap.startIndex, overlap.endIndex + 1)
    .map((vertex) => ({ ...vertex }));
  const divergence = prefix[prefix.length - 1]!;
  if (continuationKind === 'FORWARD_OPEN') {
    return createForwardOpenChildGuide(parentGuide, prefix, divergence, overlap.endIndex, side);
  }
  const start = prefix[0]!;
  const outgoingHeading = parentRaster.segments[overlap.endIndex]!.heading;
  const incomingStartHeading = parentRaster.segments[overlap.startIndex - 1]!.heading;
  const outgoingTangent = tangentFromHeading(outgoingHeading);
  const incomingStartTangent = tangentFromHeading(incomingStartHeading);

  const curveStart = addScaled(divergence, outgoingTangent, CHILD_ENTRY_STRAIGHT);
  const closeApproach = addScaled(start, incomingStartTangent, -CHILD_CLOSE_LENGTH);
  const control1 = addScaled(curveStart, outgoingTangent, shape.startHandle);
  const control2 = addScaled(closeApproach, incomingStartTangent, -shape.endHandle);
  const continuation: RasterVertex[] = [{ ...curveStart }];
  for (let i = 1; i <= CHILD_CURVE_SAMPLES; i += 1) {
    const t = i / CHILD_CURVE_SAMPLES;
    continuation.push(cubicBezier(curveStart, control1, control2, closeApproach, t));
  }

  const raster = compileRasterCourse([...prefix, ...continuation]);
  const guide = compileGuideCurve(raster, {
    lMax: parentGuide.lMax,
    mMin: parentGuide.mMin,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  if (!(guide.length > 300)) throw new Error('M6.22 child Guide must stay longer than 2*dMax');
  return guide;
}

function createForwardOpenChildGuide(
  parentGuide: GuideCurve,
  prefix: RasterVertex[],
  divergence: RasterVertex,
  sharedEndVertexIndex: number,
  side: 'LEFT' | 'RIGHT',
): GuideCurve {
  const turnSign = side === 'LEFT' ? -1 : 1;
  const continuation: RasterVertex[] = [];
  let heading = parentGuide.raster.segments[sharedEndVertexIndex]!.heading;
  let point = { ...divergence };
  const append = (length: number): void => {
    const tangent = tangentFromHeading(heading);
    point = addScaled(point, tangent, length);
    continuation.push({ ...point });
  };

  append(30);
  append(30);
  for (let step = 0; step < 12; step += 1) {
    heading += turnSign * 3 * Math.PI / 180;
    append(30);
  }
  const finalStraightLength = side === 'LEFT' ? 520 : 570;
  const straightSteps = Math.ceil(finalStraightLength / 50);
  for (let step = 0; step < straightSteps; step += 1) append(finalStraightLength / straightSteps);

  const raster = compileRasterCourse([...prefix, ...continuation]);
  const guide = compileGuideCurve(raster, {
    lMax: parentGuide.lMax,
    mMin: parentGuide.mMin,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  if (!(guide.length > 700)) throw new Error('forward child Guide must retain successor runout');
  return guide;
}

function createChildRuntimeSource(
  guide: GuideCurve,
  chart: GuideChart,
  side: 'LEFT' | 'RIGHT',
  sourceLateralOrigin: number,
  chainageOffsetS: number,
): M622ChildStageRuntimeSource {
  const roadView = createStageRoadView({
    id: `${side}_CHILD_CONTINUATION_VIEW`,
    sourceLateralOrigin,
    groundLeft: CHILD_GROUND_HALF_WIDTH,
    groundRight: CHILD_GROUND_HALF_WIDTH,
    roadLeft: CHILD_ROAD_HALF_WIDTH,
    roadRight: CHILD_ROAD_HALF_WIDTH,
    shoulderWidth: CHILD_SHOULDER_WIDTH,
  });
  const sourceSurfaceMap = new SurfaceMap(guide.length, [{
    sStart: 0,
    name: `${side}_CHILD_STAGE`,
    bands: childSurfaceBands(sourceLateralOrigin),
  }]);
  const surfaceMap = new StageSurfaceMapView(sourceSurfaceMap, roadView);
  const heightProfile = new HeightProfile(guide.length, [
    { s: 0, y: 0 },
    { s: guide.length * 0.5, y: 0 },
    { s: guide.length, y: 0 },
  ]);
  const visualProfile = new VisualProfile(guide.length, [{
    sStart: 0,
    name: `${side}_CHILD_STAGE`,
    groundBaseLeft: { kind: 'color', color: rgba(39, 88, 46) },
    groundBaseRight: { kind: 'color', color: rgba(45, 100, 53) },
  }]);
  const groundProfile: GroundMapProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: CHILD_ROAD_HALF_WIDTH,
    roadRight: CHILD_ROAD_HALF_WIDTH,
    shoulderWidth: CHILD_SHOULDER_WIDTH,
    roadCenterL: sourceLateralOrigin,
    chainageOffsetS,
  };
  const terrainProfile: TerrainVisualProfile = {
    screenHeight: 240,
    dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
    dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
    groundLeft: 12,
    groundRight: 12,
    roadLeft: CHILD_ROAD_HALF_WIDTH,
    roadRight: CHILD_ROAD_HALF_WIDTH,
    height: heightProfile,
    visual: visualProfile,
    thinSpanScreenRows: 1,
  };

  return Object.freeze({
    guide,
    chart,
    roadView,
    surfaceMap,
    heightProfile,
    terrainProfile,
    groundProfile,
  });
}

function childSurfaceBands(origin: number): SurfaceBand[] {
  return [
    { lMin: origin - CHILD_GROUND_HALF_WIDTH, lMax: origin - CHILD_ROAD_HALF_WIDTH, type: 'SHOULDER' },
    { lMin: origin - CHILD_ROAD_HALF_WIDTH, lMax: origin + CHILD_ROAD_HALF_WIDTH, type: 'ASPHALT' },
    { lMin: origin + CHILD_ROAD_HALF_WIDTH, lMax: origin + CHILD_GROUND_HALF_WIDTH, type: 'SHOULDER' },
  ];
}

function handoffSeam(
  parentGuide: GuideCurve,
  choiceId: string,
  target: GuideChart,
  targetSeamS: number,
  fork: M622ParentForkGeometry,
): RouteStageHandoffSeamAuthoring {
  const side = choiceId === 'S1_LEFT' ? 'LEFT' : 'RIGHT';
  const l = fork.junction.separatedChildCenterL(side);
  const point = guideCourseToWorld(parentGuide, fork.handoffSeamS, l);
  return {
    id: `H_${choiceId}`,
    choiceId,
    targetChartId: target.id,
    sourceSeamS: fork.handoffSeamS,
    targetSeamS,
    sourceLocalL: l,
    targetLocalL: 0,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: fork.junction.authoring.childRoadWidth * 0.5,
  };
}

function transitionGate(
  parentGuide: GuideCurve,
  id: string,
  choiceId: string,
  side: 'LEFT' | 'RIGHT',
  fork: M622ParentForkGeometry,
): RouteBoundaryGateAuthoring {
  const l = fork.junction.separatedChildCenterL(side);
  const point = guideCourseToWorld(parentGuide, fork.routeGateS, l);
  return {
    id,
    kind: 'TRANSITION',
    choiceId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: fork.junction.authoring.childRoadWidth * 0.5,
  };
}

function childFinishGate(id: string, stageId: string, chart: GuideChart): RouteBoundaryGateAuthoring {
  const point = guideChartToWorld(chart, M6_22_CHILD_FINISH_S, 0);
  return {
    id,
    kind: 'FINISH',
    stageId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: CHILD_ROAD_HALF_WIDTH,
  };
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

function selectChildOverlapVertices(
  parentGuide: GuideCurve,
  handoffSeamS: number,
): { readonly startIndex: number; readonly endIndex: number } {
  const vertexS = parentGuide.raster.vertexS;
  const startTargetS = handoffSeamS - CHILD_OVERLAP_BEHIND_METERS;
  const endTargetS = handoffSeamS + CHILD_OVERLAP_AHEAD_METERS;
  let startIndex = -1;
  let endIndex = -1;

  for (let index = 1; index < vertexS.length - 1; index += 1) {
    if (vertexS[index]! <= startTargetS) startIndex = index;
    if (endIndex < 0 && vertexS[index]! >= endTargetS) endIndex = index;
  }
  if (startIndex < 1 || endIndex < 0 || endIndex <= startIndex) {
    throw new RangeError('M6.22 parent raster cannot provide the required handoff overlap');
  }
  return Object.freeze({ startIndex, endIndex });
}

function validateParentFork(parentGuide: GuideCurve, fork: M622ParentForkGeometry): void {
  if (!(fork.routeGateS > fork.junction.authoring.sSeparatedStart)) {
    throw new RangeError('parent route gate must lie on fully separated child roads');
  }
  if (!(fork.handoffSeamS > fork.routeGateS)) {
    throw new RangeError('parent handoff seam must follow the physical route gate');
  }
  if (!(fork.handoffSeamS + CHILD_OVERLAP_AHEAD_METERS < parentGuide.length)) {
    throw new RangeError('parent Guide must continue beyond the handoff overlap');
  }
}
