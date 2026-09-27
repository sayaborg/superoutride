// Milliseconds: display-only budget of 0.1 ns for accumulated fixed steps at an integer-ms tie.
// For example, 60 additions of 1/60 s err by about 1e-12 ms; ranking/deadlines remain exact.
const TIMER_ROUNDING_TOLERANCE_MILLISECONDS = 1e-7;

interface RaceRankingInput {
  readonly competitorId: string;
  readonly s: number;
  readonly finishSeconds: number | null;
}

/** Finished cars precede unfinished cars; exact finish-time or route-s ties share a rank. */
export function rankRaceProgress(inputs: readonly RaceRankingInput[]) {
  const compare = (a: RaceRankingInput, b: RaceRankingInput) => {
    if (a.finishSeconds !== null || b.finishSeconds !== null) {
      if (a.finishSeconds === null) return 1;
      if (b.finishSeconds === null) return -1;
      return a.finishSeconds - b.finishSeconds;
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
  const totalMilliseconds = Math.floor(seconds * 1000 + TIMER_ROUNDING_TOLERANCE_MILLISECONDS);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const secondsPart = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${secondsPart.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}
