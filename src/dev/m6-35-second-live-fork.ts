import type { GuideCurve } from '../core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { guideChartToWorld, type GuideChart } from '../gameplay/guide-chart.js';
import {
  type DeclarativeGateGeometry,
  type DeclarativeLiveRouteStageAuthoring,
  type DeclarativeLiveRouteTransitionAuthoring,
  type GuideChartRuntimePackage,
} from '../runtime/declarative-live-route.js';
import { compileDeclarativeRouteFragments } from '../runtime/declarative-route-fragment.js';
import { createRasterForkStageSuccessor } from '../runtime/raster-fork-successor.js';
import { repackageGuideChartRuntime } from '../runtime/raster-successor-chain.js';
import { compileAuthoredStageRuntimePackage } from '../runtime/stage-authoring-compiler.js';
import { compileStageJunction } from '../runtime/stage-junction-compiler.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import type { StageRuntimeContentPackage } from '../runtime/stage-runtime-content.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import { createM621ChildVisualIdentity } from './m6-21-child-visual-identity.js';
import { createM624ChildStageAuthoring } from './m6-24-stage-authoring.js';
import { createM630ThirdLiveSuccessorAuthoring } from './m6-30-third-live-successor.js';

const WORLD_FRAME_ID = 'DEV_ROUTE_WORLD_V1';
const INCOMING_ROAD_WIDTH = 7;
const CHILD_ROAD_WIDTH = 7;
const CHILD_ROAD_HALF_WIDTH = CHILD_ROAD_WIDTH * 0.5;
const FORK_WIDEN_START_S = 80;
const FORK_MEDIAN_START_S = 110;
const FORK_SEPARATED_START_S = 170;
const FORK_ROUTE_GATE_S = 195;
const FORK_SOURCE_SEAM_MIN_S = 235;

/**
 * M6.35 live route: promote the validated old LEFT terminal into a real visible second fork.
 *
 * Existing first-fork and RIGHT-path authoring comes from M6.30/M6.33 unchanged. Only the old
 * GOAL_L terminal row is promoted and extended by an M6.34 stage-local junction plus two independent
 * fork-child Raster successors.
 */
export function createM635SecondLiveForkRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  const base = createM630ThirdLiveSuccessorAuthoring(parentGuide, parentContent, spriteAssets);
  const oldGoalLeft = requireStage(base.stages, 'GOAL_L');
  const oldGoalRuntime = chartPackage(oldGoalLeft.runtime);
  if (oldGoalRuntime.roadView === null) throw new Error('M6.35 fork source requires a StageRoadView');

  const promoted = repackageGuideChartRuntime(oldGoalRuntime, 'CONTENT_STAGE_4_L_FORK');
  const forkGeometry = compileStageJunction({
    courseLength: promoted.coordinateFrame.guide.length,
    roadView: promoted.roadView!,
    groundProfile: promoted.groundProfile,
  }, {
    roadViewId: 'LEFT_SECOND_FORK_VIEW',
    surfaceSectionName: 'LEFT_SECOND_FORK',
    crossSection: {
      sWidenStart: FORK_WIDEN_START_S,
      sMedianStart: FORK_MEDIAN_START_S,
      sSeparatedStart: FORK_SEPARATED_START_S,
      parentRoadWidth: INCOMING_ROAD_WIDTH,
      childRoadWidth: CHILD_ROAD_WIDTH,
      finalMedianWidth: 8,
      shoulderWidth: 1,
    },
    outerSurfaceType: 'GRASS',
  });
  const forkRuntime: GuideChartRuntimePackage = Object.freeze({
    ...promoted,
    roadView: forkGeometry.roadView,
    surfaceMap: forkGeometry.surfaceMap,
    groundProfile: forkGeometry.groundProfile,
    terrainProfile: Object.freeze({
      ...promoted.terrainProfile,
      groundLeft: forkGeometry.requiredGroundHalfWidth,
      groundRight: forkGeometry.requiredGroundHalfWidth,
    }),
  });
  const forkStage: DeclarativeLiveRouteStageAuthoring = Object.freeze({
    id: 'STAGE_4_L_FORK',
    kind: 'STAGE',
    runtime: forkRuntime,
  });

  const sourceStructural = {
    guide: forkRuntime.coordinateFrame.guide,
    chart: forkRuntime.coordinateFrame,
    groundProfile: forkRuntime.groundProfile,
  } as const;
  const leftCenter = forkGeometry.junction.separatedChildCenterL('LEFT');
  const rightCenter = forkGeometry.junction.separatedChildCenterL('RIGHT');
  const branchA = createRasterForkStageSuccessor(sourceStructural, {
    sourceLocalL: leftCenter,
    successor: forkChildSuccessorAuthoring('A', -1),
  });
  const branchB = createRasterForkStageSuccessor(sourceStructural, {
    sourceLocalL: rightCenter,
    successor: forkChildSuccessorAuthoring('B', 1),
  });

  const identity = createM621ChildVisualIdentity();
  const authored = createM624ChildStageAuthoring(spriteAssets, identity);
  const goalA = chartPackage(compileAuthoredStageRuntimePackage({
    packageId: 'CONTENT_GOAL_LA',
    worldFrameId: WORLD_FRAME_ID,
    coordinateFrame: branchA.chart,
    roadView: branchA.roadView,
    surfaceMap: branchA.surfaceMap,
    groundProfile: branchA.groundProfile,
  }, authored.left));
  const goalB = chartPackage(compileAuthoredStageRuntimePackage({
    packageId: 'CONTENT_GOAL_LB',
    worldFrameId: WORLD_FRAME_ID,
    coordinateFrame: branchB.chart,
    roadView: branchB.roadView,
    surfaceMap: branchB.surfaceMap,
    groundProfile: branchB.groundProfile,
  }, authored.right));

  const goalARow: DeclarativeLiveRouteStageAuthoring = Object.freeze({
    id: 'GOAL_LA', kind: 'TERMINAL', runtime: goalA,
  });
  const goalBRow: DeclarativeLiveRouteStageAuthoring = Object.freeze({
    id: 'GOAL_LB', kind: 'TERMINAL', runtime: goalB,
  });

  const forkA = forkTransition(
    'S4L_FORK_A',
    'GOAL_LA',
    'G_LIVE_SECOND_FORK_A',
    'H_S4L_FORK_A',
    forkRuntime.coordinateFrame,
    FORK_ROUTE_GATE_S,
    leftCenter,
    branchA.sourceSeamS,
  );
  const forkB = forkTransition(
    'S4L_FORK_B',
    'GOAL_LB',
    'G_LIVE_SECOND_FORK_B',
    'H_S4L_FORK_B',
    forkRuntime.coordinateFrame,
    FORK_ROUTE_GATE_S,
    rightCenter,
    branchB.sourceSeamS,
  );

  const baseStages = base.stages.map((stage) => stage.id === 'GOAL_L' ? forkStage : stage);
  const baseTransitions = base.transitions.map((transition) => transition.toStageId === 'GOAL_L'
    ? Object.freeze({ ...transition, toStageId: 'STAGE_4_L_FORK' })
    : transition);
  const baseFinishes = base.finishes.filter((finish) => finish.stageId !== 'GOAL_L');

  return compileDeclarativeRouteFragments({
    startStageId: base.startStageId,
    fragments: [
      {
        stages: baseStages,
        transitions: baseTransitions,
        finishes: baseFinishes,
      },
      {
        stages: [forkStage, goalARow, goalBRow],
        transitions: [forkA, forkB],
        finishes: [
          {
            stageId: 'GOAL_LA',
            gate: pointGeometry(
              'G_LIVE_FINISH_LA',
              guideChartToWorld(branchA.chart, branchA.finishS, 0),
              CHILD_ROAD_HALF_WIDTH,
            ),
          },
          {
            stageId: 'GOAL_LB',
            gate: pointGeometry(
              'G_LIVE_FINISH_LB',
              guideChartToWorld(branchB.chart, branchB.finishS, 0),
              CHILD_ROAD_HALF_WIDTH,
            ),
          },
        ],
      },
    ],
  });
}

