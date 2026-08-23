import type { RaceProgressState, RaceProgressUpdate } from './race-progress.js';

export type RunObjectiveKind = 'POINT_TO_POINT' | 'REPEATABLE_DEV';
export type RunObjectiveStatus = 'RUNNING' | 'FINISHED';
export type RunObjectiveEvent = 'NONE' | 'BOUNDARY' | 'FINISHED' | 'IGNORED_AFTER_FINISH';

export interface RunObjective {
  readonly kind: RunObjectiveKind;
}

export interface RunObjectiveState {
  status: RunObjectiveStatus;
  acceptedFinishCount: number;
  finishElapsedSeconds: number | null;
  finishValidatedProgress: number | null;
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
    lastEvent: 'NONE',
  };
}

/**
 * Consume only already-validated race events.
 *
 * This layer never reads raw chainage, world distance or screen position. A point-to-point
 * run can therefore finish only after the physical ordered race-gate layer has accepted its
 * FINISH gate. The closed DEV course may instead keep consuming repeated FINISH boundaries.
 */
export function updateRunObjective(
  state: RunObjectiveState,
  objective: RunObjective,
  progress: Pick<RaceProgressState, 'validatedProgressFloor'>,
  raceUpdate: RaceProgressUpdate | null,
  elapsedSeconds: number,
): RunObjectiveUpdate {
  if (!(elapsedSeconds >= 0) || !Number.isFinite(elapsedSeconds)) {
    throw new RangeError('run objective elapsedSeconds must be finite and >= 0');
  }
  if (!Number.isFinite(progress.validatedProgressFloor)) {
    throw new RangeError('validated progress floor must be finite');
  }

  state.lastEvent = 'NONE';
  const gate = raceUpdate?.acceptedGate;
  if (!gate || gate.kind !== 'finish') {
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
  state.finishValidatedProgress = progress.validatedProgressFloor;
  state.lastEvent = 'FINISHED';
  return { event: state.lastEvent, status: state.status, justFinished: true };
}
