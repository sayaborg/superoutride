import { compileRasterCourse, type RasterVertex } from '../core/course.js';
import { createM2StadiumGuide } from '../core/debug-course.js';
import { compileGuideCurve, guideCourseToWorld, sampleGuideCurve, type GuideCurve } from '../core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { createStageRoadView, type StageRoadView } from '../course/stage-road-view.js';
import { createGuideChart, type GuideChart } from '../gameplay/guide-chart.js';
import { compileRouteBoundaryGateSet, type RouteBoundaryGateAuthoring, type RouteBoundaryGateSet } from '../gameplay/route-boundary-gates.js';
import type { RouteDag } from '../gameplay/route-dag.js';
import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import { CyclicSurfaceMap } from '../physics/surface-map.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../runtime/stage-runtime-content.js';
import { GROUND_COLORS, type GroundMapProfile } from '../visual/ground-map.js';
import { CyclicHeightProfile } from '../visual/height-profile.js';
import { CyclicVisualProfile } from '../visual/visual-profile.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import { createM621ChildVisualIdentity, type M621ChildVisualIdentity } from './m6-21-child-visual-identity.js';
import { M6_13_JUNCTION } from './m6-13-junction.js';
import { M6_15_ROUTE_GATE_S } from './m6-15-visible-route-gates.js';
import { M6_17_HANDOFF_SEAM_S } from './m6-17-handoff-seams.js';

export const M6_22_CHILD_FINISH_S = 300;

export interface M622ChildStageCharts {
  readonly parent: GuideChart;
  readonly left: GuideChart;
  readonly right: GuideChart;
}

export interface M622ChildStageRoadViews {
  readonly parent: StageRoadView;
  readonly left: StageRoadView;
  readonly right: StageRoadView;
}

/**
 * Build two independent child Raster/Guide courses whose local s=0 points are exactly the two
 * parent child-road centers at the validated handoff seam. Their tangent and their final D_cam of
 * pre-seam geometry coincide with the seam tangent, so changing charts is a coordinate rebase,
 * not a vehicle or camera teleport.
 *
 * The continuation fixture deliberately reuses the proven stadium topology as a cheap source of
 * <=10 degree Raster Segment turns. LEFT uses it directly; RIGHT mirrors it laterally before the
 * rigid world transform, giving the two stages different later curvature while keeping the same
 * simple closed internal asset representation. Point-to-point completion occurs long before the
 * child asset seam is reused.
 */
export function createM622ChildStageCharts(parentGuide: GuideCurve): M622ChildStageCharts {
  const leftSeam = seamPoint(parentGuide, 'LEFT');
  const rightSeam = seamPoint(parentGuide, 'RIGHT');
  const leftGuide = createAnchoredContinuationGuide(leftSeam, false);
  const rightGuide = createAnchoredContinuationGuide(rightSeam, true);

  return Object.freeze({
    parent: createGuideChart('PARENT', parentGuide, 0),
    left: createGuideChart('LEFT_CHILD', leftGuide, 0),
    right: createGuideChart('RIGHT_CHILD', rightGuide, 0),
  });
}

export function createM622ChildStageRoadViews(charts: M622ChildStageCharts): M622ChildStageRoadViews {
  const roadHalf = M6_13_JUNCTION.authoring.childRoadWidth * 0.5;
  const shoulder = M6_13_JUNCTION.authoring.shoulderWidth;
  const groundHalf = roadHalf + shoulder;
  return Object.freeze({
    parent: createStageRoadView({
      id: 'PARENT_ROAD_VIEW',
      sourceLateralOrigin: 0,
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 4.5,
      roadRight: 4.5,
      shoulderWidth: 1,
    }),
    left: createStageRoadView({
      id: 'LEFT_CHILD_ROAD_VIEW',
      sourceLateralOrigin: charts.left.lateralOrigin,
      groundLeft: groundHalf,
      groundRight: groundHalf,
      roadLeft: roadHalf,
      roadRight: roadHalf,
      shoulderWidth: shoulder,
    }),
    right: createStageRoadView({
      id: 'RIGHT_CHILD_ROAD_VIEW',
      sourceLateralOrigin: charts.right.lateralOrigin,
      groundLeft: groundHalf,
      groundRight: groundHalf,
      roadLeft: roadHalf,
      roadRight: roadHalf,
      shoulderWidth: shoulder,
    }),
  });
}

export function createM622LivePointToPointGateSet(
  route: RouteDag,
  parentGuide: GuideCurve,
  charts: M622ChildStageCharts,
): RouteBoundaryGateSet {
  const gates: RouteBoundaryGateAuthoring[] = [
    transitionGate(parentGuide, 'G_LIVE_LEFT', 'S1_LEFT', 'LEFT'),
    transitionGate(parentGuide, 'G_LIVE_RIGHT', 'S1_RIGHT', 'RIGHT'),
    childFinishGate(charts.left.guide, 'G_LIVE_FINISH_L', 'GOAL_L'),
    childFinishGate(charts.right.guide, 'G_LIVE_FINISH_R', 'GOAL_R'),
  ];
  return compileRouteBoundaryGateSet(route, gates);
}

