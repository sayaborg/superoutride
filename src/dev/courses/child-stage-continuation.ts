import { createTerrainVisualProfile } from '../../runtime/stage-authoring-compiler.js';
import { compileGuidePath, guidePathToWorld, type GuidePath } from '../../core/guide-curve.js';
import { HeightProfile } from '../../core/height-profile.js';
import { tangentFromHeading, type Vec2 } from '../../core/math.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../../core/presentation-scale.js';
import { compileRasterPath, type RasterVertex } from '../../core/raster-path.js';
import type { JunctionCrossSectionProfile } from '../../course/junction-cross-section.js';
import { createStageRoadView, type StageRoadView } from '../../course/stage-road-view.js';
import { createGuideChart, guideChartToWorld, type GuideChart } from '../../gameplay/guide-chart.js';
import {
  compileRouteBoundaryGateSet,
  type RouteBoundaryGateAuthoring,
  type RouteBoundaryGateSet,
} from '../../gameplay/route-boundary-gates.js';
import type { RouteDag } from '../../gameplay/route-dag.js';
import {
  compileRouteStageHandoffManifest,
  type RouteStageHandoffManifest,
  type RouteStageHandoffSeamAuthoring,
} from '../../gameplay/route-stage-handoff.js';
import { rgba } from '../../graphics/software-surface.js';
import type { GroundMapProfile } from '../../groundmap/ground-map.js';
import { StageSurfaceMapView } from '../../physics/stage-surface-map-view.js';
import { SurfaceMap, type SurfaceBand } from '../../physics/surface-map.js';
import type { TerrainVisualProfile } from '../../road/terrain-line.js';
import { VisualProfile } from '../../visual/visual-profile.js';
import { STADIUM_HANDOFF_SEAM_S } from './stadium-handoff.js';
import { STADIUM_JUNCTION } from './stadium-junction.js';
import { STADIUM_ROUTE_GATE_S } from './stadium-route-gates.js';
import { CENTER_DASH_MARKINGS } from './stadium-surface-authoring.js';

export const CHILD_FINISH_S = 250;

const CHILD_OVERLAP_BEHIND_METERS = 10;
const CHILD_OVERLAP_AHEAD_METERS = 60;

const CHILD_GROUND_HALF_WIDTH = 4.5;
const CHILD_ROAD_HALF_WIDTH = 3.5;
const CHILD_SHOULDER_WIDTH = 1;

interface StageGuideCharts {
  readonly parent: GuideChart;
  readonly left: GuideChart;
  readonly right: GuideChart;
}

export interface ChildStageRuntimeSource {
  readonly guide: GuidePath;
  readonly chart: GuideChart;
  readonly roadView: StageRoadView;
  readonly surfaceMap: StageSurfaceMapView;
  readonly heightProfile: HeightProfile;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: GroundMapProfile;
}

export interface ChildStageContinuation {
  readonly charts: StageGuideCharts;
  readonly left: ChildStageRuntimeSource;
  readonly right: ChildStageRuntimeSource;
  readonly parentSourceStartS: number;
  readonly handoffLocalS: number;
}

/**
 * Parent-stage physical split authority consumed by the reusable child-stage compiler.
 * Authored junction, gate and seam positions determine the shared overlap on the parent Guide.
 */
export interface ParentForkGeometry {
  readonly junction: JunctionCrossSectionProfile;
  readonly routeGateS: number;
  readonly handoffSeamS: number;
}

export const PARENT_FORK_GEOMETRY: Readonly<ParentForkGeometry> = Object.freeze({
  junction: STADIUM_JUNCTION,
  routeGateS: STADIUM_ROUTE_GATE_S,
  handoffSeamS: STADIUM_HANDOFF_SEAM_S,
});

/**
 * Build two independent post-handoff Raster/Guide courses.
 *
 * Each child begins at the same parent raster vertex before the handoff seam and copies the parent
 * raster vertices through a point well after the seam. Therefore child chainage differs only by a
 * constant offset throughout the overlap, preserving the exact D_cam-behind camera geometry at
 * COMMIT. After the shared prefix each child owns a different long continuation and course length.
 */
