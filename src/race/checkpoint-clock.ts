import { SIM_DT } from './fixed-step.js';
import type { CourseTimeBudgets } from '../content/course-time-budgets.js';
import type { RouteRaceEvent } from './route-progress.js';

/** The one conversion from a step's start time and a within-step fraction to race time. */
export function raceEventSeconds(stepStartSeconds: number, u: number): number {
  return stepStartSeconds + u * SIM_DT;
}

/**
 * Race time (seconds since GO) and the checkpoint deadline, in fixed steps. The clock owns time only: it
 * decides each player crossing candidate against the deadline in time order, and a checkpoint's award
 * applies at once to later candidates in the same step. The run outcome belongs to the race.
 */
export function createCheckpointClock(budgets: CourseTimeBudgets | null) {
  let elapsedSeconds = 0,
    deadline = budgets === null ? Infinity : budgets.initialMs / 1000;
  let lastExtension: { readonly ms: number; readonly atSeconds: number } | null = null;
  // The extensions the open step's crossings earned.
  const stepExtensions: { readonly ms: number; readonly atSeconds: number }[] = [];
  return Object.freeze({
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
    /** Opens one RUNNING step and returns its start time. */
    beginStep(): number {
      stepExtensions.length = 0;
      return elapsedSeconds;
    },
    /** The extension, in ms, that the open step's crossing at race time `seconds` earned; null when none. */
    extensionAt(seconds: number): number | null {
      return stepExtensions.find((extension) => extension.atSeconds === seconds)?.ms ?? null;
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
      stepExtensions.push(lastExtension);
      return true;
    },
    /** The open step's end in race time. */
    get stepEndSeconds() {
      return elapsedSeconds + SIM_DT;
    },
    /** The deadline when it falls within the open step, else null. */
    get expirySeconds() {
      return deadline <= elapsedSeconds + SIM_DT ? deadline : null;
    },
    /** Closes the open step at `seconds`: the step's end, or the race time the run ended within it. */
    completeStep(seconds: number) {
      elapsedSeconds = seconds;
    },
  });
}
