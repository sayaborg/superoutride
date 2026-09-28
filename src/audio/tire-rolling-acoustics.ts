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
 * or material properties. Defaults are the implementer's initial values; ranges are about a quarter to four
 * times each default.
 */
export const ROLLING_SETTING_RANGES = Object.freeze({
  // Surface and wheel-frequency following at the control rate.
  toneSeconds: { min: 0.005, max: 0.08, step: 0.001, defaultValue: 0.02 },
  // Wheel orders of the two noise bands.
  lowOrder: { min: 1, max: 24, step: 1, defaultValue: 4 },
  highOrder: { min: 1, max: 24, step: 1, defaultValue: 12 },
  minimumHz: { min: 9, max: 140, step: 1, defaultValue: 35 },
  bandwidthRatio: { min: 0.2, max: 3.2, step: 0.05, defaultValue: 0.8 },
  loadHalfNewtons: { min: 500, max: 8000, step: 50, defaultValue: 2000 },
  speedHalfMps: { min: 4, max: 60, step: 0.5, defaultValue: 15 },
  speedExponent: { min: 0.4, max: 6, step: 0.1, defaultValue: 1.5 },
  attackSeconds: { min: 0.004, max: 0.06, step: 0.001, defaultValue: 0.015 },
  releaseSeconds: { min: 0.0025, max: 0.04, step: 0.0005, defaultValue: 0.01 },
  textureMinimumDepth: { min: 0.05, max: 0.88, step: 0.01, defaultValue: 0.22 },
  textureMaximumHz: { min: 40, max: 640, step: 5, defaultValue: 160 },
  gain: { min: 0.01, max: 0.16, step: 0.005, defaultValue: 0.04 },
  outputHz: { min: 225, max: 3600, step: 25, defaultValue: 900 },
  dcHz: { min: 5, max: 60, step: 1, defaultValue: 18 },
});

export type RollingSettings = Readonly<Record<keyof typeof ROLLING_SETTING_RANGES, number>>;

export function resolveRollingSettings(value: Partial<RollingSettings> = {}): RollingSettings {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('rolling sound settings must be an object');
  const result = {} as Record<keyof RollingSettings, number>;
  for (const key of Object.keys(ROLLING_SETTING_RANGES) as (keyof RollingSettings)[]) {
    const range = ROLLING_SETTING_RANGES[key];
    const number = value[key] === undefined ? range.defaultValue : value[key];
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

/** R's surface palette; friction implementations own their independent response to each surface. */
export const ROLLING_SURFACES = Object.freeze({
  ASPHALT: Object.freeze({ low: 0.9, high: 0.18, textureLengthMeters: 0.3, textureDepth: 0.12 }),
  SHOULDER: Object.freeze({ low: 0.85, high: 0.7, textureLengthMeters: 0.6, textureDepth: 0.4 }),
  GRASS: Object.freeze({ low: 0.85, high: 0.12, textureLengthMeters: 1.4, textureDepth: 0.45 }),
  DIRT: Object.freeze({ low: 1, high: 0.55, textureLengthMeters: 0.8, textureDepth: 0.8 }),
  SAND: Object.freeze({ low: 0.3, high: 0.8, textureLengthMeters: 0.12, textureDepth: 0.2 }),
});
