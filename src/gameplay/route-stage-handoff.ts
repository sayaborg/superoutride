import { sampleGuideCurve, type CourseCoordinate } from '../core/guide-curve.js';
import type { Vec2 } from '../core/math.js';
import {
  guideChartToWorld,
  handoffGuideChart,
  locateWorldOnGuideChartLocal,
  type GuideChart,
} from './guide-chart.js';
import type { RouteChoice, RouteDag, RouteDagState, RouteDagUpdate } from './route-dag.js';
import {
  resolveActiveRouteStageContent,
  type RouteStageContentManifest,
} from './route-stage-content.js';
import {
  compileWorldCrossingGate,
  observeWorldCrossingGate,
  type WorldCrossingGate,
  type WorldCrossingGateAuthoring,
} from './world-crossing-gate.js';

export type RouteStageHandoffEvent =
  | 'NONE'
  | 'PENDING'
  | 'SEAM_REVERSE'
  | 'SEAM_VALIDATED'
  | 'COMMITTED'
  | 'REJECTED_PENDING_EXISTS'
  | 'REJECTED_MISMATCH';

export interface RouteStageHandoffSeamAuthoring extends WorldCrossingGateAuthoring {
  readonly choiceId: string;
  readonly targetChartId: string;
  /** Existing StageContinuationLink coordinates; these are the chart-rebase authority. */
  readonly sourceSeamS: number;
  readonly targetSeamS: number;
  readonly sourceLocalL: number;
  readonly targetLocalL: number;
}

export interface RouteStageHandoffSeam extends WorldCrossingGate {
  readonly choiceId: string;
  readonly targetChartId: string;
  readonly sourceSeamS: number;
  readonly targetSeamS: number;
  readonly sourceLocalL: number;
  readonly targetLocalL: number;
}

export interface RouteStageHandoffManifest {
  readonly seams: readonly RouteStageHandoffSeam[];
}

export interface PendingRouteStageHandoff {
  readonly choiceId: string;
  readonly targetStageId: string;
  readonly targetChartId: string;
  readonly seamId: string;
  readonly sourceSeamS: number;
  readonly targetSeamS: number;
  readonly sourceLocalL: number;
  readonly targetLocalL: number;
}

export interface ValidatedRouteStageHandoffSeam {
  readonly choiceId: string;
  readonly seamId: string;
}

export interface RouteStageHandoffState {
  activeStageId: string;
  activeChartId: string;
  activePackageId: string;
  coordinate: CourseCoordinate;
  pending: PendingRouteStageHandoff | null;
  commitCount: number;
  lastEvent: RouteStageHandoffEvent;
}

export interface RouteStageHandoffObservation {
  readonly event: 'NONE' | 'SEAM_REVERSE' | 'SEAM_VALIDATED';
  readonly seam: ValidatedRouteStageHandoffSeam | null;
}

export interface PendingRouteStageRecoveryTarget {
  readonly s: number;
  readonly l: number;
}

/**
 * Keep an explicit recovery discontinuity on the source side of a still-pending handoff seam.
 * A later ordinary world-motion segment must cross the seam before content/chart state can commit.
 */
export function pendingRouteStageRecoveryTarget(
  state: Pick<RouteStageHandoffState, 'pending'>,
  backtrackDistance: number,
): PendingRouteStageRecoveryTarget | null {
  if (!Number.isFinite(backtrackDistance) || backtrackDistance < 0) {
    throw new RangeError('pending handoff recovery backtrack distance must be finite and non-negative');
  }
  const pending = state.pending;
  if (pending === null) return null;
  return Object.freeze({
    s: Math.max(0, pending.sourceSeamS - backtrackDistance),
    l: pending.sourceLocalL,
  });
}

/**
 * Compile one post-selection handoff seam per route choice.
 *
 * A route choice can be validated earlier than its content/chart handoff. This explicitly keeps
 * "which branch was physically chosen" separate from "the parent overlap may now be discarded".
 */
