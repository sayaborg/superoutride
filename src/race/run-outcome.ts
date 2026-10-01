import type { RaceEvent } from './course-race.js';

export type RunStatus = 'READY' | 'RUNNING' | 'GOAL' | 'GAME_OVER';
/** Why a run ended in GAME OVER: the clock expired, or a rank limit failed the player. */
export type GameOverCause = 'TIME' | 'RANK';

/** The one owner of the run outcome: READY until GO, RUNNING, then GOAL or GAME OVER with its cause. */
export function createRunOutcome() {
  let status: RunStatus = 'READY';
  let cause: GameOverCause | null = null;
  return Object.freeze({
    get status() {
      return status;
    },
    /** The GAME OVER cause; null otherwise. */
    get cause() {
      return cause;
    },
    start() {
      if (status === 'READY') status = 'RUNNING';
    },
    /** Ends a running run once: GOAL, or GAME OVER with its cause. */
    end(ending: { readonly status: 'GOAL' } | { readonly status: 'GAME_OVER'; readonly cause: GameOverCause }) {
      if (status !== 'RUNNING') throw new Error('Only a running run ends');
      status = ending.status;
      cause = ending.status === 'GAME_OVER' ? ending.cause : null;
    },
  });
}

/**
 * Rank limits by gate ID. At a limited gate, each lap's crossing is judged once: the player fails at the race time of
 * the N-th crossing by another competitor before the player's own. Events arrive in race-time order with the player
 * first at equal times, so an exact tie goes to the player. Every competitor in the field counts.
 */
export function createRankLimitJudge(limits: Readonly<Record<string, number>>, playerId: string) {
  const crossedByPlayer = new Set<string>();
  const earlier = new Map<string, number>();
  return Object.freeze({
    /** The race time of the first failure among one step's ordered events, or null. */
    observe(events: readonly RaceEvent[]): number | null {
      for (const event of events) {
        if (!Object.hasOwn(limits, event.landmark.id)) continue;
        const limit = limits[event.landmark.id]!;
        const key = `${event.landmark.id}\u0000${event.lap}`;
        if (event.competitorId === playerId) crossedByPlayer.add(key);
        else if (!crossedByPlayer.has(key)) {
          const count = (earlier.get(key) ?? 0) + 1;
          earlier.set(key, count);
          if (count >= limit) return event.timeSeconds;
        }
      }
      return null;
    },
  });
}
