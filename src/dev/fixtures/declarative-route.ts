import type { GuidePath } from '../../core/guide-curve.js';
import { guideChartToWorld, type GuideChart } from '../../gameplay/guide-chart.js';
import {
  compileDeclarativeLiveRoute,
  pointGeometry,
  type DeclarativeGateGeometry,
  type DeclarativeHandoffGeometry,
  type GuideChartRuntimePackage,
} from '../../runtime/declarative-live-route.js';
import type { LiveRouteRuntimeAssembly } from '../../runtime/live-route-runtime.js';
import type { SharedRuntimeContent } from '../courses/shared-runtime-content.js';
import { chartPackage } from '../courses/shared-runtime-content.js';

import type { SpriteAssets } from '../../visual/sprite-assets.js';
import { STADIUM_HANDOFF_SEAM_S } from '../courses/stadium-handoff.js';
import { STADIUM_JUNCTION } from '../courses/stadium-junction.js';
import { STADIUM_ROUTE_GATE_S } from '../courses/stadium-route-gates.js';
import { createSuccessorStagePackages } from '../courses/successor-stage-content.js';
import {
  createLiveContinuation,
  type LiveContinuation,
  type SuccessorRuntimeSource,
} from '../courses/successor-stage-continuation.js';

const WORLD_FRAME_ID = 'DEV_ROUTE_WORLD_V1';
const ROAD_HALF_WIDTH = 3.5;

/**
 * Declarative route fixture: topology, physical gate geometry and handoff seams are rows.
 * Content package IDs and target chart IDs are not repeated; the generic compiler derives them
 * from the stage-owned runtime packages.
 */
export function createDeclarativeLiveRouteRuntime(
  parentGuide: GuidePath,
  parentContent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
): LiveRouteRuntimeAssembly {
  const continuation = createLiveContinuation(parentGuide);
  const packages = createSuccessorStagePackages(continuation, parentContent, spriteAssets, WORLD_FRAME_ID);
  const byId = new Map(packages.map((runtime) => [runtime.packageId, chartPackage(runtime)]));
  const runtime = (packageId: string): GuideChartRuntimePackage => {
    const found = byId.get(packageId);
    if (!found) throw new RangeError(`missing runtime package: ${packageId}`);
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
  continuation: LiveContinuation,
  id: string,
  side: 'LEFT' | 'RIGHT',
): DeclarativeGateGeometry {
  const localL = STADIUM_JUNCTION.separatedChildCenterL(side);
  return pointGeometry(
    id,
    guideChartToWorld(continuation.base.charts.parent, STADIUM_ROUTE_GATE_S, localL),
    ROAD_HALF_WIDTH,
  );
}

function parentHandoffGeometry(
  continuation: LiveContinuation,
  id: string,
  side: 'LEFT' | 'RIGHT',
): DeclarativeHandoffGeometry {
  const localL = STADIUM_JUNCTION.separatedChildCenterL(side);
  return {
    ...pointGeometry(
      id,
      guideChartToWorld(continuation.base.charts.parent, STADIUM_HANDOFF_SEAM_S, localL),
      ROAD_HALF_WIDTH,
    ),
    sourceSeamS: STADIUM_HANDOFF_SEAM_S,
    targetSeamS: continuation.base.handoffLocalS,
    sourceLocalL: localL,
    targetLocalL: 0,
  };
}

function successorTransitionGeometry(successor: SuccessorRuntimeSource, id: string): DeclarativeGateGeometry {
  return pointGeometry(
    id,
    guideChartToWorld(successor.link.sourceFrame as GuideChart, successor.sourceTransitionS, 0),
    ROAD_HALF_WIDTH,
  );
}

function successorHandoffGeometry(successor: SuccessorRuntimeSource, id: string): DeclarativeHandoffGeometry {
  return {
    ...pointGeometry(
      id,
      guideChartToWorld(successor.link.sourceFrame as GuideChart, successor.sourceSeamS, 0),
      ROAD_HALF_WIDTH,
    ),
    sourceSeamS: successor.link.sourceSeamS,
    targetSeamS: successor.link.targetSeamS,
    sourceLocalL: successor.link.sourceLocalL,
    targetLocalL: successor.link.targetLocalL,
  };
}

function successorFinishGeometry(successor: SuccessorRuntimeSource, id: string): DeclarativeGateGeometry {
  return pointGeometry(id, guideChartToWorld(successor.chart, successor.finishS, 0), ROAD_HALF_WIDTH);
}
