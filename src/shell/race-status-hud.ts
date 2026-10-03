import type { createCourseRace } from '../race/course-race.js';

type CourseRace = ReturnType<typeof createCourseRace>;

// Milliseconds: display-only budget of 0.1 ns for accumulated fixed steps at an integer-ms tie.
// For example, 60 additions of 1/60 s err by about 1e-12 ms; ranking/deadlines remain exact.
const TIMER_ROUNDING_TOLERANCE_MILLISECONDS = 1e-7;

/** The one time format: minutes ' seconds " thousandths, such as 1'23"456, floored to whole milliseconds. */
export function formatRaceTime(seconds: number): string {
  const totalMilliseconds = Math.floor(seconds * 1000 + TIMER_ROUNDING_TOLERANCE_MILLISECONDS);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const secondsPart = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}'${secondsPart.toString().padStart(2, '0')}"${milliseconds.toString().padStart(3, '0')}`;
}

/** What RESULT shows of an ended run, derived from race facts only. */
export interface RunResult {
  readonly outcome: 'GOAL' | 'GAME OVER';
  /** The player's standing; null in a Session without rivals. */
  readonly standing: { readonly rank: number; readonly count: number } | null;
  readonly raceSeconds: number;
  /** The player's best lap on a CIRCUIT; null elsewhere or before a complete lap. */
  readonly bestLapSeconds: number | null;
}

/** The ended run's result; the rank is the race's standing. */
export function runResult(race: CourseRace): RunResult {
  return Object.freeze({
    outcome: race.outcome.status === 'GOAL' ? 'GOAL' : 'GAME OVER',
    standing: race.rivals.length > 0 ? race.standing : null,
    raceSeconds: race.clock.elapsedSeconds,
    bestLapSeconds: race.courseType === 'CIRCUIT' ? race.player.bestLapSeconds : null,
  });
}
