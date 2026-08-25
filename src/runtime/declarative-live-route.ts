import type { Vec2 } from '../core/math.js';
import type { GuideChart } from '../gameplay/guide-chart.js';
import {
  compileRouteBoundaryGateSet,
  type RouteBoundaryGateAuthoringBase,
} from '../gameplay/route-boundary-gates.js';
import { compileRouteDag, type RouteStageKind } from '../gameplay/route-dag.js';
import { compileRouteStageContentManifest } from '../gameplay/route-stage-content.js';
import {
  compileRouteStageHandoffManifest,
  type RouteStageHandoffSeamAuthoring,
} from '../gameplay/route-stage-handoff.js';
import {
  compileLiveRouteRuntimeAssembly,
  type LiveRouteRuntimeAssembly,
} from './live-route-runtime.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
} from './stage-runtime-content.js';

export type GuideChartRuntimePackage = StageRuntimeContentPackage & {
  readonly coordinateFrame: GuideChart;
};

export interface DeclarativeLiveRouteStageAuthoring {
  readonly id: string;
  readonly kind: RouteStageKind;
  readonly runtime: GuideChartRuntimePackage;
}

export interface DeclarativeGateGeometry {
  readonly id: string;
  readonly center: Vec2;
  readonly heading: number;
  readonly halfWidth: number;
}

export interface DeclarativeHandoffGeometry extends DeclarativeGateGeometry {
  readonly sourceSeamS: number;
  readonly targetSeamS: number;
  readonly sourceLocalL: number;
  readonly targetLocalL: number;
}

export interface DeclarativeLiveRouteTransitionAuthoring {
  readonly id: string;
  readonly fromStageId: string;
  readonly toStageId: string;
  /** Physical route-choice gate. choiceId is derived from id. */
  readonly gate: DeclarativeGateGeometry;
  /** Deferred handoff seam. targetChartId is derived from the target stage runtime package. */
  readonly handoff: DeclarativeHandoffGeometry;
}

export interface DeclarativeLiveRouteFinishAuthoring {
  readonly stageId: string;
  readonly gate: DeclarativeGateGeometry;
}

export interface DeclarativeLiveRouteAuthoring {
  readonly startStageId: string;
  readonly stages: readonly DeclarativeLiveRouteStageAuthoring[];
  readonly transitions: readonly DeclarativeLiveRouteTransitionAuthoring[];
  readonly finishes: readonly DeclarativeLiveRouteFinishAuthoring[];
}

/**
 * Compile one complete live point-to-point runtime from declarative stage/edge rows.
 *
 * Package refs, stage-content bindings, transition choiceIds and handoff targetChartIds are all
 * derived here rather than repeated in authoring. Physical gate/seam geometry remains explicit.
 */
export function compileDeclarativeLiveRoute(
  source: DeclarativeLiveRouteAuthoring,
): LiveRouteRuntimeAssembly {
  if (source.stages.length === 0) throw new RangeError('declarative live route requires at least one stage');

  const stageById = new Map<string, DeclarativeLiveRouteStageAuthoring>();
  for (const stage of source.stages) {
    if (stageById.has(stage.id)) throw new RangeError(`duplicate declarative live route stage id: ${stage.id}`);
    stageById.set(stage.id, stage);
  }

  const route = compileRouteDag(
    source.startStageId,
    source.stages.map(({ id, kind }) => ({ id, kind })),
    source.transitions.map(({ id, fromStageId, toStageId }) => ({ id, fromStageId, toStageId })),
  );

  const packageRuntimeById = new Map<string, GuideChartRuntimePackage>();
  for (const stage of source.stages) {
    const existing = packageRuntimeById.get(stage.runtime.packageId);
    if (existing && existing !== stage.runtime) {
      throw new RangeError(`declarative live route packageId maps to multiple runtime objects: ${stage.runtime.packageId}`);
    }
    packageRuntimeById.set(stage.runtime.packageId, stage.runtime);
  }

  const content = compileRouteStageContentManifest(
    route,
    [...packageRuntimeById.values()].map((runtime) => ({
      packageId: runtime.packageId,
      worldFrameId: runtime.worldFrameId,
    })),
    source.stages.map((stage) => ({
      stageId: stage.id,
      packageId: stage.runtime.packageId,
    })),
  );
  const registry = compileStageRuntimeContentRegistry(content, [...packageRuntimeById.values()]);

  const chartById = new Map<string, GuideChart>();
  for (const stage of source.stages) {
    const chart = stage.runtime.coordinateFrame;
    const existing = chartById.get(chart.id);
    if (existing && existing !== chart) {
      throw new RangeError(`declarative live route chart id maps to multiple GuideChart objects: ${chart.id}`);
    }
    chartById.set(chart.id, chart);
  }
  const charts = [...chartById.values()];

  const gateAuthoring = [
    ...source.transitions.map((transition) => ({
      ...gateBase(transition.gate),
      kind: 'TRANSITION' as const,
      choiceId: transition.id,
    })),
    ...source.finishes.map((finish) => ({
      ...gateBase(finish.gate),
      kind: 'FINISH' as const,
      stageId: finish.stageId,
    })),
  ];
  const gates = compileRouteBoundaryGateSet(route, gateAuthoring);

  const handoffAuthoring: RouteStageHandoffSeamAuthoring[] = source.transitions.map((transition) => {
    const targetStage = stageById.get(transition.toStageId);
    if (!targetStage) throw new RangeError(`declarative transition targets unknown stage: ${transition.toStageId}`);
    return {
      ...transition.handoff,
      choiceId: transition.id,
      targetChartId: targetStage.runtime.coordinateFrame.id,
    };
  });
  const handoffs = compileRouteStageHandoffManifest(route, charts, handoffAuthoring);

  const startStage = stageById.get(source.startStageId);
  if (!startStage) throw new RangeError('declarative start stage is missing');

  return compileLiveRouteRuntimeAssembly({
    route,
    content,
    charts,
    gates,
    handoffs,
    registry,
    initialChart: startStage.runtime.coordinateFrame,
  });
}

function gateBase(source: DeclarativeGateGeometry): RouteBoundaryGateAuthoringBase {
  return {
    id: source.id,
    center: source.center,
    heading: source.heading,
    halfWidth: source.halfWidth,
  };
}
