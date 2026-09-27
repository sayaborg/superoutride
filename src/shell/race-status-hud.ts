import type { createCourseRace } from '../race/course-race.js';
import { rankRaceProgress } from '../race/race-ranking.js';

type CourseRace = ReturnType<typeof createCourseRace>;

// Milliseconds: display-only budget of 0.1 ns for accumulated fixed steps at an integer-ms tie.
// For example, 60 additions of 1/60 s err by about 1e-12 ms; ranking/deadlines remain exact.
const TIMER_ROUNDING_TOLERANCE_MILLISECONDS = 1e-7;
/** Seconds of race time a deadline extension stays on the status line. */
const EXTENSION_DISPLAY_SECONDS = 2;
/** Seconds of race time the GO prefix stays on the status line. */
const GO_DISPLAY_SECONDS = 1;

/** m:ss.mmm, floored to whole milliseconds. */
export function formatRaceTime(seconds: number): string {
  const totalMilliseconds = Math.floor(seconds * 1000 + TIMER_ROUNDING_TOLERANCE_MILLISECONDS);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const secondsPart = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${secondsPart.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/** The Session status line, derived from race facts only. */
export function raceStatusText(
  race: CourseRace,
  { paused = false, tuned = false }: { readonly paused?: boolean; readonly tuned?: boolean } = {},
): string {
  if (paused) return 'PAUSED';
  return `${tuned ? 'TUNED · ' : ''}${raceText(race)}`;
}

function raceText(race: CourseRace): string {
  const { clock, player, rivals, startPhase } = race;
  const standings = rankRaceProgress(
    [player, ...rivals].map((c) => ({ competitorId: c.id, s: c.progress.s, finishSeconds: c.finishSeconds })),
  );
  const rank = standings.find((s) => s.competitorId === player.id)!.rank;
  const position = `P${rank}/${rivals.length + 1}`;
  if (clock.status === 'GOAL' || clock.status === 'GAME_OVER')
    return `${clock.status.replace('_', ' ')} · ${position} · ${formatRaceTime(clock.elapsedSeconds)}`;
  if (startPhase.status === 'READY') return `READY ${Math.ceil(startPhase.remainingSeconds)}`;
  if (clock.status === 'READY') return 'READY';
  let state: string = clock.status;
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
  // An extension shows until a fixed step begins more than two seconds of race time after it.
  const extension = clock.lastExtension;
  const extended =
    extension !== null && extension.ms > 0 && clock.stepStartSeconds <= extension.atSeconds + EXTENSION_DISPLAY_SECONDS;
  const extensionText = extended ? ` · TIME EXTEND +${(extension.ms / 1000).toFixed(1)}` : '';
  return `${start}${state}${timeLeft}${extensionText} · ${position} · ${formatRaceTime(clock.elapsedSeconds)}`;
}
