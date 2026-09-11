import type { GuidePath } from '../../core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_RENDER_FAR_DEPTH_METERS } from '../../core/presentation-scale.js';
import { guideChartToWorld, type GuideChart } from '../../gameplay/guide-chart.js';
import {
  compileDeclarativeLiveRoute,
  pointGeometry,
  type DeclarativeGateGeometry,
  type DeclarativeHandoffGeometry,
  type DeclarativeLiveRouteAuthoring,
  type DeclarativeLiveRouteStageAuthoring,
  type DeclarativeLiveRouteTransitionAuthoring,
} from '../../runtime/declarative-live-route.js';
import { composeDeclarativeLiveRouteAuthoring } from '../../runtime/declarative-route-fragment.js';
import type { LiveRouteRuntimeAssembly } from '../../runtime/live-route-runtime.js';
import type { RasterSuccessorRuntimeSource } from '../../runtime/raster-stage-successor.js';
import { compileRasterSuccessorChain, repackageGuideChartRuntime } from '../../runtime/raster-successor-chain.js';
import { compileAuthoredStageRuntimePackage } from '../../runtime/stage-authoring-compiler.js';
import type { StageRuntimeContentPackage } from '../../runtime/stage-runtime-content.js';
import type { SpriteAssets } from '../../visual/sprite-assets.js';
import { createChildVisualIdentity } from './child-backgrounds.js';
import { createChildStageAuthoring } from './child-stage-authoring.js';
import { PARENT_FORK_GEOMETRY, type ParentForkGeometry } from './child-stage-continuation.js';
import type { SharedRuntimeContent } from './shared-runtime-content.js';
import { chartPackage } from './shared-runtime-content.js';
import { CENTER_DASH_MARKINGS } from './stadium-surface-authoring.js';
import { createSuccessorStagePackages } from './successor-stage-content.js';
import { createLiveContinuation, type LiveContinuation } from './successor-stage-continuation.js';

const WORLD_FRAME_ID = 'DEV_ROUTE_WORLD_V1';
const ROAD_HALF_WIDTH = 3.5;
const THIRD_SOURCE_SEAM_MIN_S = 340;
const THIRD_OVERLAP_MARGIN = 30;
const THIRD_TRANSITION_LEAD = 20;
const THIRD_FINISH_AFTER_SEAM = 150;

/**
 * Reusable upstream fragment for fork growth. A later fork promotes a terminal from this
 * authoring without reconstructing the validated first fork and successor chains.
 */
