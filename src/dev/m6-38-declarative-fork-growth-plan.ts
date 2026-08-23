import type { GuideCurve } from '../core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import type { GuideChart } from '../gameplay/guide-chart.js';
import {
  compileDeclarativeLiveRoute,
  type DeclarativeLiveRouteAuthoring,
  type GuideChartRuntimePackage,
} from '../runtime/declarative-live-route.js';
import {
  compileRasterForkGrowthPlan,
  type RasterForkGrowthStep,
} from '../runtime/raster-fork-growth-plan.js';
import type { RasterForkStageBranchAuthoring } from '../runtime/raster-fork-stage-route.js';
import { compileAuthoredStageRuntimePackage } from '../runtime/stage-authoring-compiler.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import type { StageRuntimeContentPackage } from '../runtime/stage-runtime-content.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import { createM621ChildVisualIdentity } from './m6-21-child-visual-identity.js';
import { createM624ChildStageAuthoring } from './m6-24-stage-authoring.js';
import { createM630ThirdLiveSuccessorAuthoring } from './m6-30-third-live-successor.js';

const WORLD_FRAME_ID = 'DEV_ROUTE_WORLD_V1';
const FORK_ROUTE_GATE_S = 195;
const FORK_SOURCE_SEAM_MIN_S = 235;

const SECOND_FORK_JUNCTION = Object.freeze({
  sWidenStart: 80,
  sMedianStart: 110,
  sSeparatedStart: 170,
  parentRoadWidth: 7,
  childRoadWidth: 7,
  finalMedianWidth: 8,
  shoulderWidth: 1,
});

interface LiveForkIdentity {
  readonly terminalStageId: string;
  readonly forkStageId: string;
  readonly forkPackageId: string;
  readonly roadViewId: string;
  readonly surfaceSectionName: string;
  readonly branchStagePrefix: string;
  readonly branchPackagePrefix: string;
  readonly choicePrefix: string;
  readonly gatePrefix: string;
  readonly handoffPrefix: string;
  readonly finishPrefix: string;
  readonly successorPrefix: string;
}

const LEFT_SECOND_FORK: LiveForkIdentity = Object.freeze({
  terminalStageId: 'GOAL_L',
  forkStageId: 'STAGE_4_L_FORK',
  forkPackageId: 'CONTENT_STAGE_4_L_FORK',
  roadViewId: 'LEFT_SECOND_FORK_VIEW',
  surfaceSectionName: 'LEFT_SECOND_FORK',
  branchStagePrefix: 'GOAL_L',
  branchPackagePrefix: 'CONTENT_GOAL_L',
  choicePrefix: 'S4L_FORK_',
  gatePrefix: 'G_LIVE_SECOND_FORK_',
  handoffPrefix: 'H_S4L_FORK_',
  finishPrefix: 'G_LIVE_FINISH_L',
  successorPrefix: 'LEFT_SECOND_FORK_',
});

const RIGHT_SECOND_FORK: LiveForkIdentity = Object.freeze({
  terminalStageId: 'GOAL_R',
  forkStageId: 'STAGE_4_R_FORK',
  forkPackageId: 'CONTENT_STAGE_4_R_FORK',
  roadViewId: 'RIGHT_SECOND_FORK_VIEW',
  surfaceSectionName: 'RIGHT_SECOND_FORK',
  branchStagePrefix: 'GOAL_R',
  branchPackagePrefix: 'CONTENT_GOAL_R',
  choicePrefix: 'S4R_FORK_',
  gatePrefix: 'G_LIVE_RIGHT_SECOND_FORK_',
  handoffPrefix: 'H_S4R_FORK_',
  finishPrefix: 'G_LIVE_FINISH_R',
  successorPrefix: 'RIGHT_SECOND_FORK_',
});

/**
 * M6.38 expresses both live second forks as ordered data applied to one M6.30 base authoring.
 * The plan adds no geometry authority: every step still executes the unchanged M6.36 compiler.
 */
export function createM638DeclarativeForkGrowthAuthoring(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): DeclarativeLiveRouteAuthoring {
  const upstream = createM630ThirdLiveSuccessorAuthoring(parentGuide, parentContent, spriteAssets);
  const identity = createM621ChildVisualIdentity();
  const authored = createM624ChildStageAuthoring(spriteAssets, identity);

  const createRuntime = (
    structural: Parameters<RasterForkGrowthStep['createRuntime']>[0],
    branch: RasterForkStageBranchAuthoring,
  ): GuideChartRuntimePackage => chartPackage(compileAuthoredStageRuntimePackage({
    packageId: branch.packageId,
    worldFrameId: WORLD_FRAME_ID,
    coordinateFrame: structural.chart,
    roadView: structural.roadView,
    surfaceMap: structural.surfaceMap,
    groundProfile: structural.groundProfile,
  }, branch.side === 'LEFT' ? authored.left : authored.right));

  return compileRasterForkGrowthPlan(upstream, [
    liveForkStep(LEFT_SECOND_FORK, createRuntime),
    liveForkStep(RIGHT_SECOND_FORK, createRuntime),
  ]).authoring;
}

export function createM638DeclarativeForkGrowthRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  return compileDeclarativeLiveRoute(
    createM638DeclarativeForkGrowthAuthoring(parentGuide, parentContent, spriteAssets),
  );
}

function liveForkStep(
  identity: LiveForkIdentity,
  createRuntime: RasterForkGrowthStep['createRuntime'],
): RasterForkGrowthStep {
  return Object.freeze({
    terminalStageId: identity.terminalStageId,
    forkStageId: identity.forkStageId,
    forkPackageId: identity.forkPackageId,
    routeGateS: FORK_ROUTE_GATE_S,
    junction: Object.freeze({
      roadViewId: identity.roadViewId,
      surfaceSectionName: identity.surfaceSectionName,
      crossSection: SECOND_FORK_JUNCTION,
      outerSurfaceType: 'GRASS',
    }),
    branches: Object.freeze([
      liveForkBranch(identity, 'A', 'LEFT', -1),
      liveForkBranch(identity, 'B', 'RIGHT', 1),
    ]),
    createRuntime,
  });
}

function liveForkBranch(
  identity: LiveForkIdentity,
  label: 'A' | 'B',
  side: 'LEFT' | 'RIGHT',
  deformationDirection: -1 | 1,
): RasterForkStageBranchAuthoring {
  return Object.freeze({
    side,
    stageId: `${identity.branchStagePrefix}${label}`,
    packageId: `${identity.branchPackagePrefix}${label}`,
    choiceId: `${identity.choicePrefix}${label}`,
    gateId: `${identity.gatePrefix}${label}`,
    handoffId: `${identity.handoffPrefix}${label}`,
    finishGateId: `${identity.finishPrefix}${label}`,
    successor: Object.freeze({
      id: `${identity.successorPrefix}${label}_SUCCESSOR`,
      chartId: `${identity.successorPrefix}${label}_CHART`,
      roadViewId: `${identity.successorPrefix}${label}_VIEW`,
      surfaceSectionName: `${identity.successorPrefix}${label}_STAGE`,
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
      shoulderWidth: 1,
    }),
  });
}

function chartPackage(runtime: StageRuntimeContentPackage): GuideChartRuntimePackage {
  const frame = runtime.coordinateFrame as Partial<GuideChart>;
  if (typeof frame.id !== 'string' || frame.guide === undefined || typeof frame.lateralOrigin !== 'number') {
    throw new RangeError(`M6.38 runtime package must use a GuideChart coordinate frame: ${runtime.packageId}`);
  }
  return runtime as GuideChartRuntimePackage;
}
