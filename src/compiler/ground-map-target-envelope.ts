import { positiveFinite } from '../core/validation.js';
import { requiredPyramidMaxLevel } from './ground-map-lod.js';
import type { TerrainFootprintSummary } from './terrain-footprint-analysis.js';

const LEVEL_CAPACITY_TOLERANCE_METERS = 1e-12;
const OBSERVED_FOOTPRINT_TOLERANCE_METERS = 1e-9;

export interface GroundMapTargetEnvelopeInput {
  readonly dMin: number;
  readonly dMax: number;
  readonly qS: number;
  /** Explicit single-scanline collapse threshold in destination-row units. */
  readonly thinSpanScreenRows: number;
  /** Optional measured envelope used to prove that the conservative kMax is also necessary. */
  readonly observedMaxDeltaSEffective?: number;
}

export interface GroundMapTargetEnvelopeReport extends GroundMapTargetEnvelopeInput {
  /** Absolute source-chainage bound for any ordinary or collapsed TerrainLine inside the depth clip. */
  readonly maxDeltaSEffectiveUpperBound: number;
  /** Smallest shared-pyramid maximum level that covers the absolute bound. */
  readonly kMax: number;
  readonly previousLevelCapacity: number;
  readonly kMaxCapacity: number;
  readonly observedRequiredLevel: number | null;
  readonly necessityProven: boolean;
  readonly sufficiencyProven: boolean;
}

/**
 * GroundMap footprint capacity proof.
 *
 * Both endpoints of ordinary Delta_s are clipped to [dMin,dMax], therefore
 * Delta_s <= dMax-dMin. A collapsed segment is a subset of the same visible
 * interval, therefore Delta_s_collapse <= dMax-dMin as well. Consequently
 * Delta_s_eff=max(Delta_s,Delta_s_collapse) has the same absolute bound.
 */
export function deriveGroundMapTargetEnvelope(input: GroundMapTargetEnvelopeInput): GroundMapTargetEnvelopeReport {
  positiveFinite(input.dMin, 'dMin');
  positiveFinite(input.dMax, 'dMax');
  if (!(input.dMax > input.dMin)) throw new RangeError('dMax must be > dMin');
  positiveFinite(input.qS, 'qS');
  positiveFinite(input.thinSpanScreenRows, 'thinSpanScreenRows');

  const maxDeltaSEffectiveUpperBound = input.dMax - input.dMin;
  const kMax = requiredPyramidMaxLevel(maxDeltaSEffectiveUpperBound, input.qS);
  const kMaxCapacity = input.qS * 4 ** kMax;
  const previousLevelCapacity = kMax > 0 ? input.qS * 4 ** (kMax - 1) : 0;
  const sufficiencyProven = kMaxCapacity + LEVEL_CAPACITY_TOLERANCE_METERS >= maxDeltaSEffectiveUpperBound;

  let observedRequiredLevel: number | null = null;
  let necessityProven = false;
  if (input.observedMaxDeltaSEffective !== undefined) {
    positiveFinite(input.observedMaxDeltaSEffective, 'observedMaxDeltaSEffective');
    if (input.observedMaxDeltaSEffective > maxDeltaSEffectiveUpperBound + OBSERVED_FOOTPRINT_TOLERANCE_METERS) {
      throw new Error('observed Delta_s_eff exceeds the depth-clip upper bound');
    }
    observedRequiredLevel = requiredPyramidMaxLevel(input.observedMaxDeltaSEffective, input.qS);
    necessityProven =
      observedRequiredLevel === kMax &&
      (kMax === 0 || input.observedMaxDeltaSEffective > previousLevelCapacity + LEVEL_CAPACITY_TOLERANCE_METERS);
  }

  if (!sufficiencyProven) throw new Error('internal GroundMap kMax proof failure');

  return {
    ...input,
    maxDeltaSEffectiveUpperBound,
    kMax,
    previousLevelCapacity,
    kMaxCapacity,
    observedRequiredLevel,
    necessityProven,
    sufficiencyProven,
  };
}

/** Validate measured Road Generator output against a compiled target envelope. */
export function validateTerrainFootprintsAgainstTarget(
  summary: TerrainFootprintSummary,
  target: GroundMapTargetEnvelopeReport,
): void {
  if (summary.maxDeltaSEffective > target.maxDeltaSEffectiveUpperBound + OBSERVED_FOOTPRINT_TOLERANCE_METERS) {
    throw new Error('TerrainLine Delta_s_eff exceeds compiled target envelope');
  }
  if (summary.requiredChainageLevel > target.kMax) {
    throw new Error('TerrainLine requires GroundMap level above compiled kMax');
  }
}
