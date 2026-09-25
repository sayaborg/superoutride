/**
 * UNIFIED is an authored acoustic surrogate, NOT a local rubber/contact solve.
 * All values here are listening choices (magic numbers), not measured material data.
 * Frequencies and rates describe the normalized sound model, never vehicle physics.
 */
export const UNIFIED_SETTINGS = Object.freeze({
  frontSeed: 0x3547ab91,
  rearSeed: 0x691cf37d,
  controlSeconds: 0.025,
  powerReferenceWatts: 12000,
  slipHalfMps: 3,
  slipRolloffMps: 45,
  feedbackMaximumPerSecond: 8500,
  saturationPerSecond: 6000,
  noiseBandwidthHz: 600,
  noiseForcePerSecond: 1200,
  // Fixed modal data: a shared friction port couples BOTH resonances. Neither is a separate S/Q generator.
  resonances: Object.freeze([
    Object.freeze({ frequencyHz: 300, dampingPerSecond: 2 * Math.PI * 500, participation: 0.45 }),
    Object.freeze({ frequencyHz: 1000, dampingPerSecond: 2 * Math.PI * 500, participation: Math.sqrt(1 - 0.45 ** 2) }),
  ] as const),
  // Fixed displacement pickup gain; normalized modal displacement is not metres or acoustic pressure.
  outputGainPerSecond: 900,
  outputCutoffHz: 8000,
  dcHz: 18,
});

/** Each surface changes the ONE friction input: roughness forcing and instability susceptibility. */
export const UNIFIED_SURFACES = Object.freeze({
  ASPHALT: Object.freeze({ roughness: 1, susceptibility: 1 }),
  SHOULDER: Object.freeze({ roughness: 1.3, susceptibility: 0.4 }),
  GRASS: Object.freeze({ roughness: 0.75, susceptibility: 0.04 }),
  DIRT: Object.freeze({ roughness: 1.5, susceptibility: 0.12 }),
  SAND: Object.freeze({ roughness: 1.1, susceptibility: 0.02 }),
});

/** Authored audition bounds, NOT measured tire ranges. All combinations retain passive resonances. */
export const UNIFIED_TUNING_RANGES = Object.freeze({
  feedbackMaximumPerSecond: {
    min: 2000,
    max: 12000,
    step: 100,
    defaultValue: UNIFIED_SETTINGS.feedbackMaximumPerSecond,
  },
  saturationPerSecond: { min: 3000, max: 12000, step: 100, defaultValue: UNIFIED_SETTINGS.saturationPerSecond },
  powerReferenceWatts: { min: 3000, max: 30000, step: 500, defaultValue: UNIFIED_SETTINGS.powerReferenceWatts },
  slipHalfMps: { min: 1, max: 12, step: 0.25, defaultValue: UNIFIED_SETTINGS.slipHalfMps },
  slipRolloffMps: { min: 20, max: 80, step: 1, defaultValue: UNIFIED_SETTINGS.slipRolloffMps },
  noiseBandwidthHz: { min: 100, max: 2000, step: 25, defaultValue: UNIFIED_SETTINGS.noiseBandwidthHz },
  noiseForcePerSecond: { min: 0, max: 2400, step: 25, defaultValue: UNIFIED_SETTINGS.noiseForcePerSecond },
  lowFrequencyHz: { min: 275, max: 600, step: 5, defaultValue: UNIFIED_SETTINGS.resonances[0].frequencyHz },
  highFrequencyHz: { min: 800, max: 2400, step: 25, defaultValue: UNIFIED_SETTINGS.resonances[1].frequencyHz },
  outputGainPerSecond: { min: 0, max: 1800, step: 25, defaultValue: UNIFIED_SETTINGS.outputGainPerSecond },
  outputCutoffHz: { min: 1000, max: 12000, step: 100, defaultValue: UNIFIED_SETTINGS.outputCutoffHz },
});

export type UnifiedTuning = Readonly<Record<keyof typeof UNIFIED_TUNING_RANGES, number>>;

export function resolveUnifiedTuning(value: Partial<UnifiedTuning> = {}): UnifiedTuning {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('tire tuning must be an object');
  const result = {} as Record<keyof UnifiedTuning, number>;
  for (const key of Object.keys(UNIFIED_TUNING_RANGES) as (keyof UnifiedTuning)[]) {
    const range = UNIFIED_TUNING_RANGES[key];
    const number = value[key] === undefined ? range.defaultValue : value[key];
    if (!Number.isFinite(number) || number < range.min || number > range.max)
      throw new RangeError(`invalid unified tuning: ${key}`);
    result[key] = number;
  }
  return Object.freeze(result);
}

export function sameUnifiedTuning(a: UnifiedTuning, b: UnifiedTuning): boolean {
  return (Object.keys(UNIFIED_TUNING_RANGES) as (keyof UnifiedTuning)[]).every((key) => a[key] === b[key]);
}
