import type { createCourseRace } from '../race/course-race.js';

type CourseRace = ReturnType<typeof createCourseRace>;

// Milliseconds: display-only budget of 0.1 ns for accumulated fixed steps at an integer-ms tie.
// For example, 60 additions of 1/60 s err by about 1e-12 ms; ranking/deadlines remain exact.
const TIMER_ROUNDING_TOLERANCE_MILLISECONDS = 1e-7;
/** Seconds of race time a deadline extension stays on the status line. */
const EXTENSION_DISPLAY_SECONDS = 2;
/** Seconds of race time the GO prefix stays on the status line. */
const GO_DISPLAY_SECONDS = 1;

/** The one time format: minutes ' seconds " thousandths, such as 1'23"456, floored to whole milliseconds. */
export function formatRaceTime(seconds: number): string {
  const totalMilliseconds = Math.floor(seconds * 1000 + TIMER_ROUNDING_TOLERANCE_MILLISECONDS);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const secondsPart = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}'${secondsPart.toString().padStart(2, '0')}"${milliseconds.toString().padStart(3, '0')}`;
}

/** The Session status line, derived from race facts only. */
export function raceStatusText(race: CourseRace, { tuned = false }: { readonly tuned?: boolean } = {}): string {
  return `${tuned ? 'TUNED · ' : ''}${raceText(race)}`;
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

/** The ended run's result; the rank is the status line's. */
export function runResult(race: CourseRace): RunResult {
  return Object.freeze({
    outcome: race.outcome.status === 'GOAL' ? 'GOAL' : 'GAME OVER',
    standing: race.rivals.length > 0 ? race.standing : null,
    raceSeconds: race.clock.elapsedSeconds,
    bestLapSeconds: race.courseType === 'CIRCUIT' ? race.player.bestLapSeconds : null,
  });
}

function raceText(race: CourseRace): string {
  const { clock, outcome, player, countdown } = race;
  // Rank counts the competitors present in the Session.
  const { standing } = race;
  const position = `P${standing.rank}/${standing.count}`;
  if (outcome.status === 'GOAL' || outcome.status === 'GAME_OVER')
    return `${outcome.status.replace('_', ' ')} · ${position} · ${formatRaceTime(clock.elapsedSeconds)}`;
  if (outcome.status === 'READY') return `READY ${Math.ceil(countdown.remainingSeconds)}`;
  if (outcome.status === 'WAITING') return 'READY';
  let state: string = outcome.status;
  if (player.progress.status !== 'FINISHED') {
    if (race.courseType === 'CIRCUIT')
      state = `LAP ${Math.min(race.lapCount, player.progress.acceptedFinishCount + 1)}/${race.lapCount}`;
    else {
      const entry = race.route.occurrences[0]!;
      const choice = entry.section.fork ? (race.forks.choice(entry)?.from.carriageway.id ?? 'OPEN') : 'GO';
      state = `ROUTE ${choice}`;
    }
  }
  const start = race.competitorSeconds(player) < GO_DISPLAY_SECONDS ? 'GO · ' : '';
  const deadline = clock.deadlineSeconds;
  const timeLeft = deadline === null ? '' : ` · TIME ${Math.ceil(Math.max(0, deadline - clock.elapsedSeconds))}`;
  // An extension shows while race time is at most two seconds after it.
  const extension = clock.lastExtension;
  const extended =
    extension !== null && extension.ms > 0 && clock.elapsedSeconds <= extension.atSeconds + EXTENSION_DISPLAY_SECONDS;
  const extensionText = extended ? ` · TIME EXTEND +${(extension.ms / 1000).toFixed(1)}` : '';
  return `${start}${state}${timeLeft}${extensionText} · ${position} · ${formatRaceTime(clock.elapsedSeconds)}`;
}
