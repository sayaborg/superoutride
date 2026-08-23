import type { GuideCurve } from '../core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { guideChartToWorld, type GuideChart } from '../gameplay/guide-chart.js';
import type {
  DeclarativeGateGeometry,
  DeclarativeLiveRouteStageAuthoring,
  DeclarativeLiveRouteTransitionAuthoring,
  GuideChartRuntimePackage,
} from '../runtime/declarative-live-route.js';
import { compileDeclarativeRouteFragments } from '../runtime/declarative-route-fragment.js';
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
 * M6.30 live topology retained as the current browser fixture.
 *
 * M6.31 supplies the reusable deep LEFT successor chain. M6.32 now composes the visible fork,
 * LEFT bridge, successor chain and RIGHT terminal path as independent declarative fragments before
 * passing the canonical result through the ordinary M6.28 compiler.
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

  const stage1Runtime = chartPackage(requireBase('CONTENT_STAGE_1'));
  const stage2LeftRuntime = chartPackage(requireBase('CONTENT_STAGE_2_L'));
  const stage2RightRuntime = chartPackage(requireBase('CONTENT_STAGE_2_R'));
  const goalRightRuntime = chartPackage(requireBase('CONTENT_GOAL_R'));
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

  const stage1Row: DeclarativeLiveRouteStageAuthoring = {
    id: 'STAGE_1', kind: 'STAGE', runtime: stage1Runtime,
  };
  const stage2LeftRow: DeclarativeLiveRouteStageAuthoring = {
    id: 'STAGE_2_L', kind: 'STAGE', runtime: stage2LeftRuntime,
  };
  const stage2RightRow: DeclarativeLiveRouteStageAuthoring = {
    id: 'STAGE_2_R', kind: 'STAGE', runtime: stage2RightRuntime,
  };
  const goalRightRow: DeclarativeLiveRouteStageAuthoring = {
    id: 'GOAL_R', kind: 'TERMINAL', runtime: goalRightRuntime,
  };
  const stage3LeftRow = leftChain.stages[0]!;

  const forkLeft: DeclarativeLiveRouteTransitionAuthoring = {
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
  };
  const forkRight: DeclarativeLiveRouteTransitionAuthoring = {
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
  };
  const leftBridge: DeclarativeLiveRouteTransitionAuthoring = {
    id: 'S2L_CONTINUE',
    fromStageId: 'STAGE_2_L',
    toStageId: 'STAGE_3_L',
    gate: sourceTransitionGeometry(
      continuation.leftSuccessor,
      continuation.base.charts.left,
      'G_LIVE_STAGE2_L',
    ),
    handoff: sourceHandoffGeometry(
      continuation.leftSuccessor,
      continuation.base.charts.left,
      'H_S2L_CONTINUE',
    ),
  };
  const rightBridge: DeclarativeLiveRouteTransitionAuthoring = {
    id: 'S2R_CONTINUE',
    fromStageId: 'STAGE_2_R',
    toStageId: 'GOAL_R',
    gate: sourceTransitionGeometry(
      continuation.rightSuccessor,
      continuation.base.charts.right,
      'G_LIVE_STAGE2_R',
    ),
    handoff: sourceHandoffGeometry(
      continuation.rightSuccessor,
      continuation.base.charts.right,
      'H_S2R_CONTINUE',
    ),
  };

  return compileDeclarativeRouteFragments({
    startStageId: 'STAGE_1',
    fragments: [
      {
        stages: [stage1Row, stage2LeftRow, stage2RightRow],
        transitions: [forkLeft, forkRight],
      },
      {
        // Shared rows intentionally repeat by object identity so the fragment composer proves the
        // join rather than requiring callers to coordinate array ownership.
        stages: [stage2LeftRow, stage3LeftRow],
        transitions: [leftBridge],
      },
      {
        stages: leftChain.stages,
        transitions: leftChain.transitions,
        finishes: [leftChain.finish],
      },
      {
        stages: [stage2RightRow, goalRightRow],
        transitions: [rightBridge],
        finishes: [{
          stageId: 'GOAL_R',
          gate: finishGeometry(continuation.rightSuccessor, 'G_LIVE_FINISH_R'),
        }],
      },
    ],
  });
}

function sourceTransitionGeometry(
  successor: RasterSuccessorRuntimeSource,
  sourceChart: GuideChart,
  id: string,
): DeclarativeGateGeometry {
  return pointGeometry(
    id,
    guideChartToWorld(sourceChart, successor.sourceTransitionS, 0),
  );
}

function sourceHandoffGeometry(
  successor: RasterSuccessorRuntimeSource,
  sourceChart: GuideChart,
  id: string,
): DeclarativeGateGeometry {
  return pointGeometry(
    id,
    guideChartToWorld(sourceChart, successor.sourceSeamS, 0),
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