export function createThirdLiveSuccessorAuthoring(
  parentGuide: GuidePath,
  parentContent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  parentFork: ParentForkGeometry = PARENT_FORK_GEOMETRY,
): DeclarativeLiveRouteAuthoring {
  const continuation = createLiveContinuation(parentGuide, parentFork);
  const identity = createChildVisualIdentity();
  const basePackages = createSuccessorStagePackages(
    continuation,
    parentContent,
    spriteAssets,
    WORLD_FRAME_ID,
    identity,
  );
  const baseById = new Map(basePackages.map((runtime) => [runtime.packageId, runtime]));
  const requireBase = (packageId: string): StageRuntimeContentPackage => {
    const found = baseById.get(packageId);
    if (!found) throw new RangeError(`live route missing base runtime package: ${packageId}`);
    return found;
  };
  const authored = createChildStageAuthoring(spriteAssets, identity);

  const stage1Runtime = chartPackage(requireBase('CONTENT_STAGE_1'));
  const stage2LeftRuntime = chartPackage(requireBase('CONTENT_STAGE_2_L'));
  const stage2RightRuntime = chartPackage(requireBase('CONTENT_STAGE_2_R'));
  const stage3Left = repackageGuideChartRuntime(chartPackage(requireBase('CONTENT_GOAL_L')), 'CONTENT_STAGE_3_L');
  const stage3Right = repackageGuideChartRuntime(chartPackage(requireBase('CONTENT_GOAL_R')), 'CONTENT_STAGE_3_R');

  const leftChain = compileRasterSuccessorChain({
    sourceStageId: 'STAGE_3_L',
    sourceRuntime: stage3Left,
    sourceStructural: continuation.leftSuccessor,
    halfWidth: ROAD_HALF_WIDTH,
    finishGateId: 'G_LIVE_FINISH_L',
    steps: [
      {
        stageId: 'GOAL_L',
        packageId: 'CONTENT_GOAL_L',
        choiceId: 'S3L_CONTINUE',
        gateId: 'G_LIVE_STAGE3_L',
        handoffId: 'H_S3L_CONTINUE',
        successor: thirdSuccessorAuthoring('LEFT', -1),
      },
    ],
    createRuntime: (structural, packageId) =>
      chartPackage(
        compileAuthoredStageRuntimePackage(
          {
            packageId,
            worldFrameId: WORLD_FRAME_ID,
            coordinateFrame: structural.chart,
            roadView: structural.roadView,
            surfaceMap: structural.surfaceMap,
            groundProfile: structural.groundProfile,
          },
          authored.left,
        ),
      ),
  });

  const rightChain = compileRasterSuccessorChain({
    sourceStageId: 'STAGE_3_R',
    sourceRuntime: stage3Right,
    sourceStructural: continuation.rightSuccessor,
    halfWidth: ROAD_HALF_WIDTH,
    finishGateId: 'G_LIVE_FINISH_R',
    steps: [
      {
        stageId: 'GOAL_R',
        packageId: 'CONTENT_GOAL_R',
        choiceId: 'S3R_CONTINUE',
        gateId: 'G_LIVE_STAGE3_R',
        handoffId: 'H_S3R_CONTINUE',
        successor: thirdSuccessorAuthoring('RIGHT', 1),
      },
    ],
    createRuntime: (structural, packageId) =>
      chartPackage(
        compileAuthoredStageRuntimePackage(
          {
            packageId,
            worldFrameId: WORLD_FRAME_ID,
            coordinateFrame: structural.chart,
            roadView: structural.roadView,
            surfaceMap: structural.surfaceMap,
            groundProfile: structural.groundProfile,
          },
          authored.right,
        ),
      ),
  });

  const stage1Row: DeclarativeLiveRouteStageAuthoring = {
    id: 'STAGE_1',
    kind: 'STAGE',
    runtime: stage1Runtime,
  };
  const stage2LeftRow: DeclarativeLiveRouteStageAuthoring = {
    id: 'STAGE_2_L',
    kind: 'STAGE',
    runtime: stage2LeftRuntime,
  };
  const stage2RightRow: DeclarativeLiveRouteStageAuthoring = {
    id: 'STAGE_2_R',
    kind: 'STAGE',
    runtime: stage2RightRuntime,
  };
  const stage3LeftRow = leftChain.stages[0]!;
  const stage3RightRow = rightChain.stages[0]!;

  const forkLeft: DeclarativeLiveRouteTransitionAuthoring = {
    id: 'S1_LEFT',
    fromStageId: 'STAGE_1',
    toStageId: 'STAGE_2_L',
    gate: pointGeometry(
      'G_LIVE_LEFT',
      guideChartToWorld(
        continuation.base.charts.parent,
        parentFork.routeGateS,
        parentFork.junction.separatedChildCenterL('LEFT'),
      ),
      ROAD_HALF_WIDTH,
    ),
    handoff: parentHandoffGeometry(continuation, 'H_S1_LEFT', 'LEFT', parentFork),
  };
  const forkRight: DeclarativeLiveRouteTransitionAuthoring = {
    id: 'S1_RIGHT',
    fromStageId: 'STAGE_1',
    toStageId: 'STAGE_2_R',
    gate: pointGeometry(
      'G_LIVE_RIGHT',
      guideChartToWorld(
        continuation.base.charts.parent,
        parentFork.routeGateS,
        parentFork.junction.separatedChildCenterL('RIGHT'),
      ),
      ROAD_HALF_WIDTH,
    ),
    handoff: parentHandoffGeometry(continuation, 'H_S1_RIGHT', 'RIGHT', parentFork),
  };
  const leftBridge: DeclarativeLiveRouteTransitionAuthoring = {
    id: 'S2L_CONTINUE',
    fromStageId: 'STAGE_2_L',
    toStageId: 'STAGE_3_L',
    gate: sourceTransitionGeometry(continuation.leftSuccessor, continuation.base.charts.left, 'G_LIVE_STAGE2_L'),
    handoff: sourceHandoffGeometry(continuation.leftSuccessor, continuation.base.charts.left, 'H_S2L_CONTINUE'),
  };
  const rightBridge: DeclarativeLiveRouteTransitionAuthoring = {
    id: 'S2R_CONTINUE',
    fromStageId: 'STAGE_2_R',
    toStageId: 'STAGE_3_R',
    gate: sourceTransitionGeometry(continuation.rightSuccessor, continuation.base.charts.right, 'G_LIVE_STAGE2_R'),
    handoff: sourceHandoffGeometry(continuation.rightSuccessor, continuation.base.charts.right, 'H_S2R_CONTINUE'),
  };

  return composeDeclarativeLiveRouteAuthoring({
    startStageId: 'STAGE_1',
    fragments: [
      {
        stages: [stage1Row, stage2LeftRow, stage2RightRow],
        transitions: [forkLeft, forkRight],
      },
      {
        stages: [stage2LeftRow, stage3LeftRow],
        transitions: [leftBridge],
      },
      {
        stages: leftChain.stages,
        transitions: leftChain.transitions,
        finishes: [leftChain.finish],
      },
      {
        stages: [stage2RightRow, stage3RightRow],
        transitions: [rightBridge],
      },
      {
        stages: rightChain.stages,
        transitions: rightChain.transitions,
        finishes: [rightChain.finish],
      },
    ],
  });
}

