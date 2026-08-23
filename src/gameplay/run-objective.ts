import type { RaceProgressState, RaceProgressUpdate } from './race-progress.js';
import type { RouteDagState, RouteDagUpdate } from './route-dag.js';

export type RunObjectiveKind = 'POINT_TO_POINT' | 'REPEATABLE_DEV';
export type RunObjectiveStatus = 'RUNNING' | 'FINISHED';
export type RunObjectiveEvent = 'NONE' | 'BOUNDARY' | 'FINISHED' | 'IGNORED_AFTER_FINISH';
export type ValidatedRunFinishSource = 'CLOSED_RACE' | 'ROUTE_DAG';

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

export interface RunObjective {
  readonly kind: RunObjectiveKind;
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

export const POINT_TO_POINT_OBJECTIVE: Readonly<RunObjective> = {
  kind: 'POINT_TO_POINT',
};

/**
 * Keeps the current closed debug course useful as a repeated validation loop.
 * This is explicitly a DEV objective, not product lap-race authority.
 */
export const REPEATABLE_DEV_OBJECTIVE: Readonly<RunObjective> = {
  kind: 'REPEATABLE_DEV',
};

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
 * Adapt the existing closed-course validated race FINISH into the generic run-finish signal.
 * This compatibility path preserves M6.0–M6.7 while keeping lap bookkeeping out of the
 * product objective itself.
 */
export function createValidatedRunFinishFromRace(
  progress: Pick<RaceProgressState, 'validatedProgressFloor'>,
  raceUpdate: RaceProgressUpdate | null,
): ValidatedRunFinish | null {
  if (!Number.isFinite(progress.validatedProgressFloor)) {
    throw new RangeError('validated progress floor must be finite');
  }

  const gate = raceUpdate?.acceptedGate;
  if (!gate || gate.kind !== 'finish') return null;

  return Object.freeze({
    source: 'CLOSED_RACE',
    id: gate.name,
    validatedProgress: progress.validatedProgressFloor,
  });
}

/**
 * Adapt an already-validated terminal Route DAG FINISH into the generic run-finish signal.
 *
 * The numeric closed-course s_progress space is intentionally not projected onto the route
 * graph. A routed point-to-point finish therefore carries `validatedProgress: null` until a
 * future stage-progress model defines a meaningful route-global metric.
 */
export function createValidatedRunFinishFromRoute(
  routeState: Pick<RouteDagState, 'status' | 'activeStageId' | 'finishStageId'>,
  routeUpdate: RouteDagUpdate | null,
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

  return Object.freeze({
    source: 'ROUTE_DAG',
    id: routeState.finishStageId,
    validatedProgress: null,
  });
}

/**
 * Generic run-objective consumer. It accepts only a finish that has already been validated by
 * a physical producer (closed race gate or route boundary gate + DAG).
 */
export function updateRunObjectiveFromValidatedFinish(
  state: RunObjectiveState,
  objective: RunObjective,
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

  if (objective.kind === 'REPEATABLE_DEV') {
    state.lastEvent = 'BOUNDARY';
    return { event: state.lastEvent, status: state.status, justFinished: false };
  }

  if (objective.kind !== 'POINT_TO_POINT') {
    const exhaustive: never = objective.kind;
    throw new Error(`unsupported run objective: ${exhaustive}`);
  }

  state.status = 'FINISHED';
  state.finishElapsedSeconds = elapsedSeconds;
  state.finishValidatedProgress = finish.validatedProgress;
  state.finishSource = finish.source;
  state.finishId = finish.id;
  state.lastEvent = 'FINISHED';
  return { event: state.lastEvent, status: state.status, justFinished: true };
}

/**
 * Backward-compatible closed-course wrapper used by the current DEV runtime.
 * Product point-to-point route completion can instead call
 * `createValidatedRunFinishFromRoute` + `updateRunObjectiveFromValidatedFinish` directly.
 */
export function updateRunObjective(
  state: RunObjectiveState,
  objective: RunObjective,
  progress: Pick<RaceProgressState, 'validatedProgressFloor'>,
  raceUpdate: RaceProgressUpdate | null,
  elapsedSeconds: number,
): RunObjectiveUpdate {
  const finish = createValidatedRunFinishFromRace(progress, raceUpdate);
  return updateRunObjectiveFromValidatedFinish(state, objective, finish, elapsedSeconds);
}

function validateFinish(finish: ValidatedRunFinish): void {
  if (finish.source !== 'CLOSED_RACE' && finish.source !== 'ROUTE_DAG') {
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
