import { compileVehicleAudioProfile } from '../audio/vehicle-audio-profile.js';

const even = (count: number) => Array.from({ length: count }, (_, index) => index / count);
/** Acoustic sketches, not certified recordings or manufacturer exhaust models. */
export const VEHICLE_SOUND_PROFILES = Object.freeze({
  TESTAROSSA: compileVehicleAudioProfile({
    cycleRevolutions: 2,
    firingPhases: even(12),
    pulseWidth: 0.014,
    resonanceHz: 720,
    resonanceQ: 1.1,
    gain: 0.32,
  }),
  '911_TURBO_3_3': compileVehicleAudioProfile({
    cycleRevolutions: 2,
    firingPhases: even(6),
    pulseWidth: 0.025,
    resonanceHz: 430,
    resonanceQ: 1.4,
    gain: 0.3,
  }),
  CORVETTE_C4: compileVehicleAudioProfile({
    cycleRevolutions: 2,
    firingPhases: even(8),
    pulseWidth: 0.024,
    resonanceHz: 260,
    resonanceQ: 1.7,
    gain: 0.34,
  }),
  GOLF_GTI_16V: compileVehicleAudioProfile({
    cycleRevolutions: 2,
    firingPhases: even(4),
    pulseWidth: 0.035,
    resonanceHz: 680,
    resonanceQ: 1.0,
    gain: 0.28,
  }),
  DELTA_HF_INTEGRALE: compileVehicleAudioProfile({
    cycleRevolutions: 2,
    firingPhases: even(4),
    pulseWidth: 0.045,
    resonanceHz: 420,
    resonanceQ: 1.3,
    gain: 0.3,
  }),
  VFR750R: compileVehicleAudioProfile({
    cycleRevolutions: 2,
    firingPhases: [0, 0.125, 0.5, 0.625],
    pulseWidth: 0.022,
    resonanceHz: 950,
    resonanceQ: 1.0,
    gain: 0.28,
  }),
  R80_GS_PARIS_DAKAR: compileVehicleAudioProfile({
    cycleRevolutions: 2,
    firingPhases: even(2),
    pulseWidth: 0.06,
    resonanceHz: 350,
    resonanceQ: 1.2,
    gain: 0.32,
  }),
  FXRT_SPORT_GLIDE: compileVehicleAudioProfile({
    cycleRevolutions: 2,
    firingPhases: [0, 0.4375],
    pulseWidth: 0.055,
    resonanceHz: 220,
    resonanceQ: 1.5,
    gain: 0.34,
  }),
  PX200E_ARCOBALENO: compileVehicleAudioProfile({
    cycleRevolutions: 1,
    firingPhases: [0],
    pulseWidth: 0.055,
    resonanceHz: 1150,
    resonanceQ: 1.4,
    gain: 0.26,
  }),
});
