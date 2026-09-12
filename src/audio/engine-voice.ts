import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import { createPeriodicEngineVoice } from './periodic-engine-voice.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** Module registration is shared with noise-processor. No vehicle IDs enter this layer. */
export function createEngineVoice(
  context: BaseAudioContext,
  destination: AudioNode,
  coupled = true,
  initialProfile?: VehicleAudioProfile,
) {
  const output = context.createGain();
  output.gain.value = 0;
  output.connect(destination);
  const periodic = createPeriodicEngineVoice(context, output);
  const exhaust = new AudioWorkletNode(context, 'exhaust-waveguide', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: initialProfile?.exhaust ? { profile: initialProfile, coupled } : undefined,
  });
  const level = context.createGain();
  level.gain.value = 0;
  exhaust.connect(level).connect(output);
  let active: VehicleAudioProfile | null = initialProfile ?? null;
  let pending: VehicleAudioProfile | null = null;
  let switchAt = 0;
  return {
    update(state: VehicleAudioObservation, profile: VehicleAudioProfile, gain = 1): void {
      const now = context.currentTime;
      if (active !== null && active !== profile) {
        if (pending !== profile) {
          pending = profile;
          switchAt = now + 0.09;
          follow(output.gain, 0, now, 0.01);
        }
        if (now < switchAt) return;
      } else pending = null;
      if (active !== profile) {
        exhaust.port.postMessage(profile.exhaust ? { profile, coupled } : null);
        active = profile;
      }
      if (profile.exhaust) {
        periodic.silence();
        follow(exhaust.parameters.get('rpm')!, clamp(state.rpm, state.idleRpm, state.redlineRpm), now);
        follow(exhaust.parameters.get('load')!, clamp(0.7 * state.throttle + 0.3 * state.drive, 0, 1), now);
        follow(level.gain, profile.gain / 0.32, now);
      } else {
        follow(level.gain, 0, now);
        periodic.update(state, profile);
      }
      follow(output.gain, clamp(gain, 0, 1), now);
    },
    silence(): void {
      follow(output.gain, 0, context.currentTime, 0.015);
    },
    dispose(): void {
      periodic.dispose();
      exhaust.port.postMessage('stop');
      exhaust.port.close();
      exhaust.disconnect();
      level.disconnect();
      output.disconnect();
    },
  };
}
