import type { TIRE_SOUND_SURFACES } from './tire-sound-observation.js';

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
  // Fixed modal data: a shared friction port couples BOTH modes. Neither is a separate S/Q source.
  modes: Object.freeze([
    Object.freeze({ frequencyHz: 300, dampingPerSecond: 2 * Math.PI * 500, participation: 0.45 }),
    Object.freeze({ frequencyHz: 1350, dampingPerSecond: 2 * Math.PI * 500, participation: Math.sqrt(1 - 0.45 ** 2) }),
  ]),
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
} satisfies Record<(typeof TIRE_SOUND_SURFACES)[number], Readonly<{ roughness: number; susceptibility: number }>>);

/** Numerical support only; no listening threshold or emergency output clamp. */
export const UNIFIED_DOMAIN = Object.freeze({ minRate: 44100, maxRate: 192000 });
