/** Accepted physical events, with an already resolved upcoming interval budget. */
interface CheckpointClockEvent {
  readonly gate: object;
  readonly lap: number;
  readonly u: number;
  readonly finish: boolean;
  readonly awardMs: number;
}

/** Simulation time only. Expiry and gates are ordered at their exact within-step timestamps. */
export function createCheckpointClock(initialBudgetMs: number | null) {
  let status: 'READY' | 'RUNNING' | 'GOAL' | 'GAME_OVER' = 'READY';
  let elapsedSeconds = 0,
    deadline = initialBudgetMs === null ? Infinity : initialBudgetMs / 1000;
  let extensionMs = 0,
    extensionUntil = 0,
    checkpointCount = 0;
  const accepted = new Map<object, Set<number>>();
  return Object.freeze({
    get status() {
      return status;
    },
    get elapsedSeconds() {
      return elapsedSeconds;
    },
    get expirySeconds() {
      return initialBudgetMs === null ? null : deadline;
    },
    get remainingSeconds() {
      return initialBudgetMs === null ? null : Math.max(0, deadline - elapsedSeconds);
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
    advance(dt: number, events: readonly CheckpointClockEvent[]) {
      if (status !== 'RUNNING') return;
      const start = elapsedSeconds,
        end = start + dt;
      if (start > extensionUntil) extensionMs = 0;
      for (const event of events) {
        const at = start + event.u * dt;
        // A checkpoint or FINISH wins an exact expiry tie; no epsilon moves the deadline.
        if (deadline < at) {
          elapsedSeconds = deadline;
          status = 'GAME_OVER';
          return;
        }
        const laps = accepted.get(event.gate) ?? new Set<number>();
        if (laps.has(event.lap)) continue;
        laps.add(event.lap);
        accepted.set(event.gate, laps);
        if (event.finish) {
          elapsedSeconds = at;
          status = 'GOAL';
          return;
        }
        checkpointCount++;
        if (initialBudgetMs !== null) {
          deadline += event.awardMs / 1000;
          extensionMs = event.awardMs;
          extensionUntil = at + 2;
        }
      }
      if (deadline <= end) {
        elapsedSeconds = deadline;
        status = 'GAME_OVER';
      } else elapsedSeconds = end;
    },
  });
}
