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
  let lastExtension: { readonly ms: number; readonly atSeconds: number } | null = null;
  return Object.freeze({
    get status() {
      return status;
    },
    /** Race time: the one competitor-independent clock since GO. */
    get elapsedSeconds() {
      return elapsedSeconds;
    },
    /** The current deadline in race time; null without a time limit. */
    get deadlineSeconds() {
      return budgets === null ? null : deadline;
    },
    /** The latest deadline extension: its amount and the race time of the checkpoint that earned it. */
    get lastExtension() {
      return lastExtension;
    },
    start() {
      if (status === 'READY') status = 'RUNNING';
    },
    /** Opens one RUNNING step and returns its start time. */
    beginStep(): number {
      return elapsedSeconds;
    },
    /**
     * Decides one player crossing candidate of the open step. A crossing past the deadline is refused;
     * one exactly at the deadline is accepted. An accepted checkpoint extends the deadline at once.
     */
    admit(event: Pick<RouteRaceEvent, 'landmark' | 'lap' | 'u' | 'finish'>): boolean {
      const at = raceEventSeconds(elapsedSeconds, event.u);
      if (deadline < at) return false;
      if (event.finish || budgets === null) return true;
      const awardMs = budgets.after(event.landmark, event.lap);
      deadline += awardMs / 1000;
      lastExtension = Object.freeze({ ms: awardMs, atSeconds: at });
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
