import type { TIRE_SOUND_SURFACES } from './tire-sound-observation.js';

/**
 * Primary tire sound calibration. ALL values below are authored listening choices ("magic numbers"),
 * not measured rubber properties, acoustic watts, local contact dimensions or instability thresholds.
 * Units name their role in the surrogate; changing these values must not change vehicle mechanics.
 */
export const HYBRID_SETTINGS = Object.freeze({
  frontSeed: 0x3547ab91,
  rearSeed: 0x691cf37d,
  controlHz: 1000,
  attackSeconds: 0.025,
  releaseSeconds: 0.065,
  toneSeconds: 0.02,
  powerReferenceWatts: 12000,
  // Demand is normalized force demand, not measured contact-patch sliding fraction or grip remaining.
  demandStart: 0.5,
  demandFull: 1.15,
  slipStartMps: 0.5,
  slipFullMps: 2,
  slipRolloffMps: 45,
  // Dimensionless vibration energy, not joules. Positive linear growth permits sustained Q.
  excitationThreshold: 0.3,
  growthPerSecond: 140,
  saturationPerSecond: 150,
  seedEnergyPerSecond: 0.0004,
  pitchBaseHz: 1100,
  pitchSlipHz: 350,
  pitchSlipHalfMps: 6,
  pitchLongitudinalHz: 220,
  squealBaseBandwidthHz: 50,
  squealSlipBandwidthHz: 20,
  squealSlipBandwidthHalfMps: 8,
  squealWheelBandwidthHz: 35,
  squealWheelBandwidthHalfMps: 30,
  wanderSeconds: 0.15,
  wanderDepth: 0.015,
  harmonicAmplitudeReference: 0.5,
  harmonicWeights: Object.freeze([0.65, 1, 0.6, 0.28]),
  squealGain: 0.06,
  squealOutputHz: 8000,
  // Broad low/mid sliding bands coexist with Q; no artificial transfer of "acoustic energy".
  scrubBands: Object.freeze([
    Object.freeze({ baseHz: 220, slipHz: 160, bandwidthHz: 450 }),
    Object.freeze({ baseHz: 780, slipHz: 260, bandwidthHz: 1000 }),
  ]),
  scrubSlipHalfMps: 6,
  scrubGain: 0.045,
  scrubOutputHz: 1800,
  // Broad wheel-order rolling: rotation is an input, not a claim of measured tread orders.
  roadOrders: Object.freeze([4, 12]),
  roadMinimumHz: 35,
  roadBandwidthRatio: 0.8,
  roadLoadHalfNewtons: 2000,
  roadSpeedHalfMps: 15,
  roadSpeedExponent: 1.5,
  roadAttackSeconds: 0.015,
  roadReleaseSeconds: 0.01,
  roadTextureMinimumDepth: 0.22,
  roadGain: 0.04,
  roadOutputHz: 900,
  textureMaximumHz: 160,
  dcHz: 18,
});

/** Authored surface palette, not measured friction, texture wavelengths or acoustic efficiencies. */
export const HYBRID_SURFACES = Object.freeze({
  ASPHALT: Object.freeze({
    roadLow: 0.9,
    roadHigh: 0.18,
    scrubLow: 0.9,
    scrubHigh: 0.3,
    squeal: 1,
    textureLengthMeters: 0.3,
    textureDepth: 0.12,
  }),
  SHOULDER: Object.freeze({
    roadLow: 0.85,
    roadHigh: 0.7,
    scrubLow: 0.9,
    scrubHigh: 0.5,
    squeal: 0.45,
    textureLengthMeters: 0.6,
    textureDepth: 0.4,
  }),
  GRASS: Object.freeze({
    roadLow: 0.85,
    roadHigh: 0.12,
    scrubLow: 0.65,
    scrubHigh: 0.15,
    squeal: 0.05,
    textureLengthMeters: 1.4,
    textureDepth: 0.45,
  }),
  DIRT: Object.freeze({
    roadLow: 1,
    roadHigh: 0.55,
    scrubLow: 1,
    scrubHigh: 0.4,
    squeal: 0.15,
    textureLengthMeters: 0.8,
    textureDepth: 0.8,
  }),
  SAND: Object.freeze({
    roadLow: 0.3,
    roadHigh: 0.8,
    scrubLow: 0.7,
    scrubHigh: 0.65,
    squeal: 0.03,
    textureLengthMeters: 0.12,
    textureDepth: 0.2,
  }),
} satisfies Record<(typeof TIRE_SOUND_SURFACES)[number], Readonly<Record<string, number>>>);
