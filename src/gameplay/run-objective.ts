import type { RouteDagState, RouteDagUpdate } from './route-dag.js';

export type RunObjectiveStatus = 'RUNNING' | 'FINISHED';
export type RunObjectiveEvent = 'NONE' | 'FINISHED' | 'IGNORED_AFTER_FINISH';
export type ValidatedRunFinishSource = 'ROUTE_DAG';

/**
 * Generic already-validated finish signal consumed by the run objective.
 *
 * The producer is responsible for physical validation. This type deliberately contains no
 * world position, raw chainage, screen coordinate or steering/input state that could be used
 * to manufacture completion inside the objective layer.
 */
export interface ValidatedRunFinish {
  readonly source: ValidatedRunFinishSource;
  readonly id: string;
  readonly validatedProgress: number | null;
}

export interface RunObjectiveState {
  status: RunObjectiveStatus;
  acceptedFinishCount: number;
  finishElapsedSeconds: number | null;
  finishValidatedProgress: number | null;
  finishSource: ValidatedRunFinishSource | null;
  finishId: string | null;
  lastEvent: RunObjectiveEvent;
}

export interface RunObjectiveUpdate {
  readonly event: RunObjectiveEvent;
  readonly status: RunObjectiveStatus;
  readonly justFinished: boolean;
}

export function createRunObjectiveState(): RunObjectiveState {
  return {
    status: 'RUNNING',
    acceptedFinishCount: 0,
    finishElapsedSeconds: null,
    finishValidatedProgress: null,
    finishSource: null,
    finishId: null,
    lastEvent: 'NONE',
  };
}

/**
 * Adapt an already-validated terminal Route DAG FINISH into the generic run-finish signal.
 *
 * A route-progress producer may supply its physically validated numeric floor. Historical callers
 * without that gameplay authority remain valid and emit `validatedProgress: null`.
 */
export function createValidatedRunFinishFromRoute(
  routeState: Pick<RouteDagState, 'status' | 'activeStageId' | 'finishStageId'>,
  routeUpdate: RouteDagUpdate | null,
  progress?: { readonly validatedProgressFloor: number },
): ValidatedRunFinish | null {
  if (!routeUpdate || routeUpdate.event !== 'FINISHED' || !routeUpdate.justFinished) return null;

  if (
    routeUpdate.status !== 'FINISHED'
    || routeState.status !== 'FINISHED'
    || routeState.finishStageId === null
    || routeState.finishStageId !== routeState.activeStageId
    || routeUpdate.activeStageId !== routeState.finishStageId
  ) {
    throw new Error('inconsistent validated Route DAG finish state');
  }
  if (progress !== undefined && !Number.isFinite(progress.validatedProgressFloor)) {
    throw new RangeError('validated route progress floor must be finite');
  }

  return Object.freeze({
    source: 'ROUTE_DAG',
    id: routeState.finishStageId,
    validatedProgress: progress?.validatedProgressFloor ?? null,
  });
}

/**
 * Generic run-objective consumer. It accepts only a finish that has already been validated by
 * a physical producer (closed race gate or route boundary gate + DAG).
 */
export function updateRunObjectiveFromValidatedFinish(
  state: RunObjectiveState,
  finish: ValidatedRunFinish | null,
  elapsedSeconds: number,
): RunObjectiveUpdate {
  if (!(elapsedSeconds >= 0) || !Number.isFinite(elapsedSeconds)) {
    throw new RangeError('run objective elapsedSeconds must be finite and >= 0');
  }
  if (finish !== null) validateFinish(finish);

  state.lastEvent = 'NONE';
  if (finish === null) {
    return { event: state.lastEvent, status: state.status, justFinished: false };
  }

  if (state.status === 'FINISHED') {
    state.lastEvent = 'IGNORED_AFTER_FINISH';
    return { event: state.lastEvent, status: state.status, justFinished: false };
  }

  state.acceptedFinishCount += 1;

  state.status = 'FINISHED';
  state.finishElapsedSeconds = elapsedSeconds;
  state.finishValidatedProgress = finish.validatedProgress;
  state.finishSource = finish.source;
  state.finishId = finish.id;
  state.lastEvent = 'FINISHED';
  return { event: state.lastEvent, status: state.status, justFinished: true };
}

function validateFinish(finish: ValidatedRunFinish): void {
  if (finish.source !== 'ROUTE_DAG') {
    const exhaustive: never = finish.source;
    throw new RangeError(`unsupported run finish source: ${exhaustive}`);
  }
  if (typeof finish.id !== 'string' || finish.id.trim().length === 0) {
    throw new RangeError('validated run finish id must be a non-empty string');
  }
  if (finish.validatedProgress !== null && !Number.isFinite(finish.validatedProgress)) {
    throw new RangeError('validated run finish progress must be finite or null');
  }
}
