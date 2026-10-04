import type { RaceFacts } from '../race/course-race.js';
import type { RecordOutcome } from './run-records.js';

/** What RESULT shows of an ended run: race facts and the run's record judgement. */
export interface RunResult {
  readonly outcome: 'GOAL' | 'GAME OVER';
  /** The player's standing; null unless two or more competitors are ranked. */
  readonly standing: { readonly rank: number; readonly count: number } | null;
  readonly raceSeconds: number;
  /** The player's best lap on a CIRCUIT; null elsewhere or before a complete lap. */
  readonly bestLapSeconds: number | null;
  /** Null when the run was not judged: it did not reach GOAL, or its mode or Session records nothing. */
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

/** The ended run's result: its time is the ending's race time; the rank is the shown standing. */
export function runResult(race: RaceFacts, record: RecordOutcome | null): RunResult {
  return Object.freeze({
    outcome: race.outcome.status === 'GOAL' ? 'GOAL' : 'GAME OVER',
    standing: shownStanding(race),
    raceSeconds: race.outcome.endSeconds!,
    bestLapSeconds: race.courseType === 'CIRCUIT' ? race.player.bestLapSeconds : null,
    record,
  });
}
