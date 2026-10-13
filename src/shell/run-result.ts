import type { RaceFacts } from '../race/course-race.js';
import type { RecordOutcome } from './run-records.js';

/** What RESULT shows of an ended run: race facts and the run's record judgement. */
export interface RunResult {
  /** GOAL or GAME OVER; null for a run without a finish, which the player ended. */
  readonly outcome: 'GOAL' | 'GAME OVER' | null;
  /** The player's standing; null unless two or more competitors are ranked. */
  readonly standing: { readonly rank: number; readonly count: number } | null;
  /** The race time at the ending; null for a run without a finish, whose total time is no result. */
  readonly raceSeconds: number | null;
  /** The laps a run without a finish completed; null for a run with a finish. */
  readonly laps: number | null;
  /** The player's best lap on a CIRCUIT; null elsewhere or before a complete lap. */
  readonly bestLapSeconds: number | null;
  /** Null when the run was not judged: it is no TIME ATTACK, or its run records nothing. */
  readonly record: RecordOutcome | null;
}

/**
 * The player's standing as displays show it, POS on the HUD and RANK on RESULT: shown when two or more competitors are
 * ranked, else null.
 */
export function shownStanding(race: Pick<RaceFacts, 'standing'>): RaceFacts['standing'] | null {
  const { standing } = race;
  return standing.count >= 2 ? standing : null;
}

/**
 * The ended run's result: its time is the ending's race time; the rank is the shown standing. A run without a finish has
 * no outcome and no time: its result is its completed laps and its best.
 */
export function runResult(race: RaceFacts, record: RecordOutcome | null): RunResult {
  const ended = race.outcome.status === 'ENDED';
  return Object.freeze({
    outcome: ended ? null : race.outcome.status === 'GOAL' ? 'GOAL' : 'GAME OVER',
    standing: shownStanding(race),
    raceSeconds: ended ? null : race.outcome.endSeconds!,
    laps: ended ? race.lap - 1 : null,
    bestLapSeconds: race.courseType === 'CIRCUIT' ? race.player.bestLapSeconds : null,
    record,
  });
}
