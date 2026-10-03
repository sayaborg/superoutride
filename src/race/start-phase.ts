import { SIM_DT } from './fixed-step.js';

/** The standing start's hold: every vehicle is held this long in READY while signal lamps count down to GO. */
export const READY_SECONDS = 3;

/** The start phase's status: WAITING before the start, READY during the hold, GO from the start of the run. */
export type StartStatus = 'WAITING' | 'READY' | 'GO';

/**
 * The one owner of the state before GO, outside race time. GO falls on the step boundary nearest READY_SECONDS. One
 * signal lamp lights as the hold begins and one more each second, up to READY_SECONDS; none is lit while WAITING or
 * from GO.
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
    /** Signal lamps lit: 1, 2 and up to READY_SECONDS during READY, one more each second; 0 while WAITING and from GO. */
    get signalLamps() {
      return status === 'READY' ? READY_SECONDS - Math.ceil(remainingSeconds()) + 1 : 0;
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