export function createM622LiveStageRuntimeRegistry(
  manifest: RouteStageContentManifest,
  charts: M622ChildStageCharts,
  roadViews: M622ChildStageRoadViews,
  parent: M620SharedRuntimeContent,
  identity: M621ChildVisualIdentity = createM621ChildVisualIdentity(),
): StageRuntimeContentRegistry {
  const left = createChildRuntimeContent(
    'CONTENT_GOAL_L',
    manifest.worldFrameId,
    charts.left,
    roadViews.left,
    identity.leftFarBackground,
  );
  const right = createChildRuntimeContent(
    'CONTENT_GOAL_R',
    manifest.worldFrameId,
    charts.right,
    roadViews.right,
    identity.rightFarBackground,
  );

  const packages: StageRuntimeContentPackage[] = [
    {
      packageId: 'CONTENT_STAGE_1',
      worldFrameId: manifest.worldFrameId,
      coordinateFrame: charts.parent,
      roadView: null,
      surfaceMap: parent.surfaceMap,
      heightProfile: parent.heightProfile,
      terrainProfile: parent.terrainProfile,
      groundProfile: parent.groundProfile,
      selectFarBackground: parent.selectFarBackground,
      worldSprites: parent.worldSprites,
    },
    left,
    right,
  ];
  return compileStageRuntimeContentRegistry(manifest, packages);
}

function createChildRuntimeContent(
  packageId: string,
  worldFrameId: string,
  chart: GuideChart,
  roadView: StageRoadView,
  farBackground: ReturnType<typeof createM621ChildVisualIdentity>['leftFarBackground'],
): StageRuntimeContentPackage {
  const length = chart.guide.length;
  const roadHalf = roadView.roadLeft;
  const shoulder = roadView.shoulderWidth;
  const groundHalf = roadHalf + shoulder;
  const heightProfile = new CyclicHeightProfile(length, [
    { s: 0, y: 0 },
    { s: length * 0.5, y: 0 },
  ]);
  const visualProfile = new CyclicVisualProfile(length, [{
    sStart: 0,
    name: `${packageId} OPEN`,
    groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
    groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassB },
  }]);
  const groundProfile: GroundMapProfile = {
    groundLeft: groundHalf,
    groundRight: groundHalf,
    roadLeft: roadHalf,
    roadRight: roadHalf,
    shoulderWidth: shoulder,
  };
  const terrainProfile: TerrainVisualProfile = {
    screenHeight: 240,
    dMin: 2.5,
    dMax: 150,
    groundLeft: groundHalf,
    groundRight: groundHalf,
    roadLeft: roadHalf,
    roadRight: roadHalf,
    height: heightProfile,
    visual: visualProfile,
    thinSpanScreenRows: 1,
  };
  const surfaceMap = new CyclicSurfaceMap(length, [{
    sStart: 0,
    name: `${packageId} ROAD`,
    bands: [
      { lMin: -groundHalf, lMax: -roadHalf, type: 'SHOULDER' },
      { lMin: -roadHalf, lMax: roadHalf, type: 'ASPHALT' },
      { lMin: roadHalf, lMax: groundHalf, type: 'SHOULDER' },
    ],
  }]);

  return {
    packageId,
    worldFrameId,
    coordinateFrame: chart,
    roadView,
    surfaceMap,
    heightProfile,
    terrainProfile,
    groundProfile,
    selectFarBackground: () => farBackground,
    worldSprites: [],
  };
}

function seamPoint(parentGuide: GuideCurve, side: 'LEFT' | 'RIGHT') {
  const l = M6_13_JUNCTION.separatedChildCenterL(side);
  return guideCourseToWorld(parentGuide, M6_17_HANDOFF_SEAM_S, l);
}

function transitionGate(
  guide: GuideCurve,
  id: string,
  choiceId: string,
  side: 'LEFT' | 'RIGHT',
): RouteBoundaryGateAuthoring {
  const l = M6_13_JUNCTION.separatedChildCenterL(side);
  const point = guideCourseToWorld(guide, M6_15_ROUTE_GATE_S, l);
  return {
    id,
    kind: 'TRANSITION',
    choiceId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: M6_13_JUNCTION.authoring.childRoadWidth * 0.5,
  };
}

function childFinishGate(
  guide: GuideCurve,
  id: string,
  stageId: string,
): RouteBoundaryGateAuthoring {
  const point = guideCourseToWorld(guide, M6_22_CHILD_FINISH_S, 0);
  return {
    id,
    kind: 'FINISH',
    stageId,
    center: { x: point.x, z: point.z },
    heading: point.heading,
    halfWidth: M6_13_JUNCTION.authoring.childRoadWidth * 0.5,
  };
}

function createAnchoredContinuationGuide(
  target: { readonly x: number; readonly z: number; readonly heading: number },
  mirror: boolean,
): GuideCurve {
  const template = createM2StadiumGuide();
  const mirroredVertices = template.raster.vertices.map((vertex): RasterVertex => ({
    x: mirror ? -vertex.x : vertex.x,
    z: vertex.z,
    sourceRadius: vertex.sourceRadius,
  }));
  const mirroredRaster = compileRasterCourse(mirroredVertices);
  const mirroredGuide = compileGuideCurve(mirroredRaster, {
    lMax: 12,
    mMin: 0.25,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  const anchor = sampleGuideCurve(mirroredGuide, 0);
  const rotation = target.heading - anchor.heading;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const transformed = mirroredVertices.map((vertex): RasterVertex => {
    const dx = vertex.x - anchor.x;
    const dz = vertex.z - anchor.z;
    return {
      x: target.x + dx * cos + dz * sin,
      z: target.z - dx * sin + dz * cos,
      sourceRadius: vertex.sourceRadius,
    };
  });
  const raster = compileRasterCourse(transformed);
  return compileGuideCurve(raster, {
    lMax: 12,
    mMin: 0.25,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
}
