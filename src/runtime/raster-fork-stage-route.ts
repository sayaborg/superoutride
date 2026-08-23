import { guideChartToWorld } from '../gameplay/guide-chart.js';
import type {
  DeclarativeGateGeometry,
  DeclarativeLiveRouteAuthoring,
  DeclarativeLiveRouteFinishAuthoring,
  DeclarativeLiveRouteStageAuthoring,
  DeclarativeLiveRouteTransitionAuthoring,
  GuideChartRuntimePackage,
} from './declarative-live-route.js';
import { composeDeclarativeLiveRouteAuthoring } from './declarative-route-fragment.js';
import { createRasterForkStageSuccessor } from './raster-fork-successor.js';
import { repackageGuideChartRuntime } from './raster-successor-chain.js';
import type {
  RasterSuccessorAuthoring,
  RasterSuccessorRuntimeSource,
} from './raster-stage-successor.js';
import {
  compileStageJunction,
  type CompiledStageJunction,
  type StageJunctionAuthoring,
} from './stage-junction-compiler.js';

export type RasterForkBranchSide = 'LEFT' | 'RIGHT';

export type RasterForkBranchSuccessorAuthoring = Omit<RasterSuccessorAuthoring, 'roadHalfWidth'>;

export interface RasterForkStageBranchAuthoring {
  readonly side: RasterForkBranchSide;
  readonly stageId: string;
  readonly packageId: string;
  readonly choiceId: string;
  readonly gateId: string;
  readonly handoffId: string;
  readonly finishGateId: string;
  readonly successor: RasterForkBranchSuccessorAuthoring;
}

export interface RasterForkStageRouteAuthoring {
  readonly upstream: DeclarativeLiveRouteAuthoring;
  /** Existing terminal stage that becomes the visible fork source. */
  readonly terminalStageId: string;
  readonly forkStageId: string;
  readonly forkPackageId: string;
  readonly junction: StageJunctionAuthoring;
  /** Source-stage local chainage where the two separated physical route gates are crossed. */
  readonly routeGateS: number;
  /** Exactly one LEFT and one RIGHT branch. Child local centers are derived from the junction. */
  readonly branches: readonly [RasterForkStageBranchAuthoring, RasterForkStageBranchAuthoring];
  /** Environment/content remains caller-owned; geometry/topology derivation stays in this compiler. */
  readonly createRuntime: (
    structural: RasterSuccessorRuntimeSource,
    branch: RasterForkStageBranchAuthoring,
    branchIndex: number,
  ) => GuideChartRuntimePackage;
}

export interface CompiledRasterForkStageBranch {
  readonly side: RasterForkBranchSide;
  readonly sourceLocalL: number;
  readonly structural: RasterSuccessorRuntimeSource;
  readonly runtime: GuideChartRuntimePackage;
  readonly stage: DeclarativeLiveRouteStageAuthoring;
  readonly transition: DeclarativeLiveRouteTransitionAuthoring;
  readonly finish: DeclarativeLiveRouteFinishAuthoring;
}

export interface CompiledRasterForkStageRoute {
  readonly authoring: DeclarativeLiveRouteAuthoring;
  readonly forkStage: DeclarativeLiveRouteStageAuthoring;
  readonly forkRuntime: GuideChartRuntimePackage;
  readonly junction: CompiledStageJunction;
  readonly branches: readonly CompiledRasterForkStageBranch[];
}

const EPSILON = 1e-9;

/**
 * Replace one terminal stage with a visible two-way stage-local fork and two independent Raster
 * successors.
 *
 * This compiler owns only route/stage composition and world-space geometry derivation. The fork
 * cross-section comes from M6.34, each child Raster comes from the ordinary M6.29 successor through
 * the fork coordinate adapter, and final route validation remains the M6.28 declarative compiler.
 * Renderer, camera and vehicle physics are deliberately absent from this layer.
 */
