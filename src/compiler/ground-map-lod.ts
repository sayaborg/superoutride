export interface GroundMapDensityInput {
  readonly d0: number;
  readonly focalLength: number;
  readonly cameraHeight: number;
  readonly pitchRadians: number;
}

export interface GroundMapDensityProfile extends GroundMapDensityInput {
  readonly qL: number;
  readonly qS: number;
  readonly rhoL: number;
  readonly rhoS: number;
}

export interface GroundMapLevelFootprint {
  readonly level: number;
  readonly qL: number;
  readonly qS: number;
}

/** Core GroundMap base-density rule: one authority d0 plus the reference camera profile. */
export function deriveGroundMapDensity(input: GroundMapDensityInput): GroundMapDensityProfile {
  validatePositiveFinite(input.d0, 'd0');
  validatePositiveFinite(input.focalLength, 'focalLength');
  validatePositiveFinite(input.cameraHeight, 'cameraHeight');
  if (!Number.isFinite(input.pitchRadians)) throw new RangeError('pitchRadians must be finite');
  const cosPitch = Math.cos(input.pitchRadians);
  if (!(cosPitch > 0)) throw new RangeError('reference pitch must keep cos(pitch) > 0');

  const qL = input.d0 / input.focalLength;
  const qS = input.focalLength * qL * qL / (input.cameraHeight * cosPitch);
  return {
    ...input,
    qL,
    qS,
    rhoL: 1 / qL,
    rhoS: 1 / qS,
  };
}

/** Upper-bound estimate when every course texel is unique. */
export function estimateUniqueBaseTexels(
  uniqueWidthMeters: number,
  uniqueLengthMeters: number,
  density: Pick<GroundMapDensityProfile, 'qL' | 'qS'>,
): number {
  validatePositiveFinite(uniqueWidthMeters, 'uniqueWidthMeters');
  validatePositiveFinite(uniqueLengthMeters, 'uniqueLengthMeters');
  validatePositiveFinite(density.qL, 'qL');
  validatePositiveFinite(density.qS, 'qS');
  return uniqueWidthMeters * uniqueLengthMeters / (density.qL * density.qS);
}

/** One shared anisotropic pyramid: x2 lateral footprint, x4 chainage footprint per level. */
export function groundMapFootprintAtLevel(
  density: Pick<GroundMapDensityProfile, 'qL' | 'qS'>,
  level: number,
): GroundMapLevelFootprint {
  validateLevel(level);
  return {
    level,
    qL: density.qL * 2 ** level,
    qS: density.qS * 4 ** level,
  };
}

/** Runtime authority. Shared pyramid level is chosen from chainage footprint only. */
export function requiredChainageLevel(deltaSEffective: number, qS: number): number {
  validatePositiveFinite(deltaSEffective, 'deltaSEffective');
  validatePositiveFinite(qS, 'qS');
  return ceilLogRatio(deltaSEffective / qS, 4);
}

/** Diagnostic only. This value must not raise the shared pyramid level. */
export function diagnosticLateralLevel(deltaL: number, qL: number): number {
  validatePositiveFinite(deltaL, 'deltaL');
  validatePositiveFinite(qL, 'qL');
  return ceilLogRatio(deltaL / qL, 2);
}

export function selectGroundMapLevel(deltaSEffective: number, qS: number, kMax: number): number {
  validateLevel(kMax);
  return Math.min(requiredChainageLevel(deltaSEffective, qS), kMax);
}

export function requiredPyramidMaxLevel(deltaSEffectiveMax: number, qS: number): number {
  return requiredChainageLevel(deltaSEffectiveMax, qS);
}

function ceilLogRatio(ratio: number, base: number): number {
  if (!(ratio > 1)) return 0;
  const value = Math.log(ratio) / Math.log(base);
  return Math.max(0, Math.ceil(value - 1e-12));
}

function validatePositiveFinite(value: number, name: string): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be finite and > 0`);
}

function validateLevel(level: number): void {
  if (!Number.isInteger(level) || level < 0) throw new RangeError('level must be a non-negative integer');
}