export function compileRouteStageHandoffManifest(
  route: RouteDag,
  charts: readonly GuideChart[],
  authoring: readonly RouteStageHandoffSeamAuthoring[],
): RouteStageHandoffManifest {
  const chartIds = new Set<string>();
  for (const chart of charts) {
    if (chartIds.has(chart.id)) throw new RangeError(`duplicate Guide chart id: ${chart.id}`);
    chartIds.add(chart.id);
  }

  const choiceIds = new Set<string>();
  const seamIds = new Set<string>();
  const seams: RouteStageHandoffSeam[] = [];
  for (const source of authoring) {
    const choice = route.choices.find((candidate) => candidate.id === source.choiceId);
    if (!choice) throw new RangeError(`handoff seam references unknown route choice: ${source.choiceId}`);
    if (choiceIds.has(choice.id)) throw new RangeError(`route choice has more than one handoff seam: ${choice.id}`);
    if (seamIds.has(source.id)) throw new RangeError(`duplicate handoff seam id: ${source.id}`);
    if (!chartIds.has(source.targetChartId)) {
      throw new RangeError(`handoff seam references unknown Guide chart: ${source.targetChartId}`);
    }
    if (![source.sourceSeamS, source.targetSeamS, source.sourceLocalL, source.targetLocalL].every(Number.isFinite)) {
      throw new RangeError(`handoff seam coordinate map must be finite: ${source.id}`);
    }
    const targetChart = charts.find((chart) => chart.id === source.targetChartId)!;
    if (!(source.targetSeamS >= 0 && source.targetSeamS <= targetChart.guide.length)) {
      throw new RangeError(`handoff target seam lies outside target chart: ${source.id}`);
    }
    const targetAnchor = guideChartToWorld(targetChart, source.targetSeamS, source.targetLocalL);
    if (Math.hypot(targetAnchor.x - source.center.x, targetAnchor.z - source.center.z) > 1e-6) {
      throw new RangeError(`handoff target coordinate map disagrees with world seam: ${source.id}`);
    }
    choiceIds.add(choice.id);
    seamIds.add(source.id);
    const gate = compileWorldCrossingGate(source);
    seams.push(Object.freeze({
      ...gate,
      choiceId: choice.id,
      targetChartId: source.targetChartId,
      sourceSeamS: source.sourceSeamS,
      targetSeamS: source.targetSeamS,
      sourceLocalL: source.sourceLocalL,
      targetLocalL: source.targetLocalL,
    }));
  }

  for (const choice of route.choices) {
    if (!choiceIds.has(choice.id)) throw new RangeError(`route choice is missing a handoff seam: ${choice.id}`);
  }

  return Object.freeze({ seams: Object.freeze(seams) });
}

export function createRouteStageHandoffState(
  route: RouteDag,
  content: RouteStageContentManifest,
  initialChart: GuideChart,
  world: Vec2,
): RouteStageHandoffState {
  const activeContent = resolveActiveRouteStageContent(content, { activeStageId: route.startStageId });
  return {
    activeStageId: route.startStageId,
    activeChartId: initialChart.id,
    activePackageId: activeContent.package.packageId,
    coordinate: handoffGuideChart(initialChart, world),
    pending: null,
    commitCount: 0,
    lastEvent: 'NONE',
  };
}

/** Queue content/chart work only after the Route DAG accepted a validated physical branch choice. */
export function queueRouteStageHandoff(
  state: RouteStageHandoffState,
  manifest: RouteStageHandoffManifest,
  routeUpdate: Pick<RouteDagUpdate, 'acceptedChoice'>,
): RouteStageHandoffEvent {
  state.lastEvent = 'NONE';
  const choice = routeUpdate.acceptedChoice;
  if (choice === null) return state.lastEvent;
  if (state.pending !== null) {
    state.lastEvent = 'REJECTED_PENDING_EXISTS';
    return state.lastEvent;
  }

  const seam = getSeamForChoice(manifest, choice);
  state.pending = Object.freeze({
    choiceId: choice.id,
    targetStageId: choice.toStageId,
    targetChartId: seam.targetChartId,
    seamId: seam.id,
    sourceSeamS: seam.sourceSeamS,
    targetSeamS: seam.targetSeamS,
    sourceLocalL: seam.sourceLocalL,
    targetLocalL: seam.targetLocalL,
  });
  state.lastEvent = 'PENDING';
  return state.lastEvent;
}

