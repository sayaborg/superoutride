import { guideChartToWorld } from '../gameplay/guide-chart.js';
import type {
  DeclarativeGateGeometry,
  DeclarativeLiveRouteFinishAuthoring,
  DeclarativeLiveRouteStageAuthoring,
  DeclarativeLiveRouteTransitionAuthoring,
  GuideChartRuntimePackage,
} from './declarative-live-route.js';
import {
  createRasterStageSuccessor,
  type RasterStageSuccessorAuthoring,
  type RasterSuccessorRuntimeSource,
} from './raster-stage-successor.js';

export interface RasterSuccessorChainStepAuthoring {
  readonly stageId: string;
  readonly packageId: string;
  readonly choiceId: string;
  readonly gateId: string;
  readonly handoffId: string;
  readonly successor: RasterStageSuccessorAuthoring;
}

export interface RasterSuccessorChainAuthoring {
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

export interface CompiledRasterSuccessorChain {
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
export function compileRasterSuccessorChain(
  source: RasterSuccessorChainAuthoring,
): CompiledRasterSuccessorChain {
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

  const stages: DeclarativeLiveRouteStageAuthoring[] = [{
    id: source.sourceStageId,
    kind: 'STAGE',
    runtime: source.sourceRuntime,
  }];
  const transitions: DeclarativeLiveRouteTransitionAuthoring[] = [];
  const structurals: RasterSuccessorRuntimeSource[] = [source.sourceStructural];
  const runtimes: GuideChartRuntimePackage[] = [source.sourceRuntime];

  let fromStageId = source.sourceStageId;
  let currentStructural = source.sourceStructural;

  source.steps.forEach((step, index) => {
    requireUnique(stageIds, step.stageId, 'stage id');
    requireUnique(packageIds, step.packageId, 'package id');
    requireUnique(choiceIds, step.choiceId, 'choice id');
    requireUnique(geometryIds, step.gateId, 'gate/handoff id');
    requireUnique(geometryIds, step.handoffId, 'gate/handoff id');

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
      gate: chainGeometry(step.gateId, nextStructural, nextStructural.sourceTransitionS, source.halfWidth),
      handoff: chainGeometry(step.handoffId, nextStructural, nextStructural.sourceSeamS, source.halfWidth),
    });
    structurals.push(nextStructural);
    runtimes.push(runtime);
    fromStageId = step.stageId;
    currentStructural = nextStructural;
  });

  requireUnique(geometryIds, source.finishGateId, 'gate/handoff id');
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
    stages: Object.freeze(stages),
    transitions: Object.freeze(transitions),
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
  successor: RasterSuccessorRuntimeSource,
  sourceS: number,
  halfWidth: number,
): DeclarativeGateGeometry {
  return pointGeometry(
    id,
    guideChartToWorld(successor.link.sourceFrame, sourceS, 0),
    halfWidth,
  );
}

function pointGeometry(
  id: string,
  point: { readonly x: number; readonly z: number; readonly heading: number },
  halfWidth: number,
): DeclarativeGateGeometry {
  return { id, center: { x: point.x, z: point.z }, heading: point.heading, halfWidth };
}

function requireUnique(set: Set<string>, value: string, label: string): void {
  if (value.length === 0) throw new RangeError(`Raster successor chain ${label} must not be empty`);
  if (set.has(value)) throw new RangeError(`duplicate Raster successor chain ${label}: ${value}`);
  set.add(value);
}