export function createChildStageContinuation(
  parentGuide: GuidePath,
  fork: ParentForkGeometry = PARENT_FORK_GEOMETRY,
): ChildStageContinuation {
  const parentRaster = parentGuide.raster;
  validateParentFork(parentGuide, fork);
  const overlap = selectChildOverlapVertices(parentGuide, fork.handoffSeamS);
  const parentSourceStartS = parentRaster.vertexS[overlap.startIndex]!;
  if (!(parentSourceStartS < fork.handoffSeamS - CURRENT_CAMERA_DISTANCE_METERS)) {
    throw new Error('child source must begin more than D_cam before the handoff seam');
  }
  const sharedEndS = parentRaster.vertexS[overlap.endIndex]!;
  if (!(sharedEndS > fork.handoffSeamS + CURRENT_CAMERA_DISTANCE_METERS)) {
    throw new Error('child source must remain shared beyond the handoff seam');
  }

  const leftGuide = createChildGuide(parentGuide, overlap, 'LEFT');
  const rightGuide = createChildGuide(parentGuide, overlap, 'RIGHT');
  const leftOrigin = fork.junction.separatedChildCenterL('LEFT');
  const rightOrigin = fork.junction.separatedChildCenterL('RIGHT');
  const charts: StageGuideCharts = Object.freeze({
    parent: createGuideChart('PARENT', parentGuide, 0),
    left: createGuideChart('LEFT_CHILD', leftGuide, leftOrigin),
    right: createGuideChart('RIGHT_CHILD', rightGuide, rightOrigin),
  });

  const left = createChildRuntimeSource(leftGuide, charts.left, 'LEFT', leftOrigin, parentSourceStartS);
  const right = createChildRuntimeSource(rightGuide, charts.right, 'RIGHT', rightOrigin, parentSourceStartS);
  const handoffLocalS = fork.handoffSeamS - parentSourceStartS;

  return Object.freeze({ charts, left, right, parentSourceStartS, handoffLocalS });
}

