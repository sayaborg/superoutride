import { SIM_DT } from './fixed-step.js';

/** The standing start's hold: every vehicle is held this long in READY while signal lamps count down to GO. */
export const READY_SECONDS = 3;

/** The start phase's status: WAITING before the start, READY during the hold, GO from the start of the run. */
export type StartStatus = 'WAITING' | 'READY' | 'GO';

/**
 * The one owner of the state before GO, outside race time. GO falls on the step boundary nearest READY_SECONDS. The
 * signal lamps lit are the remaining seconds rounded up: all READY_SECONDS of them until the hold begins, none at GO.
 */
export function createStartPhase() {
  let status: StartStatus = 'WAITING';
  let readyElapsed = 0;
  const remainingSeconds = () => Math.max(0, READY_SECONDS - readyElapsed);
  return {
    get status() {
      return status;
    },
    /** Seconds until GO: READY_SECONDS while WAITING, 0 from GO. */
    get remainingSeconds() {
      return status === 'GO' ? 0 : remainingSeconds();
    },
    /** Signal lamps lit, from READY_SECONDS down to 0 at GO. */
    get signalLamps() {
      return status === 'GO' ? 0 : Math.ceil(remainingSeconds());
    },
    begin() {
      if (status === 'WAITING') status = 'READY';
    },
    /** Counts one completed fixed READY step; returns true when that step ends READY. */
    advance(): boolean {
      if (status !== 'READY') return false;
      readyElapsed += SIM_DT;
      if (readyElapsed + SIM_DT / 2 < READY_SECONDS) return false;
      status = 'GO';
      return true;
    },
  };
}
