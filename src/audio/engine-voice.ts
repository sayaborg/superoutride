import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import { combustionCoefficients } from './combustion-pulse.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

export function engineParameters(state: VehicleAudioObservation, profile: VehicleAudioProfile) {
  const rpm = clamp(state.rpm, state.idleRpm, state.redlineRpm);
  const effort = clamp(0.7 * state.throttle + 0.3 * state.drive, 0, 1);
  return {
    frequency: rpm / (60 * profile.cycleRevolutions),
    cutoff: 450 + 3600 * effort + (1800 * rpm) / state.redlineRpm,
    gain: profile.gain * (0.3 + 0.7 * effort),
  };
}

export function createEngineVoice(context: BaseAudioContext, destination: AudioNode) {
  const oscillator = context.createOscillator();
  const resonance = context.createBiquadFilter();
  resonance.type = 'peaking';
  resonance.gain.value = 5;
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.5;
  const level = context.createGain();
  level.gain.value = 0;
  oscillator.connect(resonance).connect(tone).connect(level).connect(destination);
  const waves = new Map<VehicleAudioProfile, PeriodicWave>();
  let active: VehicleAudioProfile | null = null;
  let pending: VehicleAudioProfile | null = null;
  let switchAt = 0;
  oscillator.start();
  return {
    update(state: VehicleAudioObservation, profile: VehicleAudioProfile, gain = 1): void {
      const now = context.currentTime;
      if (active !== null && active !== profile) {
        if (pending !== profile) {
          pending = profile;
          switchAt = now + 0.09;
          follow(level.gain, 0, now, 0.01);
        }
        if (now < switchAt) return;
      } else pending = null;
      if (active !== profile) {
        let wave = waves.get(profile);
        if (!wave) {
          const { real, imag } = combustionCoefficients(profile);
          wave = context.createPeriodicWave(real, imag, { disableNormalization: true });
          waves.set(profile, wave);
        }
        oscillator.setPeriodicWave(wave);
        follow(resonance.frequency, profile.resonanceHz, now);
        follow(resonance.Q, profile.resonanceQ, now);
        active = profile;
      }
      const values = engineParameters(state, profile);
      follow(oscillator.frequency, values.frequency, now);
      follow(tone.frequency, Math.min(values.cutoff, context.sampleRate * 0.45), now);
      follow(level.gain, values.gain * clamp(gain, 0, 1), now);
    },
    silence(): void {
      follow(level.gain, 0, context.currentTime, 0.015);
    },
    dispose(): void {
      oscillator.stop();
      for (const node of [oscillator, resonance, tone, level]) node.disconnect();
      waves.clear();
    },
  };
}
