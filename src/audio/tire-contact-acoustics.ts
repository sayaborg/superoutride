/** Representative acoustic coefficients, NOT measured tire data. Authority: docs/audio.md. */
export interface ContactModeParameters {
  readonly massKg: number;
  readonly frequencyHz: number;
  readonly dampingRatio: number;
}
export interface ContactFrictionParameters {
  readonly dynamic: number;
  readonly drop: number;
  readonly weakeningSpeed: number;
  readonly regularizationSpeed: number;
}
export const CONTACT_INPUTS = Object.freeze({
  travelSpeed: Object.freeze({ min: 0, max: 100, step: 1, label: 'Road travel (m/s)' }),
  slipSpeed: Object.freeze({ min: 0, max: 4, step: 0.01, label: 'Representative slip (m/s)' }),
  load: Object.freeze({ min: 0, max: 8, step: 0.1, label: 'Representative load (N, NOT axle load)' }),
});
// Time-scale the friction vibration: m/a, k*a, unchanged c and force law.
// This raises pitch without changing the continuous system's steady velocity waveform.
const frictionRate = 1.5;
export const CONTACT_ACOUSTICS = Object.freeze({
  minRate: 44100,
  maxRate: 192000,
  roadMode: Object.freeze({ massKg: 0.004, frequencyHz: 350, dampingRatio: 0.25 }),
  // Representative acoustic calibration, not a measured tread mass or an imposed pitch map.
  frictionMode: Object.freeze({ massKg: 0.0005 / frictionRate, frequencyHz: 800 * frictionRate, dampingRatio: 0.03 }),
  friction: Object.freeze({ dynamic: 0.65, drop: 0.6, weakeningSpeed: 0.5, regularizationSpeed: 0.08 }),
  roadCellMeters: 0.02,
  slipCellMeters: 0.0005,
  // Smoothly remove roughness forcing at rest; velocity scales are authored, not tire thresholds.
  roadForceSpeed: 1,
  slipForceSpeed: 0.1,
  controlSeconds: 0.01,
  outputCutoffHz: 6000,
  // Velocity pickups only. No clipping, RMS normalization or post-hoc squeal envelope.
  roadGain: 0.5,
  frictionGain: 0.16, // fixed headroom for larger vibration velocities, never an automatic normalizer
  listeningGain: 0.5,
  maxSolveIterations: 24,
  relativeForceTolerance: 1e-11,
  frontSeed: 123456789,
  rearSeed: 362436069,
});
/** Texture changes affect forcing, not oscillator energy storage or output gain. */
export interface ContactTextureParameters {
  readonly roadRoughness: number;
  readonly slipRoughness: number;
  readonly frictionDrop: number;
  /** Spatial traversal scales relative to the shared road/slip cell lengths. */
  readonly roadRate: number;
  readonly slipRate: number;
}
// Authored listening sketches, NOT measured material data. Paved and former loose/dirt
// keep the accepted road taps. Sand has finer grains; grass has coarser, softer forcing.
export const CONTACT_TEXTURES = Object.freeze({
  paved: Object.freeze({
    surface: 'ASPHALT',
    label: 'Asphalt',
    roadRoughness: 0.04,
    slipRoughness: 0.03,
    frictionDrop: CONTACT_ACOUSTICS.friction.drop,
    roadRate: 1,
    slipRate: 1,
  }),
  shoulder: Object.freeze({
    surface: 'SHOULDER',
    label: 'Rough shoulder',
    roadRoughness: 0.09,
    slipRoughness: 0.045,
    frictionDrop: 0.25,
    roadRate: 1.4,
    slipRate: 1.3,
  }),
  grass: Object.freeze({
    surface: 'GRASS',
    label: 'Grass',
    roadRoughness: 0.045,
    slipRoughness: 0.025,
    frictionDrop: 0,
    roadRate: 0.4,
    slipRate: 0.5,
  }),
  dirt: Object.freeze({
    surface: 'DIRT',
    label: 'Dirt',
    roadRoughness: 0.15,
    slipRoughness: 0.06,
    frictionDrop: 0,
    roadRate: 1,
    slipRate: 1,
  }),
  sand: Object.freeze({
    surface: 'SAND',
    label: 'Sand',
    roadRoughness: 0.075,
    slipRoughness: 0.08,
    frictionDrop: 0,
    roadRate: 2.5,
    slipRate: 2,
  }),
});
// Discrete transport identity only. Smooth the resolved coefficients, never this index.
export const CONTACT_TEXTURE_KEYS = Object.freeze(Object.keys(CONTACT_TEXTURES) as (keyof typeof CONTACT_TEXTURES)[]);