function forkTransition(
  id: string,
  targetStageId: string,
  gateId: string,
  handoffId: string,
  sourceChart: GuideChart,
  routeGateS: number,
  sourceLocalL: number,
  sourceSeamS: number,
): DeclarativeLiveRouteTransitionAuthoring {
  return Object.freeze({
    id,
    fromStageId: 'STAGE_4_L_FORK',
    toStageId: targetStageId,
    gate: pointGeometry(
      gateId,
      guideChartToWorld(sourceChart, routeGateS, sourceLocalL),
      CHILD_ROAD_HALF_WIDTH,
    ),
    handoff: pointGeometry(
      handoffId,
      guideChartToWorld(sourceChart, sourceSeamS, sourceLocalL),
      CHILD_ROAD_HALF_WIDTH,
    ),
  });
}

function forkChildSuccessorAuthoring(label: 'A' | 'B', deformationDirection: -1 | 1) {
  return {
    id: `LEFT_SECOND_FORK_${label}_SUCCESSOR`,
    chartId: `LEFT_SECOND_FORK_${label}_CHART`,
    roadViewId: `LEFT_SECOND_FORK_${label}_VIEW`,
    surfaceSectionName: `LEFT_SECOND_FORK_${label}_STAGE`,
    sourceSeamMinS: FORK_SOURCE_SEAM_MIN_S,
    overlapMargin: 30,
    transitionLead: 20,
    finishAfterSeam: 140,
    deformationMeters: 2.5,
    deformationDirection,
    gentleTurnLimitDegrees: 5,
    minDeformationRunVertices: 5,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
    dMax: 150,
    finishClosureMargin: 20,
    groundMapHalfWidth: 12,
    groundHalfWidth: 4.5,
    roadHalfWidth: CHILD_ROAD_HALF_WIDTH,
    shoulderWidth: 1,
  } as const;
}

function pointGeometry(
  id: string,
  point: { readonly x: number; readonly z: number; readonly heading: number },
  halfWidth: number,
): DeclarativeGateGeometry {
  return { id, center: { x: point.x, z: point.z }, heading: point.heading, halfWidth };
}

function requireStage(
  stages: readonly DeclarativeLiveRouteStageAuthoring[],
  id: string,
): DeclarativeLiveRouteStageAuthoring {
  const stage = stages.find((candidate) => candidate.id === id);
  if (!stage) throw new RangeError(`M6.35 missing upstream stage: ${id}`);
  return stage;
}

function chartPackage(runtime: StageRuntimeContentPackage): GuideChartRuntimePackage {
  const frame = runtime.coordinateFrame as Partial<GuideChart>;
  if (typeof frame.id !== 'string' || frame.guide === undefined || typeof frame.lateralOrigin !== 'number') {
    throw new RangeError(`M6.35 runtime package must use a GuideChart coordinate frame: ${runtime.packageId}`);
  }
  return runtime as GuideChartRuntimePackage;
}