export function compileRasterForkStageRoute(
  source: RasterForkStageRouteAuthoring,
): CompiledRasterForkStageRoute {
  validateBasicAuthoring(source);

  const oldTerminal = requireUniqueStage(source.upstream, source.terminalStageId);
  if (oldTerminal.kind !== 'TERMINAL') {
    throw new RangeError(`Raster fork source stage must be TERMINAL: ${source.terminalStageId}`);
  }
  if (source.upstream.transitions.some((transition) => transition.fromStageId === source.terminalStageId)) {
    throw new RangeError('Raster fork source terminal must not already own outgoing transitions');
  }
  const oldFinishes = source.upstream.finishes.filter((finish) => finish.stageId === source.terminalStageId);
  if (oldFinishes.length !== 1) {
    throw new RangeError('Raster fork source terminal must own exactly one physical FINISH');
  }
  if (oldTerminal.runtime.roadView === null) {
    throw new RangeError('Raster fork source terminal requires a StageRoadView');
  }

  const promoted = repackageGuideChartRuntime(oldTerminal.runtime, source.forkPackageId);
  const junction = compileStageJunction({
    courseLength: promoted.coordinateFrame.guide.length,
    roadView: promoted.roadView,
    groundProfile: promoted.groundProfile,
  }, source.junction);
  const forkRuntime: GuideChartRuntimePackage = Object.freeze({
    ...promoted,
    roadView: junction.roadView,
    surfaceMap: junction.surfaceMap,
    groundProfile: junction.groundProfile,
    terrainProfile: Object.freeze({
      ...promoted.terrainProfile,
      groundLeft: junction.requiredGroundHalfWidth,
      groundRight: junction.requiredGroundHalfWidth,
    }),
  });
  const forkStage: DeclarativeLiveRouteStageAuthoring = Object.freeze({
    id: source.forkStageId,
    kind: 'STAGE',
    runtime: forkRuntime,
  });

  const separatedStartS = source.junction.crossSection.sSeparatedStart;
  if (!(source.routeGateS >= separatedStartS && source.routeGateS < forkRuntime.coordinateFrame.guide.length)) {
    throw new RangeError('Raster fork route gate must lie on the fully separated source-stage interval');
  }

  const childHalfWidth = source.junction.crossSection.childRoadWidth * 0.5;
  const structuralSource = Object.freeze({
    guide: forkRuntime.coordinateFrame.guide,
    chart: forkRuntime.coordinateFrame,
    groundProfile: forkRuntime.groundProfile,
  });

  const branches = source.branches.map((branch, index) => {
    const sourceLocalL = junction.junction.separatedChildCenterL(branch.side);
    const structural = createRasterForkStageSuccessor(structuralSource, {
      sourceLocalL,
      successor: Object.freeze({ ...branch.successor, roadHalfWidth: childHalfWidth }),
    });
    if (!(structural.sourceSeamS > source.routeGateS)) {
      throw new RangeError(`Raster fork handoff seam must follow route selection: ${branch.choiceId}`);
    }

    const runtime = source.createRuntime(structural, branch, index);
    if (runtime.packageId !== branch.packageId) {
      throw new RangeError(`Raster fork runtime package mismatch: ${branch.stageId}`);
    }
    if (runtime.coordinateFrame !== structural.chart) {
      throw new RangeError(`Raster fork runtime must own generated chart: ${branch.stageId}`);
    }
    if (runtime.worldFrameId !== forkRuntime.worldFrameId) {
      throw new RangeError(`Raster fork runtime must remain in source world frame: ${branch.stageId}`);
    }

    const stage: DeclarativeLiveRouteStageAuthoring = Object.freeze({
      id: branch.stageId,
      kind: 'TERMINAL',
      runtime,
    });
    const transition: DeclarativeLiveRouteTransitionAuthoring = Object.freeze({
      id: branch.choiceId,
      fromStageId: source.forkStageId,
      toStageId: branch.stageId,
      gate: pointGeometry(
        branch.gateId,
        guideChartToWorld(forkRuntime.coordinateFrame, source.routeGateS, sourceLocalL),
        childHalfWidth,
      ),
      handoff: pointGeometry(
        branch.handoffId,
        guideChartToWorld(forkRuntime.coordinateFrame, structural.sourceSeamS, sourceLocalL),
        childHalfWidth,
      ),
    });
    const finish: DeclarativeLiveRouteFinishAuthoring = Object.freeze({
      stageId: branch.stageId,
      gate: pointGeometry(
        branch.finishGateId,
        guideChartToWorld(structural.chart, structural.finishS, 0),
        childHalfWidth,
      ),
    });

    return Object.freeze({
      side: branch.side,
      sourceLocalL,
      structural,
      runtime,
      stage,
      transition,
      finish,
    });
  });

  const baseStages = source.upstream.stages.map((stage) => stage.id === source.terminalStageId ? forkStage : stage);
  const baseTransitions = source.upstream.transitions.map((transition) => transition.toStageId === source.terminalStageId
    ? Object.freeze({ ...transition, toStageId: source.forkStageId })
    : transition);
  const baseFinishes = source.upstream.finishes.filter((finish) => finish.stageId !== source.terminalStageId);
  const startStageId = source.upstream.startStageId === source.terminalStageId
    ? source.forkStageId
    : source.upstream.startStageId;

  const authoring = composeDeclarativeLiveRouteAuthoring({
    startStageId,
    fragments: [
      {
        stages: baseStages,
        transitions: baseTransitions,
        finishes: baseFinishes,
      },
      {
        stages: [forkStage, ...branches.map((branch) => branch.stage)],
        transitions: branches.map((branch) => branch.transition),
        finishes: branches.map((branch) => branch.finish),
      },
    ],
  });

  return Object.freeze({
    authoring,
    forkStage,
    forkRuntime,
    junction,
    branches: Object.freeze(branches),
  });
}

