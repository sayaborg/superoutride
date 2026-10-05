import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
/**
 * UNIFIED is an authored acoustic surrogate, NOT a local rubber/contact solve, so no value derives from physics:
 * every sound value is a listening setting (`UnifiedSettings`). Only the random seeds are structural constants.
 */
export const UNIFIED_SYNTHESIS = Object.freeze({
  frontSeed: 0x3547ab91,
  rearSeed: 0x691cf37d,
});

/**
 * Listening settings on the DEV UNIFIED panel: authored audition bounds, NOT measured tire ranges. Defaults are in
 * `DEFAULT_AUDIO_SETTINGS`. Frequencies and rates describe the normalized sound model, never vehicle physics.
 */
export const UNIFIED_SETTING_RANGES = Object.freeze({
  feedbackMaximumPerSecond: { min: 2000, max: 12000, step: 100 },
  powerReferenceWatts: { min: 3000, max: 30000, step: 500 },
  noiseForcePerSecond: { min: 0, max: 2400, step: 25 },
  lowFrequencyHz: { min: 275, max: 600, step: 5 },
  highFrequencyHz: { min: 800, max: 2400, step: 25 },
  // Displacement pickup gain; normalized modal displacement is not metres or acoustic pressure.
  outputGainPerSecond: { min: 0, max: 1800, step: 25 },
  // Cubic feedback dissipation.
  saturationPerSecond: { min: 3000, max: 12000, step: 100 },
  slipHalfMps: { min: 1, max: 12, step: 0.25 },
  slipRolloffMps: { min: 20, max: 80, step: 1 },
  // Colored-force bandwidth.
  noiseBandwidthHz: { min: 100, max: 2000, step: 25 },
  outputCutoffHz: { min: 1000, max: 12000, step: 100 },
  // Damping of both passive modes; resolution keeps each mode underdamped.
  resonanceDampingPerSecond: { min: 500, max: 12000, step: 50 },
  // Low-mode participation; the high mode's sqrt(1 - low²) keeps the port normalized.
  lowParticipation: { min: 0.05, max: 0.95, step: 0.01 },
  dcHz: { min: 5, max: 60, step: 1 },
});

export type UnifiedSettings = Readonly<Record<keyof typeof UNIFIED_SETTING_RANGES, number>>;

/**
 * The one check of a friction-synthesis settings record, for the tire's UNIFIED and the walls' SCRAPE alike: each value
 * within `ranges`, omitted ones from `defaults`, and both modes underdamped (half damping below the lower modal
 * frequency).
 */
export function resolveFrictionSettings(
  name: string,
  ranges: Readonly<Record<keyof UnifiedSettings, { readonly min: number; readonly max: number }>>,
  defaults: UnifiedSettings,
  value: Partial<UnifiedSettings> = {},
): UnifiedSettings {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${name} settings must be an object`);
  const result = {} as Record<keyof UnifiedSettings, number>;
  for (const key of Object.keys(ranges) as (keyof UnifiedSettings)[]) {
    const range = ranges[key];
    const number = value[key] === undefined ? defaults[key] : value[key];
    if (!Number.isFinite(number) || number < range.min || number > range.max)
      throw new RangeError(`invalid ${name} settings: ${key}`);
    result[key] = number;
  }
  if (result.resonanceDampingPerSecond / 2 >= 2 * Math.PI * result.lowFrequencyHz)
    throw new RangeError(`invalid ${name} settings: resonanceDampingPerSecond`);
  return Object.freeze(result);
}

export function resolveUnifiedSettings(value: Partial<UnifiedSettings> = {}): UnifiedSettings {
  return resolveFrictionSettings('unified', UNIFIED_SETTING_RANGES, DEFAULT_AUDIO_SETTINGS.unified, value);
}

export function sameUnifiedSettings(a: UnifiedSettings, b: UnifiedSettings): boolean {
  return (Object.keys(UNIFIED_SETTING_RANGES) as (keyof UnifiedSettings)[]).every((key) => a[key] === b[key]);
}
