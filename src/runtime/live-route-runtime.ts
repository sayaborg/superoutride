import type { GuideChart } from '../gameplay/guide-chart.js';
import type { RouteBoundaryGateSet } from '../gameplay/route-boundary-gates.js';
import type { RouteDag } from '../gameplay/route-dag.js';
import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import type { RouteStageHandoffManifest } from '../gameplay/route-stage-handoff.js';
import {
  compileFieldRouteProgressRules,
  type FieldRouteProgressRules,
} from '../gameplay/field-route-progress.js';
import type { StageRuntimeContentRegistry } from './stage-runtime-content.js';

/**
 * Complete already-compiled live route runtime consumed by the browser loop.
 *
 * This boundary deliberately owns no renderer, camera or vehicle state. It only proves that the
 * separately compiled route/content/chart/gate/handoff/runtime tables agree with each other before
 * simulation begins.
 */
export interface LiveRouteRuntimeAssembly {
  readonly route: RouteDag;
  readonly content: RouteStageContentManifest;
  readonly charts: readonly GuideChart[];
  readonly gates: RouteBoundaryGateSet;
  readonly handoffs: RouteStageHandoffManifest;
  readonly registry: StageRuntimeContentRegistry;
  readonly initialChart: GuideChart;
  readonly progress: FieldRouteProgressRules;
}

type LiveRouteRuntimeAssemblySource = Omit<LiveRouteRuntimeAssembly, 'progress'>;

export function compileLiveRouteRuntimeAssembly(
  source: LiveRouteRuntimeAssemblySource,
): LiveRouteRuntimeAssembly {
  const chartById = new Map<string, GuideChart>();
  for (const chart of source.charts) {
    if (chartById.has(chart.id)) throw new RangeError(`duplicate live route chart id: ${chart.id}`);
    chartById.set(chart.id, chart);
  }
  if (source.charts.length === 0) throw new RangeError('live route runtime requires at least one Guide chart');
  if (chartById.get(source.initialChart.id) !== source.initialChart) {
    throw new RangeError('live route initial chart must belong to the compiled chart set');
  }

  if (source.registry.worldFrameId !== source.content.worldFrameId) {
    throw new RangeError('live route runtime/content world frame mismatch');
  }

  const bindingByStage = new Map(source.content.bindings.map((binding) => [binding.stageId, binding]));
  const runtimeByPackage = new Map(source.registry.packages.map((runtime) => [runtime.packageId, runtime]));
  const startBinding = bindingByStage.get(source.route.startStageId);
  if (!startBinding) throw new RangeError('live route start stage is missing a content binding');
  const startRuntime = runtimeByPackage.get(startBinding.packageId);
  if (!startRuntime) throw new RangeError('live route start package is missing runtime content');
  if (startRuntime.coordinateFrame !== source.initialChart) {
    throw new RangeError('live route start package coordinate frame must be the initial chart');
  }

  const usedChartIds = new Set<string>([source.initialChart.id]);
  for (const choice of source.route.choices) {
    const seam = source.handoffs.seams.find((candidate) => candidate.choiceId === choice.id);
    if (!seam) throw new RangeError(`live route choice is missing handoff seam: ${choice.id}`);
    const targetChart = chartById.get(seam.targetChartId);
    if (!targetChart) throw new RangeError(`live route handoff references unknown chart: ${seam.targetChartId}`);

    const targetBinding = bindingByStage.get(choice.toStageId);
    if (!targetBinding) throw new RangeError(`live route target stage is missing content binding: ${choice.toStageId}`);
    const targetRuntime = runtimeByPackage.get(targetBinding.packageId);
    if (!targetRuntime) throw new RangeError(`live route target package is missing runtime content: ${targetBinding.packageId}`);
    if (targetRuntime.coordinateFrame !== targetChart) {
      throw new RangeError(`live route handoff/content chart mismatch for choice: ${choice.id}`);
    }
    usedChartIds.add(targetChart.id);
  }

  for (const chart of source.charts) {
    if (!usedChartIds.has(chart.id)) throw new RangeError(`live route chart is unreachable from handoffs: ${chart.id}`);
  }

  const gateChoiceIds = new Set(
    source.gates.gates.filter((gate) => gate.kind === 'TRANSITION').map((gate) => gate.choiceId),
  );
  for (const choice of source.route.choices) {
    if (!gateChoiceIds.has(choice.id)) throw new RangeError(`live route choice is missing physical transition gate: ${choice.id}`);
  }

  const terminalStageIds = new Set(source.route.stages.filter((stage) => stage.kind === 'TERMINAL').map((stage) => stage.id));
  const finishStageIds = new Set(
    source.gates.gates.filter((gate) => gate.kind === 'FINISH').map((gate) => gate.stageId),
  );
  for (const terminalStageId of terminalStageIds) {
    if (!finishStageIds.has(terminalStageId)) {
      throw new RangeError(`live route terminal stage is missing physical FINISH gate: ${terminalStageId}`);
    }
  }

  const progress = compileFieldRouteProgressRules(
    source.route,
    source.gates,
    source.handoffs,
    source.content.bindings.map((binding) => {
      const runtime = runtimeByPackage.get(binding.packageId);
      if (!runtime) throw new Error(`live route progress package is missing: ${binding.packageId}`);
      return Object.freeze({ stageId: binding.stageId, coordinateFrame: runtime.coordinateFrame });
    }),
  );

  return Object.freeze({
    route: source.route,
    content: source.content,
    charts: Object.freeze([...source.charts]),
    gates: source.gates,
    handoffs: source.handoffs,
    registry: source.registry,
    initialChart: source.initialChart,
    progress,
  });
}
