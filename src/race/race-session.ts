import type { PhysicalRaceGateCrossing, PhysicalRaceGate } from './physical-race-gate.js';

const RANK_PROGRESS_TOLERANCE_METERS = 1e-9;
const RACE_TIME_TOLERANCE_SECONDS = 1e-9;
const TIMER_ROUNDING_TOLERANCE_MILLISECONDS = 1e-7;

interface ValidatedGateTiming {
  readonly gateName: string;
  readonly gateKind: 'checkpoint' | 'finish';
  readonly elapsedSeconds: number;
  readonly validatedProgressFloor: number;
}

/** One physically validated FINISH boundary timing. */
interface CourseBoundaryTiming {
  readonly index: number;
  readonly elapsedSeconds: number;
  readonly intervalSeconds: number;
}

interface RaceSessionState {
  elapsedSeconds: number;
  lastBoundarySeconds: number;
  readonly gateTimings: ValidatedGateTiming[];
  readonly boundaryTimings: CourseBoundaryTiming[];
  bestBoundaryIntervalSeconds: number | null;
}

/** Minimal validated-progress contract needed by timing. */
interface RaceSessionProgressObservation {
  readonly validatedProgressFloor: number;
}

/** Minimal already-validated gate contract needed by timing. */
interface RaceSessionUpdateObservation {
  readonly acceptedGate: PhysicalRaceGate | null;
  readonly acceptedCrossings?: readonly PhysicalRaceGateCrossing[];
  readonly justFinished?: boolean;
}

interface RaceRankingInput {
  readonly competitorId: string;
  readonly sProgress: number;
  readonly validatedProgressFloor: number;
  /** Already-validated terminal FINISH time. Absent/null while the competitor is unfinished. */
  readonly finishElapsedSeconds?: number | null;
}

interface RaceStanding extends RaceRankingInput {
  readonly rank: number;
}

export function createRaceSessionState(): RaceSessionState {
  return {
    elapsedSeconds: 0,
    lastBoundarySeconds: 0,
    gateTimings: [],
    boundaryTimings: [],
    bestBoundaryIntervalSeconds: null,
  };
}

/**
 * Advance deterministic gameplay time from the fixed simulation delta.
 * Browser wall-clock/frame time is never timing authority.
 *
 * Timing consumes only already-validated physical gate results.
 * Accepted world-plane intersection fractions retain precise within-step timing.
 */
export function advanceRaceSession(
  session: RaceSessionState,
  progress: RaceSessionProgressObservation,
  update: RaceSessionUpdateObservation | null,
  dt: number,
): void {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('race session dt must be finite and > 0');
  if (!Number.isFinite(progress.validatedProgressFloor)) {
    throw new RangeError('race session validatedProgressFloor must be finite');
  }
  const start = session.elapsedSeconds;
  session.elapsedSeconds += dt;

  const crossings = update?.acceptedCrossings ?? (update?.acceptedGate ? [{ gate: update.acceptedGate, u: 1 }] : []);
  for (const { gate, u } of crossings) {
    const at = start + u * dt;

    const gateTiming: ValidatedGateTiming = {
      gateName: gate.name,
      gateKind: gate.kind,
      elapsedSeconds: at,
      validatedProgressFloor: progress.validatedProgressFloor,
    };
    session.gateTimings.push(gateTiming);

    if (gate.kind !== 'finish') continue;

    const intervalSeconds = at - session.lastBoundarySeconds;
    const boundary: CourseBoundaryTiming = {
      index: session.boundaryTimings.length,
      elapsedSeconds: at,
      intervalSeconds,
    };
    session.boundaryTimings.push(boundary);
    session.lastBoundarySeconds = at;
    session.bestBoundaryIntervalSeconds =
      session.bestBoundaryIntervalSeconds === null
        ? intervalSeconds
        : Math.min(session.bestBoundaryIntervalSeconds, intervalSeconds);
  }
  if (update?.justFinished && crossings.length) session.elapsedSeconds = start + crossings.at(-1)!.u * dt;
}

