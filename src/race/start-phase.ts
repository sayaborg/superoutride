import { READY_SECONDS } from '../course/run-rules.js';
import { SIM_DT } from './fixed-step.js';

/** The start phase's status: WAITING before the start, READY during the hold, GO from the start of the run. */
export type StartStatus = 'WAITING' | 'READY' | 'GO';

/**
 * The one owner of the state before GO, outside race time. GO falls on the step boundary nearest READY_SECONDS of
 * counting. One signal lamp lights as the count begins and one more each second, up to READY_SECONDS; none is lit while
 * WAITING, while READY waits to count, or from GO. A standing start counts from READY's beginning; a CHASE start
 * (`begin(true)`) waits in READY until `release` (K, 2026-11-19: the lamps count once the rival has passed).
 */
export function createStartPhase() {
  let status: StartStatus = 'WAITING';
  let counting = false;
  let readyElapsed = 0;
  const remainingSeconds = () => Math.max(0, READY_SECONDS - readyElapsed);
  return {
    get status() {
      return status;
    },
    /** Seconds until GO: READY_SECONDS until the count begins, 0 from GO. */
    get remainingSeconds() {
      return status === 'GO' ? 0 : remainingSeconds();
    },
    /** Signal lamps lit: 1, 2 and up to READY_SECONDS while READY counts, one more each second; 0 otherwise. */
    get signalLamps() {
      return status === 'READY' && counting ? READY_SECONDS - Math.ceil(remainingSeconds()) + 1 : 0;
    },
    /** Enter READY: counting at once, or waiting for `release` when `waits`. */
    begin(waits = false) {
      if (status !== 'WAITING') return;
      status = 'READY';
      counting = !waits;
    },
    /** Begin READY's count, if it waits. */
    release() {
      if (status === 'READY') counting = true;
    },
    /** Counts one completed fixed READY step; returns true when that step ends READY. */
    advance(): boolean {
      if (status !== 'READY' || !counting) return false;
      readyElapsed += SIM_DT;
      if (readyElapsed + SIM_DT / 2 < READY_SECONDS) return false;
      status = 'GO';
      return true;
    },
  };
}
