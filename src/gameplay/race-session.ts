import type { PhysicalRaceGate } from './physical-race-gate.js';

const EPSILON = 1e-9;

export interface ValidatedGateTiming {
  readonly gateName: string;
  readonly gateKind: 'checkpoint' | 'finish';
  readonly elapsedSeconds: number;
  readonly validatedProgressFloor: number;
}

/** One physically validated FINISH boundary timing. */
export interface CourseBoundaryTiming {
  readonly index: number;
  readonly elapsedSeconds: number;
  readonly intervalSeconds: number;
}

export interface RaceSessionState {
  elapsedSeconds: number;
  lastBoundarySeconds: number;
  readonly gateTimings: ValidatedGateTiming[];
  readonly boundaryTimings: CourseBoundaryTiming[];
  bestBoundaryIntervalSeconds: number | null;
}

/** Minimal validated-progress contract needed by timing. */
export interface RaceSessionProgressView {
  readonly validatedProgressFloor: number;
}

/** Minimal already-validated gate contract needed by timing. */
export interface RaceSessionUpdateView {
  readonly acceptedGate: PhysicalRaceGate | null;
}

export interface RaceRankingInput {
  readonly competitorId: string;
  readonly sProgress: number;
  readonly validatedProgressFloor: number;
}

export interface RaceStanding extends RaceRankingInput {
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
 * Timing consumes only already-validated physical gate results. It has no dependency on
 * legacy closed-course wrapping, CircuitTopology, RouteDag or renderer state.
 * Gate timestamps are quantized to the physics tick that reports the accepted physical
 * crossing. This bounded <=dt timing resolution is intentional and deterministic.
 */
export function advanceRaceSession(
  session: RaceSessionState,
  progress: RaceSessionProgressView,
  update: RaceSessionUpdateView | null,
  dt: number,
): void {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('race session dt must be finite and > 0');
  if (!Number.isFinite(progress.validatedProgressFloor)) {
    throw new RangeError('race session validatedProgressFloor must be finite');
  }
  session.elapsedSeconds += dt;

  const gate = update?.acceptedGate;
  if (!gate) return;

  const gateTiming: ValidatedGateTiming = {
    gateName: gate.name,
    gateKind: gate.kind,
    elapsedSeconds: session.elapsedSeconds,
    validatedProgressFloor: progress.validatedProgressFloor,
  };
  session.gateTimings.push(gateTiming);

  if (gate.kind !== 'finish') return;

  const intervalSeconds = session.elapsedSeconds - session.lastBoundarySeconds;
  const boundary: CourseBoundaryTiming = {
    index: session.boundaryTimings.length,
    elapsedSeconds: session.elapsedSeconds,
    intervalSeconds,
  };
  session.boundaryTimings.push(boundary);
  session.lastBoundarySeconds = session.elapsedSeconds;
  session.bestBoundaryIntervalSeconds = session.bestBoundaryIntervalSeconds === null
    ? intervalSeconds
    : Math.min(session.bestBoundaryIntervalSeconds, intervalSeconds);
}

/**
 * Rank active competitors using gameplay-validated progress only.
 *
 * Primary key: continuous sProgress.
 * Secondary key: validatedProgressFloor. This makes a physically validated gate crossing
 * beat an unvalidated competitor merely saturated at the same next-gate ceiling.
 * Exact equality is a real tie; no arbitrary ID or raw geometry tie-breaker is introduced.
 */
export function rankRaceProgress(inputs: readonly RaceRankingInput[]): RaceStanding[] {
  const indexed = inputs.map((input, inputIndex) => {
    validateRankingInput(input);
    return { input, inputIndex };
  });

  indexed.sort((a, b) => {
    const progressDelta = b.input.sProgress - a.input.sProgress;
    if (Math.abs(progressDelta) > EPSILON) return progressDelta;
    const floorDelta = b.input.validatedProgressFloor - a.input.validatedProgressFloor;
    if (Math.abs(floorDelta) > EPSILON) return floorDelta;
    return a.inputIndex - b.inputIndex;
  });

  const standings: RaceStanding[] = [];
  let previous: RaceRankingInput | null = null;
  let previousRank = 0;

  for (let i = 0; i < indexed.length; i += 1) {
    const input = indexed[i]!.input;
    const tied = previous !== null
      && Math.abs(input.sProgress - previous.sProgress) <= EPSILON
      && Math.abs(input.validatedProgressFloor - previous.validatedProgressFloor) <= EPSILON;
    const rank = tied ? previousRank : i + 1;
    standings.push({ ...input, rank });
    previous = input;
    previousRank = rank;
  }

  return standings;
}

export function formatRaceTime(seconds: number): string {
  if (!(seconds >= 0) || !Number.isFinite(seconds)) throw new RangeError('race time must be finite and >= 0');
  const totalMilliseconds = Math.floor(seconds * 1000 + 1e-7);
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
  if (input.sProgress + EPSILON < input.validatedProgressFloor) {
    throw new RangeError('sProgress cannot be below validatedProgressFloor');
  }
}
