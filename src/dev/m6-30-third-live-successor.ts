import type { GuideCurve } from '../core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { guideChartToWorld, type GuideChart } from '../gameplay/guide-chart.js';
import {
  compileDeclarativeLiveRoute,
  type DeclarativeGateGeometry,
  type GuideChartRuntimePackage,
} from '../runtime/declarative-live-route.js';
import { compileAuthoredStageRuntimePackage } from '../runtime/stage-authoring-compiler.js';
import {
  createRasterStageSuccessor,
  type RasterSuccessorRuntimeSource,
} from '../runtime/raster-stage-successor.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import type { StageRuntimeContentPackage } from '../runtime/stage-runtime-content.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import { M6_13_JUNCTION } from './m6-13-junction.js';
import { M6_15_ROUTE_GATE_S } from './m6-15-visible-route-gates.js';
import { M6_17_HANDOFF_SEAM_S } from './m6-17-handoff-seams.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import { createM621ChildVisualIdentity } from './m6-21-child-visual-identity.js';
import { createM624ChildStageAuthoring } from './m6-24-stage-authoring.js';
import { createM626LiveContinuation } from './m6-26-live-successor-stage.js';
import { createM626LiveStageRuntimePackages } from './m6-26-live-runtime-content.js';

const WORLD_FRAME_ID = 'DEV_ROUTE_WORLD_V1';
const ROAD_HALF_WIDTH = 3.5;
const THIRD_SOURCE_SEAM_MIN_S = 340;
const THIRD_OVERLAP_MARGIN = 30;
const THIRD_TRANSITION_LEAD = 20;
const THIRD_FINISH_AFTER_SEAM = 150;

/**
 * M6.30 live proof: extend only the selected LEFT path through one additional independently
 * generated stage. The browser loop remains unchanged; this function only supplies route/runtime
 * source data through the existing declarative compiler.
 *
 * Live topology:
 *
 * STAGE_1 -> STAGE_2_L -> STAGE_3_L -> GOAL_L
 *        \-> STAGE_2_R -------------> GOAL_R
 */
export function createM630ThirdLiveSuccessorRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  const continuation = createM626LiveContinuation(parentGuide);
  const thirdLeft = createThirdLeftSuccessor(continuation.leftSuccessor);
  const identity = createM621ChildVisualIdentity();
  const basePackages = createM626LiveStageRuntimePackages(
    continuation,
    parentContent,
    spriteAssets,
    WORLD_FRAME_ID,
    identity,
  );
  const baseById = new Map(basePackages.map((runtime) => [runtime.packageId, runtime]));
  const requireBase = (packageId: string): StageRuntimeContentPackage => {
    const found = baseById.get(packageId);
    if (!found) throw new RangeError(`M6.30 missing base runtime package: ${packageId}`);
    return found;
  };
  const authored = createM624ChildStageAuthoring(spriteAssets, identity);
  const stage3Left = Object.freeze({
    ...requireBase('CONTENT_GOAL_L'),
    packageId: 'CONTENT_STAGE_3_L',
  }) satisfies StageRuntimeContentPackage;
  const goalLeft = compileAuthoredStageRuntimePackage({
    packageId: 'CONTENT_GOAL_L',
    worldFrameId: WORLD_FRAME_ID,
    coordinateFrame: thirdLeft.chart,
    roadView: thirdLeft.roadView,
    surfaceMap: thirdLeft.surfaceMap,
    groundProfile: thirdLeft.groundProfile,
  }, authored.left);
  const packages: readonly StageRuntimeContentPackage[] = Object.freeze([
    requireBase('CONTENT_STAGE_1'),
    requireBase('CONTENT_STAGE_2_L'),
    requireBase('CONTENT_STAGE_2_R'),
    stage3Left,
    goalLeft,
    requireBase('CONTENT_GOAL_R'),
  ]);
  const byPackageId = new Map(packages.map((runtime) => [runtime.packageId, chartPackage(runtime)]));
  const runtime = (packageId: string): GuideChartRuntimePackage => {
    const found = byPackageId.get(packageId);
    if (!found) throw new RangeError(`M6.30 missing runtime package: ${packageId}`);
    return found;
  };

  return compileDeclarativeLiveRoute({
    startStageId: 'STAGE_1',
    stages: [
      { id: 'STAGE_1', kind: 'STAGE', runtime: runtime('CONTENT_STAGE_1') },
      { id: 'STAGE_2_L', kind: 'STAGE', runtime: runtime('CONTENT_STAGE_2_L') },
      { id: 'STAGE_2_R', kind: 'STAGE', runtime: runtime('CONTENT_STAGE_2_R') },
      { id: 'STAGE_3_L', kind: 'STAGE', runtime: runtime('CONTENT_STAGE_3_L') },
      { id: 'GOAL_L', kind: 'TERMINAL', runtime: runtime('CONTENT_GOAL_L') },
      { id: 'GOAL_R', kind: 'TERMINAL', runtime: runtime('CONTENT_GOAL_R') },
    ],
    transitions: [
      {
        id: 'S1_LEFT',
        fromStageId: 'STAGE_1',
        toStageId: 'STAGE_2_L',
        gate: pointGeometry(
          'G_LIVE_LEFT',
          guideChartToWorld(
            continuation.base.charts.parent,
            M6_15_ROUTE_GATE_S,
            M6_13_JUNCTION.separatedChildCenterL('LEFT'),
          ),
        ),
        handoff: pointGeometry(
          'H_S1_LEFT',
          guideChartToWorld(
            continuation.base.charts.parent,
            M6_17_HANDOFF_SEAM_S,
            M6_13_JUNCTION.separatedChildCenterL('LEFT'),
          ),
        ),
      },
      {
        id: 'S1_RIGHT',
        fromStageId: 'STAGE_1',
        toStageId: 'STAGE_2_R',
        gate: pointGeometry(
          'G_LIVE_RIGHT',
          guideChartToWorld(
            continuation.base.charts.parent,
            M6_15_ROUTE_GATE_S,
            M6_13_JUNCTION.separatedChildCenterL('RIGHT'),
          ),
        ),
        handoff: pointGeometry(
          'H_S1_RIGHT',
          guideChartToWorld(
            continuation.base.charts.parent,
            M6_17_HANDOFF_SEAM_S,
            M6_13_JUNCTION.separatedChildCenterL('RIGHT'),
          ),
        ),
      },
      {
        id: 'S2L_CONTINUE',
        fromStageId: 'STAGE_2_L',
        toStageId: 'STAGE_3_L',
        gate: sourceTransitionGeometry(continuation.leftSuccessor, 'G_LIVE_STAGE2_L'),
        handoff: sourceHandoffGeometry(continuation.leftSuccessor, 'H_S2L_CONTINUE'),
      },
      {
        id: 'S3L_CONTINUE',
        fromStageId: 'STAGE_3_L',
        toStageId: 'GOAL_L',
        gate: sourceTransitionGeometry(thirdLeft, 'G_LIVE_STAGE3_L'),
        handoff: sourceHandoffGeometry(thirdLeft, 'H_S3L_CONTINUE'),
      },
      {
        id: 'S2R_CONTINUE',
        fromStageId: 'STAGE_2_R',
        toStageId: 'GOAL_R',
        gate: sourceTransitionGeometry(continuation.rightSuccessor, 'G_LIVE_STAGE2_R'),
        handoff: sourceHandoffGeometry(continuation.rightSuccessor, 'H_S2R_CONTINUE'),
      },
    ],
    finishes: [
      { stageId: 'GOAL_L', gate: finishGeometry(thirdLeft, 'G_LIVE_FINISH_L') },
      { stageId: 'GOAL_R', gate: finishGeometry(continuation.rightSuccessor, 'G_LIVE_FINISH_R') },
    ],
  });
}

