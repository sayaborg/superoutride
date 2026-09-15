/** SPECTRAL acoustic domains and authored settings. NOT measured tire data. Authority: docs/audio.md. */
export const SPECTRAL_INPUTS = Object.freeze({
  longitudinalVelocity: Object.freeze({ min: -100, max: 100, step: 1, value: 25, label: 'Contact longitudinal (m/s)' }),
  lateralVelocity: Object.freeze({ min: -100, max: 100, step: 0.1, value: 4, label: 'Contact lateral (m/s)' }),
  wheelSpeed: Object.freeze({ min: -200, max: 200, step: 1, value: 25, label: 'Wheel peripheral speed (m/s)' }),
  load: Object.freeze({ min: 0, max: 30000, step: 100, value: 4000, label: 'Accepted normal load (N)' }),
  longitudinalPower: Object.freeze({ min: 0, max: 1000000, step: 100, value: 0, label: 'Longitudinal slip work (W)' }),
  lateralPower: Object.freeze({ min: 0, max: 1000000, step: 100, value: 12000, label: 'Lateral slip work (W)' }),
  demand: Object.freeze({ min: 0, max: 50, step: 0.05, value: 1.5, label: 'Demand rho (not grip remaining)' }),
});
export type SpectralObservation = { readonly [K in keyof typeof SPECTRAL_INPUTS]: number };
export const SPECTRAL_INPUT_KEYS = Object.freeze(Object.keys(SPECTRAL_INPUTS) as (keyof SpectralObservation)[]);
export const SPECTRAL_SETTINGS = Object.freeze({
  minRate: 44100,
  maxRate: 192000,
  controlHz: 1000,
  seed: 0x3547ab91,
  rearSeed: 0x691cf37d,
  roadGain: 0.04,
  loadScaleNewtons: 2000,
  roadHalfSpeed: 15,
  attackSeconds: 0.015,
  releaseSeconds: 0.01,
  toneSeconds: 0.02,
  wanderSeconds: 0.15,
  wanderDepth: 0.015,

  powerScaleWatts: 8000,
  directionScaleWatts: 100,
  scrubGain: 0.04,
  squealGain: 0.06,
  harmonicWeights: Object.freeze([0.65, 1, 0.6, 0.28]),
  dcHz: 18,
  outputHz: 8000,
});

/** Forces/speeds drive authored textures; identities are discrete, coefficients follow continuously. */
export const SPECTRAL_TEXTURES = Object.freeze([
  Object.freeze({
    surface: 'ASPHALT',
    roadLow: 0.4,
    roadHigh: 0.55,
    scrubLow: 0.35,
    scrubHigh: 0.65,
    squeal: 1,
    scaleMeters: 0.3,
    depth: 0.08,
  }),
  Object.freeze({
    surface: 'SHOULDER',
    roadLow: 0.85,
    roadHigh: 0.7,
    scrubLow: 0.75,
    scrubHigh: 0.7,
    squeal: 0.3,
    scaleMeters: 0.6,
    depth: 0.4,
  }),
  Object.freeze({
    surface: 'GRASS',
    roadLow: 0.85,
    roadHigh: 0.12,
    scrubLow: 0.6,
    scrubHigh: 0.15,
    squeal: 0,
    scaleMeters: 1.4,
    depth: 0.45,
  }),
  Object.freeze({
    surface: 'DIRT',
    roadLow: 1,
    roadHigh: 0.55,
    scrubLow: 0.95,
    scrubHigh: 0.55,
    squeal: 0,
    scaleMeters: 0.8,
    depth: 0.8,
  }),
  Object.freeze({
    surface: 'SAND',
    roadLow: 0.3,
    roadHigh: 0.8,
    scrubLow: 0.35,
    scrubHigh: 1,
    squeal: 0,
    scaleMeters: 0.12,
    depth: 0.2,
  }),
]);
