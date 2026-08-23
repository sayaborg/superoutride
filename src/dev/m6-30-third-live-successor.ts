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
  compileRasterSuccessorChain,
  repackageGuideChartRuntime,
} from '../runtime/raster-successor-chain.js';
import type { RasterSuccessorRuntimeSource } from '../runtime/raster-stage-successor.js';
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
 * M6.30 live proof retained as the current content fixture. M6.31 removes the milestone-specific
 * terminal-promotion / next-edge construction by delegating the deep LEFT path to the generic
 * Raster successor-chain compiler. main.ts and the browser loop remain unchanged.
 */
export function createM630ThirdLiveSuccessorRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  const continuation = createM626LiveContinuation(parentGuide);
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
  const stage3Left = repackageGuideChartRuntime(
    chartPackage(requireBase('CONTENT_GOAL_L')),
    'CONTENT_STAGE_3_L',
  );
  const leftChain = compileRasterSuccessorChain({
    sourceStageId: 'STAGE_3_L',
    sourceRuntime: stage3Left,
    sourceStructural: continuation.leftSuccessor,
    halfWidth: ROAD_HALF_WIDTH,
    finishGateId: 'G_LIVE_FINISH_L',
    steps: [{
      stageId: 'GOAL_L',
      packageId: 'CONTENT_GOAL_L',
      choiceId: 'S3L_CONTINUE',
      gateId: 'G_LIVE_STAGE3_L',
      handoffId: 'H_S3L_CONTINUE',
      successor: {
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
      },
    }],
    createRuntime: (structural, packageId) => chartPackage(compileAuthoredStageRuntimePackage({
      packageId,
      worldFrameId: WORLD_FRAME_ID,
      coordinateFrame: structural.chart,
      roadView: structural.roadView,
      surfaceMap: structural.surfaceMap,
      groundProfile: structural.groundProfile,
    }, authored.left)),
  });
  const packages: readonly GuideChartRuntimePackage[] = Object.freeze([
    chartPackage(requireBase('CONTENT_STAGE_1')),
    chartPackage(requireBase('CONTENT_STAGE_2_L')),
    chartPackage(requireBase('CONTENT_STAGE_2_R')),
    ...leftChain.runtimes,
    chartPackage(requireBase('CONTENT_GOAL_R')),
  ]);
  const byPackageId = new Map(packages.map((runtime) => [runtime.packageId, runtime]));
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
      ...leftChain.stages,
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
      ...leftChain.transitions,
      {
        id: 'S2R_CONTINUE',
        fromStageId: 'STAGE_2_R',
        toStageId: 'GOAL_R',
        gate: sourceTransitionGeometry(continuation.rightSuccessor, 'G_LIVE_STAGE2_R'),
        handoff: sourceHandoffGeometry(continuation.rightSuccessor, 'H_S2R_CONTINUE'),
      },
    ],
    finishes: [
      leftChain.finish,
      { stageId: 'GOAL_R', gate: finishGeometry(continuation.rightSuccessor, 'G_LIVE_FINISH_R') },
    ],
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
