import type { TIRE_SOUND_SURFACES } from './tire-sound-observation.js';

/**
 * MODAL Q-only audition. ALL values are authored magic numbers, not measurements.
 * HYBRID supplies the starting pitch, four-band palette and slow wander, not its envelope.
 * Independent ownership is deliberate: tuning this candidate must not retune the reference.
 */
export const MODAL_SETTINGS = Object.freeze({
  frontSeed: 0x3547ab91,
  rearSeed: 0x691cf37d,
  controlHz: 1000,
  attackSeconds: 0.025,
  releaseSeconds: 0.065,
  feedbackMaximum: 4,
  saturation: 4,
  powerReferenceWatts: 12000,
  slipHalfMps: 3,
  slipRolloffMps: 45,
  noiseRms: 0.12,
  pitchBaseHz: 1100,
  pitchSlipHz: 350,
  pitchSlipHalfMps: 6,
  pitchLongitudinalHz: 220,
  bandwidthHz: 50,
  slipBandwidthHz: 20,
  slipBandwidthHalfMps: 8,
  wheelBandwidthHz: 35,
  wheelBandwidthHalfMps: 30,
  wanderSeconds: 0.15,
  wanderDepth: 0.015,
  harmonicWeights: Object.freeze([0.65, 1, 0.6, 0.28]),
  outputGain: 0.04,
  outputCutoffHz: 8000,
  dcHz: 18,
});

/** Authored roughness/instability palette; not measured rubber or road coefficients. */
export const MODAL_SURFACES = Object.freeze({
  ASPHALT: Object.freeze({ roughness: 1, susceptibility: 1 }),
  SHOULDER: Object.freeze({ roughness: 1.3, susceptibility: 0.45 }),
  GRASS: Object.freeze({ roughness: 0.75, susceptibility: 0.05 }),
  DIRT: Object.freeze({ roughness: 1.5, susceptibility: 0.15 }),
  SAND: Object.freeze({ roughness: 1.1, susceptibility: 0.03 }),
} satisfies Record<(typeof TIRE_SOUND_SURFACES)[number], Readonly<{ roughness: number; susceptibility: number }>>);

/** Audition bounds (also magic numbers), not physical tire ranges. */
export const MODAL_TUNING_RANGES = Object.freeze({
  feedbackMaximum: { min: 0, max: 6, step: 0.1, defaultValue: MODAL_SETTINGS.feedbackMaximum },
  saturation: { min: 2, max: 12, step: 0.25, defaultValue: MODAL_SETTINGS.saturation },
  powerReferenceWatts: { min: 3000, max: 30000, step: 500, defaultValue: MODAL_SETTINGS.powerReferenceWatts },
  slipHalfMps: { min: 1, max: 12, step: 0.25, defaultValue: MODAL_SETTINGS.slipHalfMps },
  slipRolloffMps: { min: 20, max: 80, step: 1, defaultValue: MODAL_SETTINGS.slipRolloffMps },
  noiseRms: { min: 0, max: 0.4, step: 0.01, defaultValue: MODAL_SETTINGS.noiseRms },
  pitchBaseHz: { min: 600, max: 2400, step: 25, defaultValue: MODAL_SETTINGS.pitchBaseHz },
  bandwidthHz: { min: 50, max: 800, step: 10, defaultValue: MODAL_SETTINGS.bandwidthHz },
  wanderDepth: { min: 0, max: 0.04, step: 0.001, defaultValue: MODAL_SETTINGS.wanderDepth },
  outputGain: { min: 0, max: 0.08, step: 0.002, defaultValue: MODAL_SETTINGS.outputGain },
});
export type ModalTuning = Readonly<Record<keyof typeof MODAL_TUNING_RANGES, number>>;

export function resolveModalTuning(value: Partial<ModalTuning> = {}): ModalTuning {
  const result = {} as Record<keyof ModalTuning, number>;
  for (const key of Object.keys(MODAL_TUNING_RANGES) as (keyof ModalTuning)[]) {
    const range = MODAL_TUNING_RANGES[key];
    const number = value[key] === undefined ? range.defaultValue : value[key];
    if (!Number.isFinite(number) || number < range.min || number > range.max)
      throw new RangeError(`invalid modal tuning: ${key}`);
    result[key] = number;
  }
  return Object.freeze(result);
}

export function sameModalTuning(a: ModalTuning, b: ModalTuning): boolean {
  return (Object.keys(MODAL_TUNING_RANGES) as (keyof ModalTuning)[]).every((key) => a[key] === b[key]);
}
