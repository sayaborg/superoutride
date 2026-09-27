import { SIM_DT } from './fixed-step.js';
import type { CourseTimeBudgets } from './course-session.js';
import type { RouteRaceEvent } from './route-progress.js';

/** The one conversion from a step's start time and a within-step fraction to race time. */
export function raceEventSeconds(stepStartSeconds: number, u: number): number {
  return stepStartSeconds + u * SIM_DT;
}

/**
 * Race time (seconds since GO) and the checkpoint deadline, in fixed steps. The clock alone owns both:
 * it decides each player crossing candidate against the deadline in time order, and a checkpoint's award
 * applies at once to later candidates in the same step.
 */
export function createCheckpointClock(budgets: CourseTimeBudgets | null) {
  let status: 'READY' | 'RUNNING' | 'GOAL' | 'GAME_OVER' = 'READY';
  let elapsedSeconds = 0,
    deadline = budgets === null ? Infinity : budgets.initialMs / 1000;
  let extensionMs = 0,
    extensionUntil = 0,
    checkpointCount = 0;
  return Object.freeze({
    get status() {
      return status;
    },
    /** Race time: the one competitor-independent clock since GO. */
    get elapsedSeconds() {
      return elapsedSeconds;
    },
    get remainingSeconds() {
      return budgets === null ? null : Math.max(0, deadline - elapsedSeconds);
    },
    get extensionMs() {
      return extensionMs;
    },
    get checkpointCount() {
      return checkpointCount;
    },
    start() {
      if (status === 'READY') status = 'RUNNING';
    },
    /** Opens one RUNNING step and returns its start time. */
    beginStep(): number {
      if (elapsedSeconds > extensionUntil) extensionMs = 0;
      return elapsedSeconds;
    },
    /**
     * Decides one player crossing candidate of the open step. A crossing past the deadline is refused;
     * one exactly at the deadline is accepted. An accepted checkpoint extends the deadline at once.
     */
    admit(event: Pick<RouteRaceEvent, 'landmark' | 'lap' | 'u' | 'finish'>): boolean {
      const at = raceEventSeconds(elapsedSeconds, event.u);
      if (deadline < at) return false;
      if (event.finish) return true;
      checkpointCount++;
      if (budgets !== null) {
        const awardMs = budgets.after(event.landmark, event.lap);
        deadline += awardMs / 1000;
        extensionMs = awardMs;
        extensionUntil = at + 2;
      }
      return true;
    },
    /** Closes the open step: GOAL at the player's finish time, else expiry within the step or its end. */
    completeStep(playerFinishSeconds: number | null) {
      if (playerFinishSeconds !== null) {
        elapsedSeconds = playerFinishSeconds;
        status = 'GOAL';
        return;
      }
      const end = elapsedSeconds + SIM_DT;
      if (deadline <= end) {
        elapsedSeconds = deadline;
        status = 'GAME_OVER';
      } else elapsedSeconds = end;
    },
  });
}
