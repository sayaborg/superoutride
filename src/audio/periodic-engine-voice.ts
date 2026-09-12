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
    cutoff: 900 + 5200 * effort + (2200 * rpm) / state.redlineRpm,
    gain: profile.gain * (0.45 + 0.55 * effort),
    body: 0.6 + 0.4 * effort,
    crack: profile.crackGain * (0.025 + 0.975 * effort * effort),
    drive: 1 + (profile.saturation - 1) * effort,
  };
}

// One shared transfer table, not an audio sample. Oversampling limits saturation aliasing.
const saturationCurve = Float32Array.from({ length: 2049 }, (_, i) => Math.tanh(3 * (i / 1024 - 1)));

export function createPeriodicEngineVoice(context: BaseAudioContext, destination: AudioNode) {
  const body = context.createOscillator();
  const crack = context.createOscillator();
  const bodyResonance = context.createBiquadFilter();
  bodyResonance.type = 'peaking';
  bodyResonance.gain.value = 7;
  const crackResonance = context.createBiquadFilter();
  crackResonance.type = 'bandpass';
  crackResonance.Q.value = 0.8;
  const bodyLevel = context.createGain();
  const crackLevel = context.createGain();
  const drive = context.createGain();
  const saturation = context.createWaveShaper();
  saturation.curve = saturationCurve;
  saturation.oversample = '2x';
  const dc = context.createBiquadFilter();
  dc.type = 'highpass';
  dc.frequency.value = 25;
  dc.Q.value = 0.5;
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.5;
  const level = context.createGain();
  level.gain.value = 0;
  body.connect(bodyResonance).connect(bodyLevel).connect(drive);
  crack.connect(crackResonance).connect(crackLevel).connect(drive);
  drive.connect(saturation).connect(dc).connect(tone).connect(level).connect(destination);
  const waves = new Map<VehicleAudioProfile, readonly [PeriodicWave, PeriodicWave]>();
  let active: VehicleAudioProfile | null = null;
  let pending: VehicleAudioProfile | null = null;
  let switchAt = 0;
  // Both pulse components must share phase, including after suspend and profile changes.
  const startAt = context.currentTime;
  body.start(startAt);
  crack.start(startAt);
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
        let pair = waves.get(profile);
        if (!pair) {
          const makeWave = (width: number) => {
            const { real, imag } = combustionCoefficients(profile, width);
            return context.createPeriodicWave(real, imag, { disableNormalization: true });
          };
          pair = [makeWave(profile.pulseWidth), makeWave(profile.pulseWidth * 0.12)];
          waves.set(profile, pair);
        }
        body.setPeriodicWave(pair[0]);
        crack.setPeriodicWave(pair[1]);
        follow(bodyResonance.frequency, profile.resonanceHz, now);
        follow(bodyResonance.Q, profile.resonanceQ, now);
        follow(crackResonance.frequency, profile.crackHz, now);
        active = profile;
      }
      const values = engineParameters(state, profile);
      follow(body.frequency, values.frequency, now);
      follow(crack.frequency, values.frequency, now);
      follow(bodyLevel.gain, values.body, now);
      follow(crackLevel.gain, values.crack, now);
      follow(drive.gain, values.drive, now);
      follow(tone.frequency, Math.min(values.cutoff, context.sampleRate * 0.45), now);
      follow(level.gain, values.gain * clamp(gain, 0, 1), now);
    },
    silence(): void {
      follow(level.gain, 0, context.currentTime, 0.015);
    },
    dispose(): void {
      body.stop();
      crack.stop();
      for (const node of [
        body,
        crack,
        bodyResonance,
        crackResonance,
        bodyLevel,
        crackLevel,
        drive,
        saturation,
        dc,
        tone,
        level,
      ])
        node.disconnect();
      waves.clear();
    },
  };
}
