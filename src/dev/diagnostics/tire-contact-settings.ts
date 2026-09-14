/** Trial coefficients, NOT measured tire data. Runtime sound remains owned by docs/audio.md. */
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
export const CONTACT_TRIAL = Object.freeze({
  minRate: 44100,
  maxRate: 192000,
  roadMode: Object.freeze({ massKg: 0.004, frequencyHz: 350, dampingRatio: 0.25 }),
  // Lower mechanical impedance lets the SAME friction law enter a strongly nonlinear cycle.
  // f0/zeta stay fixed; k and c follow mass. This 0.5 g is representative, not measured tread mass.
  frictionMode: Object.freeze({ massKg: 0.0005, frequencyHz: 800, dampingRatio: 0.03 }),
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
// Two comparative sketches, deliberately NOT mapped to the game's SurfaceType enumeration.
export const CONTACT_TEXTURES = Object.freeze({
  paved: Object.freeze({ label: 'Paved sketch', roadRoughness: 0.04, slipRoughness: 0.03, frictionDrop: 0.6 }),
  loose: Object.freeze({ label: 'Loose-ground sketch', roadRoughness: 0.15, slipRoughness: 0.06, frictionDrop: 0 }),
});
