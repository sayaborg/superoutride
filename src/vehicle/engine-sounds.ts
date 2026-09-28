import { compileEngineSound } from '../audio/engine-sound.js';

const even = (count: number) => Array.from({ length: count }, (_, index) => index / count);
/**
 * Acoustic sketches, not certified recordings or manufacturer exhaust models.
 * Exhaust durations are typical values, not measurements.
 */
export const ENGINE_SOUNDS = Object.freeze({
  TESTAROSSA: compileEngineSound({
    exhaust: {
      banks: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      lengths: [0.5, 0.54, 0.46, 0.5, 0.58, 0.62, 0.54, 0.58, 0.42, 0.46, 0.62, 0.66],
      outlet: 0.85,
    },
    cycleRevolutions: 2,
    exhaustDurationDegrees: 240,
    firingPhases: even(12),
  }),
  '911_TURBO_3_3': compileEngineSound({
    // Order 1-6-2-4-3-5 alternates banks: each collector receives a pulse every 240 degrees.
    // Independent outlets approximate the banks; the downstream turbo/merge is not modeled.
    exhaust: { banks: [0, 1, 0, 1, 0, 1], lengths: [0.62, 0.78, 0.46, 0.58, 0.54, 0.68], outlet: 0.95 },
    cycleRevolutions: 2,
    exhaustDurationDegrees: 240,
    firingPhases: even(6),
  }),
  CORVETTE_C4: compileEngineSound({
    // Firing order 1-8-4-3-6-5-7-2; odd/even cylinders use separate banks.
    exhaust: { banks: [0, 1, 1, 0, 1, 0, 0, 1], lengths: [0.62, 0.8, 0.54, 0.7, 0.72, 0.52, 0.84, 0.6], outlet: 1.65 },
    cycleRevolutions: 2,
    exhaustDurationDegrees: 240,
    firingPhases: even(8),
  }),
  GOLF_GTI_16V: compileEngineSound({
    exhaust: { banks: [0, 0, 0, 0], lengths: [0.55, 0.42, 0.48, 0.6], outlet: 1.25 },
    cycleRevolutions: 2,
    exhaustDurationDegrees: 240,
    firingPhases: even(4),
  }),
  DELTA_HF_INTEGRALE: compileEngineSound({
    exhaust: { banks: [0, 0, 0, 0], lengths: [0.3, 0.24, 0.27, 0.34], outlet: 1.65 },
    cycleRevolutions: 2,
    exhaustDurationDegrees: 240,
    firingPhases: even(4),
  }),
  VFR750R: compileEngineSound({
    // Collector grouping and lengths are listening sketches, not a factory header reconstruction.
    exhaust: { banks: [0, 1, 0, 1], lengths: [0.7, 0.92, 0.76, 0.86], outlet: 0.55 },
    cycleRevolutions: 2,
    exhaustDurationDegrees: 240,
    firingPhases: [0, 0.125, 0.5, 0.625],
  }),
  R80_GS_PARIS_DAKAR: compileEngineSound({
    exhaust: { banks: [0, 1], lengths: [0.82, 0.9], outlet: 0.85 },
    cycleRevolutions: 2,
    exhaustDurationDegrees: 240,
    firingPhases: even(2),
  }),
  FXRT_SPORT_GLIDE: compileEngineSound({
    exhaust: { banks: [0, 1], lengths: [0.72, 1.04], outlet: 0.65 },
    cycleRevolutions: 2,
    exhaustDurationDegrees: 240,
    firingPhases: [0, 0.4375],
  }),
  PX200E_ARCOBALENO: compileEngineSound({
    exhaust: { banks: [0], lengths: [0.28], outlet: 0.48 },
    cycleRevolutions: 1,
    exhaustDurationDegrees: 175,
    firingPhases: [0],
  }),
});
