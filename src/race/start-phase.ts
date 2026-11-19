import { READY_SECONDS } from '../course/run-rules.js';
import { SIM_DT } from './fixed-step.js';

/** The start phase's status: WAITING before the start, READY during the hold, GO from the start of the run. */
export type StartStatus = 'WAITING' | 'READY' | 'GO';

/**
 * The one owner of the state before GO, outside race time. READY counts a number of seconds, and GO falls on the step
 * boundary nearest its end. The signal lamps light in its last READY_SECONDS: one as they begin and one more each
 * second; none is lit while WAITING, before them, while READY waits to count, or from GO. A standing start counts
 * READY_SECONDS from READY's beginning; a CHASE start (`begin(seconds)`, K, 2026-11-20) waits in READY until `release`,
 * when the rival has passed, and then counts its `seconds`.
 */
export function createStartPhase() {
  let status: StartStatus = 'WAITING';
  let counting = false;
  // The count's fixed steps, and those counted.
  let steps = Math.round(READY_SECONDS / SIM_DT),
    counted = 0;
  const remainingSeconds = () => Math.max(0, steps - counted) * SIM_DT;
  return {
    get status() {
      return status;
    },
    /** Seconds until GO: the whole count until it begins, 0 from GO. */
    get remainingSeconds() {
      return status === 'GO' ? 0 : remainingSeconds();
    },
    /**
     * Signal lamps lit: 1, 2 and up to READY_SECONDS through the count's last READY_SECONDS, one more each second; 0
     * otherwise.
     */
    get signalLamps() {
      const left = Math.ceil((steps - counted) / Math.round(1 / SIM_DT));
      return status === 'READY' && counting && left <= READY_SECONDS ? READY_SECONDS - left + 1 : 0;
    },
    /** Enter READY: counting READY_SECONDS at once, or, given a CHASE's `seconds`, waiting for `release` to count them. */
    begin(seconds: number | null = null) {
      if (status !== 'WAITING') return;
      status = 'READY';
      counting = seconds === null;
      if (seconds !== null) steps = Math.round(seconds / SIM_DT);
    },
    /** Begin READY's count, if it waits. */
    release() {
      if (status === 'READY') counting = true;
    },
    /** Counts one completed fixed READY step; returns true when that step ends READY. */
    advance(): boolean {
      if (status !== 'READY' || !counting) return false;
      counted += 1;
      if (counted < steps) return false;
      status = 'GO';
      return true;
    },
  };
}
