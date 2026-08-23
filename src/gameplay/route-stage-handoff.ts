import type { Vec2 } from '../core/math.js';
import {
  handoffGuideChart,
  locateWorldOnGuideChartLocal,
  type GuideChart,
} from './guide-chart.js';
import type { CourseCoordinate } from '../core/guide-curve.js';
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
}

export interface RouteStageHandoffSeam extends WorldCrossingGate {
  readonly choiceId: string;
  readonly targetChartId: string;
}

export interface RouteStageHandoffManifest {
  readonly seams: readonly RouteStageHandoffSeam[];
}

export interface PendingRouteStageHandoff {
  readonly choiceId: string;
  readonly targetStageId: string;
  readonly targetChartId: string;
  readonly seamId: string;
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
    choiceIds.add(choice.id);
    seamIds.add(source.id);
    const gate = compileWorldCrossingGate(source);
    seams.push(Object.freeze({ ...gate, choiceId: choice.id, targetChartId: source.targetChartId }));
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

  const targetChart = getChart(charts, pending.targetChartId);
  const activeContent = resolveActiveRouteStageContent(content, { activeStageId: pending.targetStageId });
  state.coordinate = handoffGuideChart(targetChart, world);
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
