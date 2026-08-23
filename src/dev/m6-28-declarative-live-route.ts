import type { GuideCurve } from '../core/guide-curve.js';
import { guideChartToWorld, type GuideChart } from '../gameplay/guide-chart.js';
import {
  compileDeclarativeLiveRoute,
  type DeclarativeGateGeometry,
  type GuideChartRuntimePackage,
} from '../runtime/declarative-live-route.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import type { StageRuntimeContentPackage } from '../runtime/stage-runtime-content.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import { M6_13_JUNCTION } from './m6-13-junction.js';
import { M6_15_ROUTE_GATE_S } from './m6-15-visible-route-gates.js';
import { M6_17_HANDOFF_SEAM_S } from './m6-17-handoff-seams.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import {
  createM626LiveContinuation,
  type M626LiveContinuation,
  type M626SuccessorRuntimeSource,
} from './m6-26-live-successor-stage.js';
import { createM626LiveStageRuntimePackages } from './m6-26-live-runtime-content.js';

const WORLD_FRAME_ID = 'DEV_ROUTE_WORLD_V1';
const ROAD_HALF_WIDTH = 3.5;

/**
 * M6.28 current-route authoring: topology, physical gate geometry and handoff seams are rows.
 * Content package IDs and target chart IDs are not repeated; the generic compiler derives them
 * from the stage-owned runtime packages.
 */
export function createM628DeclarativeLiveRouteRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  const continuation = createM626LiveContinuation(parentGuide);
  const packages = createM626LiveStageRuntimePackages(
    continuation,
    parentContent,
    spriteAssets,
    WORLD_FRAME_ID,
  );
  const byId = new Map(packages.map((runtime) => [runtime.packageId, chartPackage(runtime)]));
  const runtime = (packageId: string): GuideChartRuntimePackage => {
    const found = byId.get(packageId);
    if (!found) throw new RangeError(`M6.28 missing runtime package: ${packageId}`);
    return found;
  };

  return compileDeclarativeLiveRoute({
    startStageId: 'STAGE_1',
    stages: [
      { id: 'STAGE_1', kind: 'STAGE', runtime: runtime('CONTENT_STAGE_1') },
      { id: 'STAGE_2_L', kind: 'STAGE', runtime: runtime('CONTENT_STAGE_2_L') },
      { id: 'STAGE_2_R', kind: 'STAGE', runtime: runtime('CONTENT_STAGE_2_R') },
      { id: 'GOAL_L', kind: 'TERMINAL', runtime: runtime('CONTENT_GOAL_L') },
      { id: 'GOAL_R', kind: 'TERMINAL', runtime: runtime('CONTENT_GOAL_R') },
    ],
    transitions: [
      {
        id: 'S1_LEFT',
        fromStageId: 'STAGE_1',
        toStageId: 'STAGE_2_L',
        gate: parentTransitionGeometry(continuation, 'G_LIVE_LEFT', 'LEFT'),
        handoff: parentHandoffGeometry(continuation, 'H_S1_LEFT', 'LEFT'),
      },
      {
        id: 'S1_RIGHT',
        fromStageId: 'STAGE_1',
        toStageId: 'STAGE_2_R',
        gate: parentTransitionGeometry(continuation, 'G_LIVE_RIGHT', 'RIGHT'),
        handoff: parentHandoffGeometry(continuation, 'H_S1_RIGHT', 'RIGHT'),
      },
      {
        id: 'S2L_CONTINUE',
        fromStageId: 'STAGE_2_L',
        toStageId: 'GOAL_L',
        gate: successorTransitionGeometry(continuation.leftSuccessor, 'G_LIVE_STAGE2_L'),
        handoff: successorHandoffGeometry(continuation.leftSuccessor, 'H_S2L_CONTINUE'),
      },
      {
        id: 'S2R_CONTINUE',
        fromStageId: 'STAGE_2_R',
        toStageId: 'GOAL_R',
        gate: successorTransitionGeometry(continuation.rightSuccessor, 'G_LIVE_STAGE2_R'),
        handoff: successorHandoffGeometry(continuation.rightSuccessor, 'H_S2R_CONTINUE'),
      },
    ],
    finishes: [
      { stageId: 'GOAL_L', gate: successorFinishGeometry(continuation.leftSuccessor, 'G_LIVE_FINISH_L') },
      { stageId: 'GOAL_R', gate: successorFinishGeometry(continuation.rightSuccessor, 'G_LIVE_FINISH_R') },
    ],
  });
}

function parentTransitionGeometry(
  continuation: M626LiveContinuation,
  id: string,
  side: 'LEFT' | 'RIGHT',
): DeclarativeGateGeometry {
  const localL = M6_13_JUNCTION.separatedChildCenterL(side);
  return pointGeometry(id, guideChartToWorld(continuation.base.charts.parent, M6_15_ROUTE_GATE_S, localL));
}

function parentHandoffGeometry(
  continuation: M626LiveContinuation,
  id: string,
  side: 'LEFT' | 'RIGHT',
): DeclarativeGateGeometry {
  const localL = M6_13_JUNCTION.separatedChildCenterL(side);
  return pointGeometry(id, guideChartToWorld(continuation.base.charts.parent, M6_17_HANDOFF_SEAM_S, localL));
}

function successorTransitionGeometry(
  successor: M626SuccessorRuntimeSource,
  id: string,
): DeclarativeGateGeometry {
  return pointGeometry(
    id,
    guideChartToWorld(successor.link.sourceFrame as GuideChart, successor.sourceTransitionS, 0),
  );
}

function successorHandoffGeometry(
  successor: M626SuccessorRuntimeSource,
  id: string,
): DeclarativeGateGeometry {
  return pointGeometry(
    id,
    guideChartToWorld(successor.link.sourceFrame as GuideChart, successor.sourceSeamS, 0),
  );
}

function successorFinishGeometry(
  successor: M626SuccessorRuntimeSource,
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
    throw new RangeError(`M6.28 runtime package must use a GuideChart coordinate frame: ${runtime.packageId}`);
  }
  return runtime as GuideChartRuntimePackage;
}
