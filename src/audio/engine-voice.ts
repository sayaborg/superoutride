import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import type { DEFAULT_REFLECTION_TUNING } from './exhaust-acoustics.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** Module registration is shared with noise-processor. No vehicle IDs enter this layer. */
export function createEngineVoice(
  context: BaseAudioContext,
  destination: AudioNode,
  {
    coupled = true,
    profile: initialProfile,
    tuning = {},
  }: {
    coupled?: boolean;
    profile?: VehicleAudioProfile;
    tuning?: Partial<typeof DEFAULT_REFLECTION_TUNING>;
  } = {},
) {
  const acousticTuning = { ...tuning };
  const output = context.createGain();
  output.gain.value = 0;
  output.connect(destination);
  const exhaust = new AudioWorkletNode(context, 'exhaust-waveguide', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: initialProfile ? { profile: initialProfile, coupled, tuning: acousticTuning } : undefined,
  });
  exhaust.connect(output);
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
        exhaust.port.postMessage({ profile, coupled, tuning: acousticTuning });
        active = profile;
      }
      follow(exhaust.parameters.get('rpm')!, clamp(state.rpm, state.idleRpm, state.redlineRpm), now);
      follow(exhaust.parameters.get('load')!, clamp(state.drive, 0, 1), now);
      follow(output.gain, clamp(gain, 0, 1), now);
    },
    silence(): void {
      follow(output.gain, 0, context.currentTime, 0.015);
    },
    dispose(): void {
      exhaust.port.postMessage('stop');
      exhaust.port.close();
      exhaust.disconnect();
      output.disconnect();
    },
  };
}
