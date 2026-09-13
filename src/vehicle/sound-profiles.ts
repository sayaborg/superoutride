import { compileVehicleAudioProfile } from '../audio/vehicle-audio-profile.js';

const even = (count: number) => Array.from({ length: count }, (_, index) => index / count);
/** Acoustic sketches, not certified recordings or manufacturer exhaust models. */
export const VEHICLE_SOUND_PROFILES = Object.freeze({
  TESTAROSSA: compileVehicleAudioProfile({
    exhaust: {
      banks: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      lengths: [0.5, 0.54, 0.46, 0.5, 0.58, 0.62, 0.54, 0.58, 0.42, 0.46, 0.62, 0.66],
      outlet: 0.85,
    },
    cycleRevolutions: 2,
    firingPhases: even(12),
    pulse: { strength: 1.0, riseSeconds: 0.00012, decaySeconds: 0.0035 },
  }),
  '911_TURBO_3_3': compileVehicleAudioProfile({
    // Order 1-6-2-4-3-5 alternates banks: each collector receives a pulse every 240 degrees.
    // Independent outlets approximate the banks; the downstream turbo/merge is not modeled.
    exhaust: { banks: [0, 1, 0, 1, 0, 1], lengths: [0.62, 0.78, 0.46, 0.58, 0.54, 0.68], outlet: 0.95 },
    cycleRevolutions: 2,
    firingPhases: even(6),
    pulse: { strength: 0.9375, riseSeconds: 0.00024, decaySeconds: 0.005 },
  }),
  CORVETTE_C4: compileVehicleAudioProfile({
    // Firing order 1-8-4-3-6-5-7-2; odd/even cylinders use separate banks.
    exhaust: { banks: [0, 1, 1, 0, 1, 0, 0, 1], lengths: [0.62, 0.8, 0.54, 0.7, 0.72, 0.52, 0.84, 0.6], outlet: 1.65 },
    cycleRevolutions: 2,
    firingPhases: even(8),
    pulse: { strength: 1.0625, riseSeconds: 0.00022, decaySeconds: 0.009 },
  }),
  GOLF_GTI_16V: compileVehicleAudioProfile({
    exhaust: { banks: [0, 0, 0, 0], lengths: [0.55, 0.42, 0.48, 0.6], outlet: 1.25 },
    cycleRevolutions: 2,
    firingPhases: even(4),
    pulse: { strength: 0.875, riseSeconds: 0.00014, decaySeconds: 0.004 },
  }),
  DELTA_HF_INTEGRALE: compileVehicleAudioProfile({
    exhaust: { banks: [0, 0, 0, 0], lengths: [0.3, 0.24, 0.27, 0.34], outlet: 1.65 },
    cycleRevolutions: 2,
    firingPhases: even(4),
    pulse: { strength: 0.9375, riseSeconds: 0.00022, decaySeconds: 0.0055 },
  }),
  VFR750R: compileVehicleAudioProfile({
    // Collector grouping and lengths are listening sketches, not a factory header reconstruction.
    exhaust: { banks: [0, 1, 0, 1], lengths: [0.7, 0.92, 0.76, 0.86], outlet: 0.55 },
    cycleRevolutions: 2,
    firingPhases: [0, 0.125, 0.5, 0.625],
    pulse: { strength: 0.875, riseSeconds: 0.0001, decaySeconds: 0.003 },
  }),
  R80_GS_PARIS_DAKAR: compileVehicleAudioProfile({
    exhaust: { banks: [0, 1], lengths: [0.82, 0.9], outlet: 0.85 },
    cycleRevolutions: 2,
    firingPhases: even(2),
    pulse: { strength: 1.0, riseSeconds: 0.00028, decaySeconds: 0.008 },
  }),
  FXRT_SPORT_GLIDE: compileVehicleAudioProfile({
    exhaust: { banks: [0, 1], lengths: [0.72, 1.04], outlet: 0.65 },
    cycleRevolutions: 2,
    firingPhases: [0, 0.4375],
    pulse: { strength: 1.0625, riseSeconds: 0.00032, decaySeconds: 0.012 },
  }),
  PX200E_ARCOBALENO: compileVehicleAudioProfile({
    exhaust: { banks: [0], lengths: [0.28], outlet: 0.48 },
    cycleRevolutions: 1,
    firingPhases: [0],
    pulse: { strength: 0.8125, riseSeconds: 0.0001, decaySeconds: 0.0025 },
  }),
});
