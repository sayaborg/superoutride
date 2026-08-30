import type { GuideCurve } from '../core/guide-curve.js';
import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
} from '../core/presentation-scale.js';
import type { GuideChart } from '../gameplay/guide-chart.js';
import {
  compileDeclarativeLiveRoute,
  type DeclarativeLiveRouteAuthoring,
  type GuideChartRuntimePackage,
} from '../runtime/declarative-live-route.js';
import { compileRasterForkStageRoute } from '../runtime/raster-fork-stage-route.js';
import { compileAuthoredStageRuntimePackage } from '../runtime/stage-authoring-compiler.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import type { StageRuntimeContentPackage } from '../runtime/stage-runtime-content.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import { createM621ChildVisualIdentity } from './m6-21-child-visual-identity.js';
import { createM624ChildStageAuthoring } from './m6-24-stage-authoring.js';
import { createM635SecondLiveForkAuthoring } from './m6-35-second-live-fork.js';

const WORLD_FRAME_ID = 'DEV_ROUTE_WORLD_V1';
const INCOMING_ROAD_WIDTH = 7;
const CHILD_ROAD_WIDTH = 7;
const FORK_WIDEN_START_S = 80;
const FORK_MEDIAN_START_S = 110;
const FORK_SEPARATED_START_S = 170;
const FORK_ROUTE_GATE_S = 195;
const FORK_SOURCE_SEAM_MIN_S = 235;

/**
 * M6.37 applies the already-generic M6.36 fork-stage compiler a second time, now to the surviving
 * RIGHT terminal. Both route sides therefore own a real second physical fork without adding route
 * decisions to main.ts, renderer Core, camera, or vehicle physics.
 */
function createM637SymmetricSecondLiveForkAuthoring(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): DeclarativeLiveRouteAuthoring {
  const upstream = createM635SecondLiveForkAuthoring(parentGuide, parentContent, spriteAssets);
  const identity = createM621ChildVisualIdentity();
  const authored = createM624ChildStageAuthoring(spriteAssets, identity);

  return compileRasterForkStageRoute({
    upstream,
    terminalStageId: 'GOAL_R',
    forkStageId: 'STAGE_4_R_FORK',
    forkPackageId: 'CONTENT_STAGE_4_R_FORK',
    routeGateS: FORK_ROUTE_GATE_S,
    junction: {
      roadViewId: 'RIGHT_SECOND_FORK_VIEW',
      surfaceSectionName: 'RIGHT_SECOND_FORK',
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
    },
    branches: [
      forkBranchAuthoring('A', 'LEFT', -1),
      forkBranchAuthoring('B', 'RIGHT', 1),
    ],
    createRuntime: (structural, branch) => chartPackage(compileAuthoredStageRuntimePackage({
      packageId: branch.packageId,
      worldFrameId: WORLD_FRAME_ID,
      coordinateFrame: structural.chart,
      roadView: structural.roadView,
      surfaceMap: structural.surfaceMap,
      groundProfile: structural.groundProfile,
    }, branch.side === 'LEFT' ? authored.left : authored.right)),
  }).authoring;
}

export function createM637SymmetricSecondLiveForkRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  return compileDeclarativeLiveRoute(
    createM637SymmetricSecondLiveForkAuthoring(parentGuide, parentContent, spriteAssets),
  );
}

function forkBranchAuthoring(
  label: 'A' | 'B',
  side: 'LEFT' | 'RIGHT',
  deformationDirection: -1 | 1,
) {
  return {
    side,
    stageId: `GOAL_R${label}`,
    packageId: `CONTENT_GOAL_R${label}`,
    choiceId: `S4R_FORK_${label}`,
    gateId: `G_LIVE_RIGHT_SECOND_FORK_${label}`,
    handoffId: `H_S4R_FORK_${label}`,
    finishGateId: `G_LIVE_FINISH_R${label}`,
    successor: {
      id: `RIGHT_SECOND_FORK_${label}_SUCCESSOR`,
      chartId: `RIGHT_SECOND_FORK_${label}_CHART`,
      roadViewId: `RIGHT_SECOND_FORK_${label}_VIEW`,
      surfaceSectionName: `RIGHT_SECOND_FORK_${label}_STAGE`,
      sourceSeamMinS: FORK_SOURCE_SEAM_MIN_S,
      overlapMargin: 30,
      transitionLead: 20,
      finishAfterSeam: 140,
      deformationMeters: 2.5,
      deformationDirection,
      gentleTurnLimitDegrees: 5,
      minDeformationRunVertices: 5,
      dCam: CURRENT_CAMERA_DISTANCE_METERS,
      dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
      finishClosureMargin: 20,
      groundMapHalfWidth: 12,
      groundHalfWidth: 4.5,
      shoulderWidth: 1,
    },
  } as const;
}

function chartPackage(runtime: StageRuntimeContentPackage): GuideChartRuntimePackage {
  const frame = runtime.coordinateFrame as Partial<GuideChart>;
  if (typeof frame.id !== 'string' || frame.guide === undefined || typeof frame.lateralOrigin !== 'number') {
    throw new RangeError(`M6.37 runtime package must use a GuideChart coordinate frame: ${runtime.packageId}`);
  }
  return runtime as GuideChartRuntimePackage;
}
