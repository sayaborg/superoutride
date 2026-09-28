import { compileEngineSound } from '../audio/engine-sound.js';

const even = (count: number) => Array.from({ length: count }, (_, index) => index / count);
/**
 * Acoustic sketches, not certified recordings or manufacturer exhaust models. Collector topologies (12-2, 6-2-1, ...)
 * are typical for each engine; pipe lengths are rough real-vehicle guides, revised by listening.
 */
export const ENGINE_SOUNDS = Object.freeze({
  TESTAROSSA: compileEngineSound({
    // 12-2: each bank's collector has its own open outlet.
    exhaust: {
      banks: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      lengths: [0.5, 0.54, 0.46, 0.5, 0.58, 0.62, 0.54, 0.58, 0.42, 0.46, 0.62, 0.66],
      pipes: [
        { length: 0.85, from: 0, to: null },
        { length: 0.85, from: 1, to: null },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(12),
  }),
  '911_TURBO_3_3': compileEngineSound({
    // Order 1-6-2-4-3-5 alternates banks: each collector receives a pulse every 240 degrees.
    // 6-2-1: both bank collectors merge at the turbine inlet, then one outlet. Short primaries lead to the
    // turbine; the turbine's absorption is not represented.
    exhaust: {
      banks: [0, 1, 0, 1, 0, 1],
      lengths: [0.38, 0.45, 0.3, 0.36, 0.34, 0.4],
      pipes: [
        { length: 0.3, from: 0, to: 2 },
        { length: 0.3, from: 1, to: 2 },
        { length: 0.9, from: 2, to: null },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(6),
  }),
  CORVETTE_C4: compileEngineSound({
    // Firing order 1-8-4-3-6-5-7-2; odd/even cylinders use separate banks.
    // 8-2-1-2: the two bank collectors merge at an X/H junction that splits to two outlets.
    exhaust: {
      banks: [0, 1, 1, 0, 1, 0, 0, 1],
      lengths: [0.62, 0.8, 0.54, 0.7, 0.72, 0.52, 0.84, 0.6],
      pipes: [
        { length: 0.8, from: 0, to: 2 },
        { length: 0.8, from: 1, to: 2 },
        { length: 1.2, from: 2, to: null },
        { length: 1.2, from: 2, to: null },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(8),
  }),
  GOLF_GTI_16V: compileEngineSound({
    // 4-1: one collector, one outlet.
    exhaust: { banks: [0, 0, 0, 0], lengths: [0.55, 0.42, 0.48, 0.6], pipes: [{ length: 1.25, from: 0, to: null }] },
    cycleRevolutions: 2,
    firingPhases: even(4),
  }),
  DELTA_HF_INTEGRALE: compileEngineSound({
    // 4-1: one collector, one outlet.
    exhaust: { banks: [0, 0, 0, 0], lengths: [0.3, 0.24, 0.27, 0.34], pipes: [{ length: 1.65, from: 0, to: null }] },
    cycleRevolutions: 2,
    firingPhases: even(4),
  }),
  VFR750R: compileEngineSound({
    // Collector grouping and lengths are listening sketches, not a factory header reconstruction.
    // 4-2-1: pairs of cylinders merge, then the two pairs merge into one outlet.
    exhaust: {
      banks: [0, 1, 0, 1],
      lengths: [0.7, 0.92, 0.76, 0.86],
      pipes: [
        { length: 0.25, from: 0, to: 2 },
        { length: 0.25, from: 1, to: 2 },
        { length: 0.55, from: 2, to: null },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: [0, 0.125, 0.5, 0.625],
  }),
  R80_GS_PARIS_DAKAR: compileEngineSound({
    // 2-1: both cylinders' pipes merge into one outlet.
    exhaust: {
      banks: [0, 1],
      lengths: [0.82, 0.9],
      pipes: [
        { length: 0.4, from: 0, to: 2 },
        { length: 0.4, from: 1, to: 2 },
        { length: 0.85, from: 2, to: null },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: even(2),
  }),
  FXRT_SPORT_GLIDE: compileEngineSound({
    // 2-2: each cylinder has its own outlet.
    exhaust: {
      banks: [0, 1],
      lengths: [0.72, 1.04],
      pipes: [
        { length: 0.65, from: 0, to: null },
        { length: 0.65, from: 1, to: null },
      ],
    },
    cycleRevolutions: 2,
    firingPhases: [0, 0.4375],
  }),
  PX200E_ARCOBALENO: compileEngineSound({
    // 1-1: one cylinder, one outlet.
    exhaust: { banks: [0], lengths: [0.28], pipes: [{ length: 0.48, from: 0, to: null }] },
    cycleRevolutions: 1,
    firingPhases: [0],
  }),
});