function createThirdLeftSuccessor(source: RasterSuccessorRuntimeSource): RasterSuccessorRuntimeSource {
  return createRasterStageSuccessor(source, {
    id: 'LEFT_SUCCESSOR_TO_THIRD',
    chartId: 'LEFT_THIRD_SUCCESSOR',
    roadViewId: 'LEFT_THIRD_SUCCESSOR_VIEW',
    surfaceSectionName: 'LEFT_THIRD_SUCCESSOR_STAGE',
    sourceSeamMinS: THIRD_SOURCE_SEAM_MIN_S,
    overlapMargin: THIRD_OVERLAP_MARGIN,
    transitionLead: THIRD_TRANSITION_LEAD,
    finishAfterSeam: THIRD_FINISH_AFTER_SEAM,
    deformationMeters: 2.5,
    deformationDirection: -1,
    gentleTurnLimitDegrees: 5,
    minDeformationRunVertices: 5,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
    dMax: 150,
    finishClosureMargin: 20,
    groundMapHalfWidth: 12,
    groundHalfWidth: 4.5,
    roadHalfWidth: ROAD_HALF_WIDTH,
    shoulderWidth: 1,
  });
}

function sourceTransitionGeometry(
  successor: RasterSuccessorRuntimeSource,
  id: string,
): DeclarativeGateGeometry {
  return pointGeometry(
    id,
    guideChartToWorld(successor.link.sourceFrame as GuideChart, successor.sourceTransitionS, 0),
  );
}

function sourceHandoffGeometry(
  successor: RasterSuccessorRuntimeSource,
  id: string,
): DeclarativeGateGeometry {
  return pointGeometry(
    id,
    guideChartToWorld(successor.link.sourceFrame as GuideChart, successor.sourceSeamS, 0),
  );
}

function finishGeometry(
  successor: RasterSuccessorRuntimeSource,
  id: string,
): DeclarativeGateGeometry {
  return pointGeometry(id, guideChartToWorld(successor.chart, successor.finishS, 0));
}

function pointGeometry(
  id: string,
  point: { readonly x: number; readonly z: number; readonly heading: number },
): DeclarativeGateGeometry {
  return { id, center: { x: point.x, z: point.z }, heading: point.heading, halfWidth: ROAD_HALF_WIDTH };
}

function chartPackage(runtime: StageRuntimeContentPackage): GuideChartRuntimePackage {
  const frame = runtime.coordinateFrame as Partial<GuideChart>;
  if (typeof frame.id !== 'string' || frame.guide === undefined || typeof frame.lateralOrigin !== 'number') {
    throw new RangeError(`M6.30 runtime package must use a GuideChart coordinate frame: ${runtime.packageId}`);
  }
  return runtime as GuideChartRuntimePackage;
}