function validateBasicAuthoring(source: RasterForkStageRouteAuthoring): void {
  requireNonEmpty(source.terminalStageId, 'source terminal stage id');
  requireNonEmpty(source.forkStageId, 'fork stage id');
  requireNonEmpty(source.forkPackageId, 'fork package id');
  if (source.forkStageId === source.terminalStageId) {
    throw new RangeError('Raster fork stage id must differ from the replaced terminal stage id');
  }
  if (!Number.isFinite(source.routeGateS)) {
    throw new RangeError('Raster fork routeGateS must be finite');
  }

  const otherStageIds = new Set(source.upstream.stages
    .filter((stage) => stage.id !== source.terminalStageId)
    .map((stage) => stage.id));
  if (otherStageIds.has(source.forkStageId)) {
    throw new RangeError(`duplicate Raster fork stage id: ${source.forkStageId}`);
  }

  const sides = new Set<RasterForkBranchSide>();
  const stageIds = new Set(otherStageIds);
  stageIds.add(source.forkStageId);
  const packageIds = new Set(source.upstream.stages
    .filter((stage) => stage.id !== source.terminalStageId)
    .map((stage) => stage.runtime.packageId));
  packageIds.add(source.forkPackageId);
  const choiceIds = new Set(source.upstream.transitions.map((transition) => transition.id));
  const geometryIds = new Set<string>();
  source.upstream.transitions.forEach((transition) => {
    geometryIds.add(transition.gate.id);
    geometryIds.add(transition.handoff.id);
  });
  source.upstream.finishes
    .filter((finish) => finish.stageId !== source.terminalStageId)
    .forEach((finish) => geometryIds.add(finish.gate.id));

  for (const branch of source.branches) {
    if (sides.has(branch.side)) throw new RangeError(`duplicate Raster fork branch side: ${branch.side}`);
    sides.add(branch.side);
    requireUnique(stageIds, branch.stageId, 'stage id');
    requireUnique(packageIds, branch.packageId, 'package id');
    requireUnique(choiceIds, branch.choiceId, 'choice id');
    requireUnique(geometryIds, branch.gateId, 'gate/handoff/finish id');
    requireUnique(geometryIds, branch.handoffId, 'gate/handoff/finish id');
    requireUnique(geometryIds, branch.finishGateId, 'gate/handoff/finish id');
  }
  if (!sides.has('LEFT') || !sides.has('RIGHT')) {
    throw new RangeError('Raster fork requires exactly one LEFT and one RIGHT branch');
  }
}

function requireUniqueStage(
  source: DeclarativeLiveRouteAuthoring,
  id: string,
): DeclarativeLiveRouteStageAuthoring {
  const found = source.stages.filter((stage) => stage.id === id);
  if (found.length !== 1) throw new RangeError(`Raster fork source stage must exist exactly once: ${id}`);
  return found[0]!;
}

function pointGeometry(
  id: string,
  point: { readonly x: number; readonly z: number; readonly heading: number },
  halfWidth: number,
): DeclarativeGateGeometry {
  return Object.freeze({
    id,
    center: Object.freeze({ x: point.x, z: point.z }),
    heading: point.heading,
    halfWidth,
  });
}

function requireNonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new RangeError(`Raster fork ${label} must not be empty`);
}

function requireUnique(set: Set<string>, value: string, label: string): void {
  requireNonEmpty(value, label);
  if (set.has(value)) throw new RangeError(`duplicate Raster fork ${label}: ${value}`);
  set.add(value);
}