export function createRouteStageHandoffManifest(
  route: RouteDag,
  parentGuide: GuidePath,
  continuation: ChildStageContinuation,
  fork: ParentForkGeometry = PARENT_FORK_GEOMETRY,
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

export function createLivePointToPointGateSet(
  route: RouteDag,
  parentGuide: GuidePath,
  continuation: ChildStageContinuation,
  fork: ParentForkGeometry = PARENT_FORK_GEOMETRY,
): RouteBoundaryGateSet {
  if (!(fork.routeGateS > fork.junction.authoring.sSeparatedStart)) {
    throw new Error('route gate must lie on fully separated parent roads');
  }
  if (!(CHILD_FINISH_S > continuation.handoffLocalS)) {
    throw new Error('child finish must occur after handoff in child-local chainage');
  }

  return compileRouteBoundaryGateSet(route, [
    transitionGate(parentGuide, 'G_LIVE_LEFT', 'S1_LEFT', 'LEFT', fork),
    transitionGate(parentGuide, 'G_LIVE_RIGHT', 'S1_RIGHT', 'RIGHT', fork),
    childFinishGate('G_LIVE_FINISH_L', 'GOAL_L', continuation.charts.left),
    childFinishGate('G_LIVE_FINISH_R', 'GOAL_R', continuation.charts.right),
  ]);
}

function createChildGuide(
  parentGuide: GuidePath,
  overlap: { readonly startIndex: number; readonly endIndex: number },
  side: 'LEFT' | 'RIGHT',
): GuidePath {
  const parentRaster = parentGuide.raster;
  const prefix = parentRaster.vertices.slice(overlap.startIndex, overlap.endIndex + 1).map((vertex) => ({ ...vertex }));
  const divergence = prefix[prefix.length - 1]!;
  const turnSign = side === 'LEFT' ? -1 : 1;
  const continuation: RasterVertex[] = [];
  let heading = parentRaster.segments[overlap.endIndex]!.heading;
  let point = { ...divergence };
  const append = (length: number): void => {
    const tangent = tangentFromHeading(heading);
    point = addScaled(point, tangent, length);
    continuation.push({ ...point });
  };

  append(30);
  append(30);
  for (let step = 0; step < 12; step += 1) {
    heading += (turnSign * 3 * Math.PI) / 180;
    append(30);
  }
  const finalStraightLength = side === 'LEFT' ? 520 : 570;
  const straightSteps = Math.ceil(finalStraightLength / 50);
  for (let step = 0; step < straightSteps; step += 1) append(finalStraightLength / straightSteps);

  const raster = compileRasterPath([...prefix, ...continuation]);
  const guide = compileGuidePath(raster, {
    lMax: parentGuide.lMax,
    mMin: parentGuide.mMin,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  return guide;
}

function createChildRuntimeSource(
  guide: GuidePath,
  chart: GuideChart,
  side: 'LEFT' | 'RIGHT',
  sourceLateralOrigin: number,
  chainageOffsetS: number,
): ChildStageRuntimeSource {
  const roadView = createStageRoadView({
    id: `${side}_CHILD_CONTINUATION_VIEW`,
    sourceLateralOrigin,
    groundLeft: CHILD_GROUND_HALF_WIDTH,
    groundRight: CHILD_GROUND_HALF_WIDTH,
    roadLeft: CHILD_ROAD_HALF_WIDTH,
    roadRight: CHILD_ROAD_HALF_WIDTH,
    shoulderWidth: CHILD_SHOULDER_WIDTH,
  });
  const sourceSurfaceMap = new SurfaceMap(guide.length, [
    {
      sStart: 0,
      name: `${side}_CHILD_STAGE`,
      bands: childSurfaceBands(sourceLateralOrigin),
    },
  ]);
  const surfaceMap = new StageSurfaceMapView(sourceSurfaceMap, roadView);
  const heightProfile = new HeightProfile(guide.length, [
    { s: 0, y: 0 },
    { s: guide.length * 0.5, y: 0 },
    { s: guide.length, y: 0 },
  ]);
  const visualProfile = new VisualProfile(guide.length, [
    {
      sStart: 0,
      name: `${side}_CHILD_STAGE`,
      groundBaseLeft: { kind: 'color', color: rgba(39, 88, 46) },
      groundBaseRight: { kind: 'color', color: rgba(45, 100, 53) },
    },
  ]);
  const groundProfile: GroundMapProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: CHILD_ROAD_HALF_WIDTH,
    roadRight: CHILD_ROAD_HALF_WIDTH,
    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,
    shoulderWidth: CHILD_SHOULDER_WIDTH,
    roadCenterL: sourceLateralOrigin,
    chainageOffsetS,
  };
  const terrainProfile = createTerrainVisualProfile(groundProfile, heightProfile, visualProfile);

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
  parentGuide: GuidePath,
  choiceId: string,
  target: GuideChart,
  targetSeamS: number,
  fork: ParentForkGeometry,
): RouteStageHandoffSeamAuthoring {
  const side = choiceId === 'S1_LEFT' ? 'LEFT' : 'RIGHT';
  const l = fork.junction.separatedChildCenterL(side);
  const point = guidePathToWorld(parentGuide, fork.handoffSeamS, l);
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
  parentGuide: GuidePath,
  id: string,
  choiceId: string,
  side: 'LEFT' | 'RIGHT',
  fork: ParentForkGeometry,
): RouteBoundaryGateAuthoring {
  const l = fork.junction.separatedChildCenterL(side);
  const point = guidePathToWorld(parentGuide, fork.routeGateS, l);
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
  const point = guideChartToWorld(chart, CHILD_FINISH_S, 0);
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

function selectChildOverlapVertices(
  parentGuide: GuidePath,
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
    throw new RangeError('parent raster cannot provide the required handoff overlap');
  }
  return Object.freeze({ startIndex, endIndex });
}

function validateParentFork(parentGuide: GuidePath, fork: ParentForkGeometry): void {
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