/**
 * Rank active competitors using gameplay-validated progress only.
 *
 * Primary key: continuous sProgress.
 * Secondary key: validatedProgressFloor. This makes a physically validated gate crossing
 * beat an unvalidated competitor merely saturated at the same next-gate ceiling.
 * At identical completed progress, an already-validated terminal FINISH time is the final key.
 * Exact equality remains a real tie; no arbitrary ID or raw geometry tie-breaker is introduced.
 */
export function rankRaceProgress(inputs: readonly RaceRankingInput[]): RaceStanding[] {
  const indexed = inputs.map((input, inputIndex) => {
    validateRankingInput(input);
    return { input, inputIndex };
  });

  indexed.sort((a, b) => {
    const progressDelta = b.input.sProgress - a.input.sProgress;
    if (Math.abs(progressDelta) > RANK_PROGRESS_TOLERANCE_METERS) return progressDelta;
    const floorDelta = b.input.validatedProgressFloor - a.input.validatedProgressFloor;
    if (Math.abs(floorDelta) > RANK_PROGRESS_TOLERANCE_METERS) return floorDelta;
    const aFinish = a.input.finishElapsedSeconds ?? null;
    const bFinish = b.input.finishElapsedSeconds ?? null;
    if (aFinish !== null || bFinish !== null) {
      if (aFinish === null) return 1;
      if (bFinish === null) return -1;
      const finishDelta = aFinish - bFinish;
      if (Math.abs(finishDelta) > RACE_TIME_TOLERANCE_SECONDS) return finishDelta;
    }
    return a.inputIndex - b.inputIndex;
  });

  const standings: RaceStanding[] = [];
  let previous: RaceRankingInput | null = null;
  let previousRank = 0;

  for (let i = 0; i < indexed.length; i += 1) {
    const input = indexed[i]!.input;
    const tied =
      previous !== null &&
      Math.abs(input.sProgress - previous.sProgress) <= RANK_PROGRESS_TOLERANCE_METERS &&
      Math.abs(input.validatedProgressFloor - previous.validatedProgressFloor) <= RANK_PROGRESS_TOLERANCE_METERS &&
      equalFinishTime(input.finishElapsedSeconds, previous.finishElapsedSeconds);
    const rank = tied ? previousRank : i + 1;
    standings.push({ ...input, rank });
    previous = input;
    previousRank = rank;
  }

  return standings;
}

export function formatRaceTime(seconds: number): string {
  if (!(seconds >= 0) || !Number.isFinite(seconds)) throw new RangeError('race time must be finite and >= 0');
  const totalMilliseconds = Math.floor(seconds * 1000 + TIMER_ROUNDING_TOLERANCE_MILLISECONDS);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const secondsPart = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${secondsPart.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

function validateRankingInput(input: RaceRankingInput): void {
  if (input.competitorId.length === 0) throw new RangeError('competitorId must not be empty');
  if (!Number.isFinite(input.sProgress) || !Number.isFinite(input.validatedProgressFloor)) {
    throw new RangeError('ranking progress must be finite');
  }
  if (
    input.finishElapsedSeconds !== undefined &&
    input.finishElapsedSeconds !== null &&
    (!(input.finishElapsedSeconds >= 0) || !Number.isFinite(input.finishElapsedSeconds))
  ) {
    throw new RangeError('ranking finishElapsedSeconds must be finite and >= 0 or null');
  }
  if (input.sProgress + RANK_PROGRESS_TOLERANCE_METERS < input.validatedProgressFloor) {
    throw new RangeError('sProgress cannot be below validatedProgressFloor');
  }
}

function equalFinishTime(a: number | null | undefined, b: number | null | undefined): boolean {
  const normalizedA = a ?? null;
  const normalizedB = b ?? null;
  if (normalizedA === null || normalizedB === null) return normalizedA === normalizedB;
  return Math.abs(normalizedA - normalizedB) <= RACE_TIME_TOLERANCE_SECONDS;
}
