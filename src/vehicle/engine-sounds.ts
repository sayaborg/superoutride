import { compileEngineSound } from '../audio/engine-sound.js';

const even = (count: number) => Array.from({ length: count }, (_, index) => index / count);
/**
 * Acoustic sketches, not certified recordings or manufacturer exhaust models. Bores and outlet segments
 * (collector -> muffler -> tail) are typical values, not measurements; listening revises them.
 */
export const ENGINE_SOUNDS = Object.freeze({
  TESTAROSSA: compileEngineSound({
    exhaust: {
      banks: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      primaries: { lengths: [0.5, 0.54, 0.46, 0.5, 0.58, 0.62, 0.54, 0.58, 0.42, 0.46, 0.62, 0.66], bore: 0.042 },
      outlet: [
        { length: 0.45, bore: 0.055 },
        { length: 0.5, bore: 0.18 },
        { length: 0.4, bore: 0.055 },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(12),
  }),
  '911_TURBO_3_3': compileEngineSound({
    // Order 1-6-2-4-3-5 alternates banks: each collector receives a pulse every 240 degrees.
    // Independent outlets approximate the banks; the downstream turbo/merge is not modeled. Short primaries
    // lead to the turbine; the turbine's absorption is not represented.
    exhaust: {
      banks: [0, 1, 0, 1, 0, 1],
      primaries: { lengths: [0.38, 0.45, 0.3, 0.36, 0.34, 0.4], bore: 0.042 },
      outlet: [
        { length: 0.5, bore: 0.055 },
        { length: 0.5, bore: 0.18 },
        { length: 0.45, bore: 0.055 },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(6),
  }),
  CORVETTE_C4: compileEngineSound({
    // Firing order 1-8-4-3-6-5-7-2; odd/even cylinders use separate banks.
    exhaust: {
      banks: [0, 1, 1, 0, 1, 0, 0, 1],
      primaries: { lengths: [0.62, 0.8, 0.54, 0.7, 0.72, 0.52, 0.84, 0.6], bore: 0.042 },
      outlet: [
        { length: 0.6, bore: 0.055 },
        { length: 0.5, bore: 0.18 },
        { length: 0.5, bore: 0.055 },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(8),
  }),
  GOLF_GTI_16V: compileEngineSound({
    exhaust: {
      banks: [0, 0, 0, 0],
      primaries: { lengths: [0.55, 0.42, 0.48, 0.6], bore: 0.042 },
      outlet: [
        { length: 0.6, bore: 0.055 },
        { length: 0.5, bore: 0.18 },
        { length: 0.5, bore: 0.055 },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(4),
  }),
  DELTA_HF_INTEGRALE: compileEngineSound({
    exhaust: {
      banks: [0, 0, 0, 0],
      primaries: { lengths: [0.3, 0.24, 0.27, 0.34], bore: 0.042 },
      outlet: [
        { length: 0.6, bore: 0.055 },
        { length: 0.5, bore: 0.18 },
        { length: 0.5, bore: 0.055 },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(4),
  }),
  VFR750R: compileEngineSound({
    // Collector grouping and lengths are listening sketches, not a factory header reconstruction.
    exhaust: {
      banks: [0, 1, 0, 1],
      primaries: { lengths: [0.7, 0.92, 0.76, 0.86], bore: 0.035 },
      outlet: [
        { length: 0.3, bore: 0.042 },
        { length: 0.35, bore: 0.11 },
        { length: 0.15, bore: 0.04 },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: [0, 0.125, 0.5, 0.625],
  }),
  R80_GS_PARIS_DAKAR: compileEngineSound({
    exhaust: {
      banks: [0, 1],
      primaries: { lengths: [0.82, 0.9], bore: 0.035 },
      outlet: [
        { length: 0.3, bore: 0.042 },
        { length: 0.35, bore: 0.11 },
        { length: 0.15, bore: 0.04 },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(2),
  }),
  FXRT_SPORT_GLIDE: compileEngineSound({
    exhaust: {
      banks: [0, 1],
      primaries: { lengths: [0.72, 1.04], bore: 0.035 },
      outlet: [
        { length: 0.3, bore: 0.042 },
        { length: 0.35, bore: 0.11 },
        { length: 0.15, bore: 0.04 },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: [0, 0.4375],
  }),
  PX200E_ARCOBALENO: compileEngineSound({
    // Two-stroke: an expansion chamber, then a narrow tail.
    exhaust: {
      banks: [0],
      primaries: { lengths: [0.28], bore: 0.028 },
      outlet: [
        { length: 0.3, bore: 0.08 },
        { length: 0.2, bore: 0.02 },
      ],
    },
    cycleRevolutions: 1,
    firingPhases: [0],
  }),
});
