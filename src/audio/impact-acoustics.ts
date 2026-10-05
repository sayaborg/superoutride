import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import type { ImpactRecording } from './recordings.js';

/**
 * Impacts: each contact that begins plays its counterpart's recording once at `W / (W + reference)` of full volume,
 * from the work `W` its damper term dissipated, the same form as the tire's work response. The reference work is one
 * listening setting per counterpart (DEV IMPACT panel), since the counterparts' masses differ by orders of magnitude.
 * NOT measured values.
 */
export type ImpactSettings = Readonly<Record<`${ImpactRecording}Joules`, number>>;

// About a quarter to four times each default.
export const IMPACT_SETTING_RANGES: Readonly<Record<keyof ImpactSettings, { min: number; max: number; step: number }>> =
  Object.freeze({
    vehicleJoules: Object.freeze({ min: 12500, max: 200000, step: 500 }),
    wallJoules: Object.freeze({ min: 25000, max: 400000, step: 1000 }),
    objectJoules: Object.freeze({ min: 25000, max: 400000, step: 1000 }),
    movableJoules: Object.freeze({ min: 1750, max: 28000, step: 50 }),
  });

export function resolveImpactSettings(overrides: Partial<ImpactSettings> = {}): ImpactSettings {
  const settings = { ...DEFAULT_AUDIO_SETTINGS.impact };
  for (const key of Object.keys(IMPACT_SETTING_RANGES) as (keyof ImpactSettings)[]) {
    const value = overrides[key] === undefined ? settings[key] : overrides[key];
    const range = IMPACT_SETTING_RANGES[key];
    if (!Number.isFinite(value) || value < range.min || value > range.max)
      throw new RangeError(`invalid impact settings: ${key}`);
    settings[key] = value;
  }
  return Object.freeze(settings);
}

/** An impact's volume, 0–1, from its work (J) against its counterpart's reference work. */
export function impactVolume(settings: ImpactSettings, counterpart: ImpactRecording, work: number): number {
  const reference = settings[`${counterpart}Joules`];
  return work > 0 ? work / (work + reference) : 0;
}
