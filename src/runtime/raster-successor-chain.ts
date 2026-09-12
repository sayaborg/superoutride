import { uniqueKey } from '../core/validation.js';
import { guideChartToWorld, type GuideChart } from '../gameplay/guide-chart.js';
import type {
  DeclarativeGateGeometry,
  DeclarativeHandoffGeometry,
  DeclarativeLiveRouteFinishAuthoring,
  DeclarativeLiveRouteStageAuthoring,
  DeclarativeLiveRouteTransitionAuthoring,
  GuideChartRuntimePackage,
} from './declarative-live-route.js';
import { pointGeometry } from './declarative-live-route.js';
import {
  createRasterStageSuccessor,
  type RasterSuccessorAuthoring,
  type RasterSuccessorRuntimeSource,
} from './raster-stage-successor.js';

interface RasterSuccessorChainStepAuthoring {
  readonly stageId: string;
  readonly packageId: string;
  readonly choiceId: string;
  readonly gateId: string;
  readonly handoffId: string;
  readonly successor: RasterSuccessorAuthoring;
}

interface RasterSuccessorChainAuthoring {
  readonly sourceStageId: string;
  readonly sourceRuntime: GuideChartRuntimePackage;
  readonly sourceStructural: RasterSuccessorRuntimeSource;
  readonly steps: readonly RasterSuccessorChainStepAuthoring[];
  readonly finishGateId: string;
  readonly halfWidth: number;
  /**
   * Build ordinary stage content for each generated structural successor. The compiler owns
   * topology/geometry derivation; environment/content ownership stays outside this primitive.
   */
  readonly createRuntime: (
    structural: RasterSuccessorRuntimeSource,
    packageId: string,
    stageId: string,
    stepIndex: number,
  ) => GuideChartRuntimePackage;
}

interface CompiledRasterSuccessorChain {
  readonly stages: readonly DeclarativeLiveRouteStageAuthoring[];
  readonly transitions: readonly DeclarativeLiveRouteTransitionAuthoring[];
  readonly finish: DeclarativeLiveRouteFinishAuthoring;
  readonly structurals: readonly RasterSuccessorRuntimeSource[];
  readonly runtimes: readonly GuideChartRuntimePackage[];
}

/**
 * Compile a linear sequence of independent Raster stage successors.
 *
 * The source stage is emitted as a non-terminal STAGE. Every generated stage except the last is
 * also STAGE; the final generated stage is TERMINAL and receives the physical FINISH gate.
 * Transition gates and handoff seams are derived from each generated StageContinuationLink rather
 * than being duplicated by route authoring.
 */
export function compileRasterSuccessorChain(source: RasterSuccessorChainAuthoring): CompiledRasterSuccessorChain {
  if (source.steps.length === 0) {
    throw new RangeError('Raster successor chain requires at least one successor step');
  }
  if (!(source.halfWidth > 0) || !Number.isFinite(source.halfWidth)) {
    throw new RangeError('Raster successor chain halfWidth must be finite and > 0');
  }

  const stageIds = new Set<string>([source.sourceStageId]);
  const packageIds = new Set<string>([source.sourceRuntime.packageId]);
  const choiceIds = new Set<string>();
  const geometryIds = new Set<string>();

  const stages: DeclarativeLiveRouteStageAuthoring[] = [
    {
      id: source.sourceStageId,
      kind: 'STAGE',
      runtime: source.sourceRuntime,
    },
  ];
  const transitions: DeclarativeLiveRouteTransitionAuthoring[] = [];
  const structurals: RasterSuccessorRuntimeSource[] = [source.sourceStructural];
  const runtimes: GuideChartRuntimePackage[] = [source.sourceRuntime];

  let fromStageId = source.sourceStageId;
  let currentStructural = source.sourceStructural;

  source.steps.forEach((step, index) => {
    uniqueKey(stageIds, step.stageId, 'Raster successor chain stage id');
    uniqueKey(packageIds, step.packageId, 'Raster successor chain package id');
    uniqueKey(choiceIds, step.choiceId, 'Raster successor chain choice id');
    uniqueKey(geometryIds, step.gateId, 'Raster successor chain gate/handoff id');
    uniqueKey(geometryIds, step.handoffId, 'Raster successor chain gate/handoff id');

    const sourceChart = currentStructural.chart;
    const nextStructural = createRasterStageSuccessor(currentStructural, step.successor);
    const runtime = source.createRuntime(nextStructural, step.packageId, step.stageId, index);
    if (runtime.packageId !== step.packageId) {
      throw new RangeError(`Raster successor chain runtime package mismatch for ${step.stageId}`);
    }
    if (runtime.coordinateFrame !== nextStructural.chart) {
      throw new RangeError(`Raster successor chain runtime must own generated chart for ${step.stageId}`);
    }

    const isTerminal = index === source.steps.length - 1;
    stages.push({ id: step.stageId, kind: isTerminal ? 'TERMINAL' : 'STAGE', runtime });
    transitions.push({
      id: step.choiceId,
      fromStageId,
      toStageId: step.stageId,
      gate: chainGeometry(step.gateId, sourceChart, nextStructural.sourceTransitionS, source.halfWidth),
      handoff: chainHandoffGeometry(step.handoffId, sourceChart, nextStructural, source.halfWidth),
    });
    structurals.push(nextStructural);
    runtimes.push(runtime);
    fromStageId = step.stageId;
    currentStructural = nextStructural;
  });

  uniqueKey(geometryIds, source.finishGateId, 'Raster successor chain gate/handoff id');
  const finalStep = source.steps[source.steps.length - 1]!;
  const finish: DeclarativeLiveRouteFinishAuthoring = {
    stageId: finalStep.stageId,
    gate: pointGeometry(
      source.finishGateId,
      guideChartToWorld(currentStructural.chart, currentStructural.finishS, 0),
      source.halfWidth,
    ),
  };

  return Object.freeze({
    stages: Object.freeze(stages.map((stage) => Object.freeze(stage))),
    transitions: Object.freeze(transitions.map((transition) => Object.freeze(transition))),
    finish: Object.freeze(finish),
    structurals: Object.freeze(structurals),
    runtimes: Object.freeze(runtimes),
  });
}

/** Re-label an existing GuideChart runtime without changing any owned geometry/content object. */
export function repackageGuideChartRuntime(
  runtime: GuideChartRuntimePackage,
  packageId: string,
): GuideChartRuntimePackage {
  if (packageId.length === 0) throw new RangeError('repackaged runtime requires a packageId');
  return Object.freeze({ ...runtime, packageId });
}

function chainGeometry(
  id: string,
  sourceChart: GuideChart,
  sourceS: number,
  halfWidth: number,
): DeclarativeGateGeometry {
  return pointGeometry(id, guideChartToWorld(sourceChart, sourceS, 0), halfWidth);
}

function chainHandoffGeometry(
  id: string,
  sourceChart: GuideChart,
  target: RasterSuccessorRuntimeSource,
  halfWidth: number,
): DeclarativeHandoffGeometry {
  return Object.freeze({
    ...chainGeometry(id, sourceChart, target.link.sourceSeamS, halfWidth),
    sourceSeamS: target.link.sourceSeamS,
    targetSeamS: target.link.targetSeamS,
    sourceLocalL: target.link.sourceLocalL,
    targetLocalL: target.link.targetLocalL,
  });
}
