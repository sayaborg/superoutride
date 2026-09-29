import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
/**
 * Rotation-driven rolling generator. No value derives from physics: every sound value is a listening setting
 * (`RollingSettings`). Only the noise stream indices and the internal control rate are structural constants.
 * Timing, filtering and texture belong to R independently of friction synthesis.
 */
export const ROLLING_SYNTHESIS = Object.freeze({
  bandStreams: Object.freeze([8, 9]),
  textureStream: 10,
  controlHz: 1000,
});

/**
 * Listening settings on the DEV ROLLING panel, NOT measured tread orders, texture lengths, acoustic efficiencies
 * or material properties. Defaults are in `DEFAULT_AUDIO_SETTINGS`; ranges are about a quarter to four
 * times each default.
 */
export const ROLLING_SETTING_RANGES = Object.freeze({
  // Surface and wheel-frequency following at the control rate.
  toneSeconds: { min: 0.005, max: 0.08, step: 0.001 },
  // Wheel orders of the two noise bands.
  lowOrder: { min: 1, max: 24, step: 1 },
  highOrder: { min: 1, max: 24, step: 1 },
  minimumHz: { min: 9, max: 140, step: 1 },
  bandwidthRatio: { min: 0.2, max: 3.2, step: 0.05 },
  loadHalfNewtons: { min: 500, max: 8000, step: 50 },
  speedHalfMps: { min: 4, max: 60, step: 0.5 },
  speedExponent: { min: 0.4, max: 6, step: 0.1 },
  attackSeconds: { min: 0.004, max: 0.06, step: 0.001 },
  releaseSeconds: { min: 0.0025, max: 0.04, step: 0.0005 },
  textureMinimumDepth: { min: 0.05, max: 0.88, step: 0.01 },
  textureMaximumHz: { min: 40, max: 640, step: 5 },
  gain: { min: 0.01, max: 0.16, step: 0.005 },
  outputHz: { min: 225, max: 3600, step: 25 },
  dcHz: { min: 5, max: 60, step: 1 },
});

export type RollingSettings = Readonly<Record<keyof typeof ROLLING_SETTING_RANGES, number>>;

export function resolveRollingSettings(value: Partial<RollingSettings> = {}): RollingSettings {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('rolling sound settings must be an object');
  const result = {} as Record<keyof RollingSettings, number>;
  for (const key of Object.keys(ROLLING_SETTING_RANGES) as (keyof RollingSettings)[]) {
    const range = ROLLING_SETTING_RANGES[key];
    const number = value[key] === undefined ? DEFAULT_AUDIO_SETTINGS.rolling[key] : value[key];
    if (!Number.isFinite(number) || number < range.min || number > range.max)
      throw new RangeError(`invalid rolling settings: ${key}`);
    result[key] = number;
  }
  if (!Number.isInteger(result.lowOrder) || !Number.isInteger(result.highOrder))
    throw new RangeError('invalid rolling settings: orders must be integers');
  return Object.freeze(result);
}

export function sameRollingSettings(a: RollingSettings, b: RollingSettings): boolean {
  return (Object.keys(ROLLING_SETTING_RANGES) as (keyof RollingSettings)[]).every((key) => a[key] === b[key]);
}