/**
 * Compile the authored symmetric two-terminal route through the common route assembly.
 */
export function createThirdLiveSuccessorRuntime(
  parentGuide: GuidePath,
  parentContent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  parentFork: ParentForkGeometry = PARENT_FORK_GEOMETRY,
): LiveRouteRuntimeAssembly {
  return compileDeclarativeLiveRoute(
    createThirdLiveSuccessorAuthoring(parentGuide, parentContent, spriteAssets, parentFork),
  );
}

function thirdSuccessorAuthoring(side: 'LEFT' | 'RIGHT', deformationDirection: -1 | 1) {
  return {
    id: `${side}_SUCCESSOR_TO_THIRD`,
    chartId: `${side}_THIRD_SUCCESSOR`,
    roadViewId: `${side}_THIRD_SUCCESSOR_VIEW`,
    surfaceSectionName: `${side}_THIRD_SUCCESSOR_STAGE`,
    sourceSeamMinS: THIRD_SOURCE_SEAM_MIN_S,
    overlapMargin: THIRD_OVERLAP_MARGIN,
    transitionLead: THIRD_TRANSITION_LEAD,
    finishAfterSeam: THIRD_FINISH_AFTER_SEAM,
    deformationMeters: 2.5,
    deformationDirection,
    gentleTurnLimitDegrees: 5,
    minDeformationRunVertices: 5,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
    dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
    groundMapHalfWidth: 12,
    groundHalfWidth: 4.5,
    roadHalfWidth: ROAD_HALF_WIDTH,
    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,
    shoulderWidth: 1,
  } as const;
}

function sourceTransitionGeometry(
  successor: RasterSuccessorRuntimeSource,
  sourceChart: GuideChart,
  id: string,
): DeclarativeGateGeometry {
  return pointGeometry(id, guideChartToWorld(sourceChart, successor.sourceTransitionS, 0), ROAD_HALF_WIDTH);
}

function sourceHandoffGeometry(
  successor: RasterSuccessorRuntimeSource,
  sourceChart: GuideChart,
  id: string,
): DeclarativeHandoffGeometry {
  return {
    ...pointGeometry(id, guideChartToWorld(sourceChart, successor.sourceSeamS, 0), ROAD_HALF_WIDTH),
    sourceSeamS: successor.link.sourceSeamS,
    targetSeamS: successor.link.targetSeamS,
    sourceLocalL: successor.link.sourceLocalL,
    targetLocalL: successor.link.targetLocalL,
  };
}

function parentHandoffGeometry(
  continuation: LiveContinuation,
  id: string,
  side: 'LEFT' | 'RIGHT',
  parentFork: ParentForkGeometry,
): DeclarativeHandoffGeometry {
  const localL = parentFork.junction.separatedChildCenterL(side);
  return {
    ...pointGeometry(
      id,
      guideChartToWorld(continuation.base.charts.parent, parentFork.handoffSeamS, localL),
      ROAD_HALF_WIDTH,
    ),
    sourceSeamS: parentFork.handoffSeamS,
    targetSeamS: continuation.base.handoffLocalS,
    sourceLocalL: localL,
    targetLocalL: 0,
  };
}
