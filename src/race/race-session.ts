import type { RouteRaceEvent } from './route-progress.js';

// Milliseconds: display-only budget of 0.1 ns for accumulated fixed steps at an integer-ms tie.
// For example, 60 additions of 1/60 s err by about 1e-12 ms; ranking/deadlines remain exact.
const TIMER_ROUNDING_TOLERANCE_MILLISECONDS = 1e-7;

interface RaceRankingInput {
  readonly competitorId: string;
  readonly s: number;
  readonly finishElapsedSeconds: number | null;
}

export function createRaceSessionState() {
  return { elapsedSeconds: 0 };
}

/** Accepted route fractions give the exact simulation time of the terminal crossing. */
export function advanceRaceSession(
  session: ReturnType<typeof createRaceSessionState>,
  update: { readonly justFinished: boolean; readonly events: readonly RouteRaceEvent[] },
  dt: number,
): void {
  session.elapsedSeconds += dt * (update.justFinished ? update.events.at(-1)!.u : 1);
}

/** Finished cars precede unfinished cars; exact finish-time or route-s ties share a rank. */
export function rankRaceProgress(inputs: readonly RaceRankingInput[]) {
  const compare = (a: RaceRankingInput, b: RaceRankingInput) => {
    if (a.finishElapsedSeconds !== null || b.finishElapsedSeconds !== null) {
      if (a.finishElapsedSeconds === null) return 1;
      if (b.finishElapsedSeconds === null) return -1;
      return a.finishElapsedSeconds - b.finishElapsedSeconds;
    }
    return b.s - a.s;
  };
  const sorted = [...inputs].sort(compare);
  let rank = 0;
  return sorted.map((input, index) => {
    if (index === 0 || compare(sorted[index - 1]!, input) !== 0) rank = index + 1;
    return { ...input, rank };
  });
}

export function formatRaceTime(seconds: number): string {
  if (!(seconds >= 0) || !Number.isFinite(seconds)) throw new RangeError('race time must be finite and >= 0');
  const totalMilliseconds = Math.floor(seconds * 1000 + TIMER_ROUNDING_TOLERANCE_MILLISECONDS);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const secondsPart = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${secondsPart.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}
