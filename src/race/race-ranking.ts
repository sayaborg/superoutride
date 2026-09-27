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