/** Observe only the seam belonging to the currently pending accepted route choice. */
export function observePendingRouteStageHandoff(
  state: RouteStageHandoffState,
  manifest: RouteStageHandoffManifest,
  previous: Vec2,
  current: Vec2,
): RouteStageHandoffObservation {
  if (state.pending === null) return { event: 'NONE', seam: null };
  const source = manifest.seams.find((candidate) => candidate.id === state.pending!.seamId);
  if (!source) throw new Error(`compiled handoff seam missing: ${state.pending.seamId}`);
  const crossing = observeWorldCrossingGate(source, previous, current);
  if (crossing === null) return { event: 'NONE', seam: null };
  if (crossing.direction === 'REVERSE') return { event: 'SEAM_REVERSE', seam: null };
  return {
    event: 'SEAM_VALIDATED',
    seam: Object.freeze({ choiceId: source.choiceId, seamId: source.id }),
  };
}

/**
 * Commit one pending handoff. The world point is only read and re-expressed in the target chart.
 * Vehicle/world state is never mutated here.
 */
export function commitRouteStageHandoff(
  state: RouteStageHandoffState,
  routeState: Pick<RouteDagState, 'activeStageId'>,
  content: RouteStageContentManifest,
  charts: readonly GuideChart[],
  validated: ValidatedRouteStageHandoffSeam | null,
  world: Vec2,
): RouteStageHandoffEvent {
  state.lastEvent = 'NONE';
  if (validated === null) return state.lastEvent;
  const pending = state.pending;
  if (
    pending === null
    || validated.choiceId !== pending.choiceId
    || validated.seamId !== pending.seamId
    || routeState.activeStageId !== pending.targetStageId
  ) {
    state.lastEvent = 'REJECTED_MISMATCH';
    return state.lastEvent;
  }

  const sourceChart = getChart(charts, state.activeChartId);
  const sourceSeamSample = sampleGuideCurve(sourceChart.guide, pending.sourceSeamS);
  const sourceCoordinate = locateWorldOnGuideChartLocal(
    sourceChart,
    world,
    sourceSeamSample.segmentIndex,
    3,
    false,
  );
  const targetChart = getChart(charts, pending.targetChartId);
  const targetS = pending.targetSeamS + (sourceCoordinate.s - pending.sourceSeamS);
  if (!(targetS >= 0 && targetS <= targetChart.guide.length)) {
    throw new RangeError(
      `handoff mapped coordinate lies outside target chart: ${pending.choiceId}`
      + ` source=${sourceCoordinate.s} seam=${pending.sourceSeamS}`
      + ` target=${targetS} length=${targetChart.guide.length}`,
    );
  }
  const targetSample = sampleGuideCurve(targetChart.guide, targetS);
  const activeContent = resolveActiveRouteStageContent(content, { activeStageId: pending.targetStageId });
  state.coordinate = {
    s: targetS,
    l: pending.targetLocalL + (sourceCoordinate.l - pending.sourceLocalL),
    segmentIndex: targetSample.segmentIndex,
    distanceSquared: sourceCoordinate.distanceSquared,
  };
  state.activeStageId = pending.targetStageId;
  state.activeChartId = targetChart.id;
  state.activePackageId = activeContent.package.packageId;
  state.pending = null;
  state.commitCount += 1;
  state.lastEvent = 'COMMITTED';
  return state.lastEvent;
}

/** Keep the active content/chart diagnostic coordinate synchronized from authoritative world XZ. */
export function syncRouteStageHandoffCoordinate(
  state: RouteStageHandoffState,
  charts: readonly GuideChart[],
  world: Vec2,
): void {
  const chart = getChart(charts, state.activeChartId);
  state.coordinate = locateWorldOnGuideChartLocal(
    chart,
    world,
    state.coordinate.segmentIndex,
    3,
    false,
  );
}

function getSeamForChoice(manifest: RouteStageHandoffManifest, choice: RouteChoice): RouteStageHandoffSeam {
  const seam = manifest.seams.find((candidate) => candidate.choiceId === choice.id);
  if (!seam) throw new Error(`compiled route handoff seam missing for choice: ${choice.id}`);
  return seam;
}

function getChart(charts: readonly GuideChart[], id: string): GuideChart {
  const chart = charts.find((candidate) => candidate.id === id);
  if (!chart) throw new Error(`compiled Guide chart missing: ${id}`);
  return chart;
}
