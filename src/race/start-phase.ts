/**
 * Provisional start (proposal 70): a fixed READY phase before GO so engines can be revved while
 * every vehicle is held. Countdown lamps and rolling starts remain pending Session decisions.
 */
export const READY_SECONDS = 3;

/** Start timing outside race time. GO falls on the step boundary nearest READY_SECONDS. */
export function createStartPhase() {
  let status: 'WAITING' | 'READY' | 'GO' = 'WAITING';
  let readyElapsed = 0;
  return {
    get status() {
      return status;
    },
    get remainingSeconds() {
      return Math.max(0, READY_SECONDS - readyElapsed);
    },
    begin() {
      if (status === 'WAITING') status = 'READY';
    },
    /** Counts one completed READY step; returns true when that step ends READY. */
    advance(dt: number): boolean {
      if (status !== 'READY') return false;
      readyElapsed += dt;
      if (readyElapsed + dt / 2 < READY_SECONDS) return false;
      status = 'GO';
      return true;
    },
  };
}
