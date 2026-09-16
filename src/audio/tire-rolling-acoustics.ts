import type { TIRE_SOUND_SURFACES } from './tire-sound-observation.js';

/**
 * Shared HYBRID/UNIFIED rolling source. Every value is an authored listening choice ("magic number"),
 * not a measured tread order, texture length, acoustic efficiency or material property.
 * Timing, filtering and texture belong to R independently of either friction implementation.
 */
export const ROLLING_SETTINGS = Object.freeze({
  controlHz: 1000,
  toneSeconds: 0.02,
  orders: Object.freeze([4, 12]),
  minimumHz: 35,
  bandwidthRatio: 0.8,
  loadHalfNewtons: 2000,
  speedHalfMps: 15,
  speedExponent: 1.5,
  attackSeconds: 0.015,
  releaseSeconds: 0.01,
  textureMinimumDepth: 0.22,
  textureMaximumHz: 160,
  gain: 0.04,
  outputHz: 900,
  dcHz: 18,
});

/** R's surface palette; friction implementations own their independent response to each surface. */
export const ROLLING_SURFACES = Object.freeze({
  ASPHALT: Object.freeze({ low: 0.9, high: 0.18, textureLengthMeters: 0.3, textureDepth: 0.12 }),
  SHOULDER: Object.freeze({ low: 0.85, high: 0.7, textureLengthMeters: 0.6, textureDepth: 0.4 }),
  GRASS: Object.freeze({ low: 0.85, high: 0.12, textureLengthMeters: 1.4, textureDepth: 0.45 }),
  DIRT: Object.freeze({ low: 1, high: 0.55, textureLengthMeters: 0.8, textureDepth: 0.8 }),
  SAND: Object.freeze({ low: 0.3, high: 0.8, textureLengthMeters: 0.12, textureDepth: 0.2 }),
} satisfies Record<(typeof TIRE_SOUND_SURFACES)[number], Readonly<Record<string, number>>>);
