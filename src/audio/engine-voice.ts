import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import { AUDIO_TIMING } from './audio-presentation.js';
import { EXHAUST_TUNING_RANGES, resolveExhaustTuning } from './exhaust-acoustics.js';
import type { ExhaustTuning } from './exhaust-acoustics.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

function sameTuning(left: ExhaustTuning | undefined, right: ExhaustTuning): boolean {
  if (!left) return false;
  for (const key in EXHAUST_TUNING_RANGES) {
    const name = key as keyof ExhaustTuning;
    if (left[name] !== right[name]) return false;
  }
  return true;
}

/** One reusable exhaust worklet. Profile and tuning changes share the same fade. */
export function createEngineVoice(
  context: BaseAudioContext,
  destination: AudioNode,
  {
    profile: initialProfile,
    tuning = {},
  }: {
    profile?: VehicleAudioProfile;
    tuning?: Partial<ExhaustTuning>;
  } = {},
) {
  let acousticTuning = resolveExhaustTuning(tuning);
  const output = context.createGain();
  output.gain.value = 0;
  output.connect(destination);
  const exhaust = new AudioWorkletNode(context, 'exhaust-waveguide', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: initialProfile ? { profile: initialProfile, tuning: acousticTuning } : undefined,
  });
  exhaust.connect(output);
  let active = initialProfile ? { profile: initialProfile, tuning: acousticTuning } : null;
  let pending: {
    profile: VehicleAudioProfile;
    tuning: ExhaustTuning;
    at: number;
  } | null = null;
  return {
    update(state: VehicleAudioObservation, profile: VehicleAudioProfile, gain = 1): void {
      const now = context.currentTime;
      const changed = active?.profile !== profile || !sameTuning(active?.tuning, acousticTuning);
      if (active && changed) {
        if (pending?.profile !== profile || !sameTuning(pending?.tuning, acousticTuning)) {
          pending = { profile, tuning: acousticTuning, at: now + AUDIO_TIMING.transitionSeconds };
          follow(output.gain, 0, now, 0.01);
        }
        if (pending && now < pending.at) return;
      }
      pending = null;
      if (changed) {
        exhaust.port.postMessage({ profile, tuning: acousticTuning });
        active = { profile, tuning: acousticTuning };
      }
      follow(exhaust.parameters.get('rpm')!, state.rpm, now);
      follow(exhaust.parameters.get('load')!, clamp(state.drive, 0, 1), now);
      follow(output.gain, clamp(gain, 0, 1), now);
    },
    setTuning(value: ExhaustTuning): void {
      if (!sameTuning(acousticTuning, value)) acousticTuning = resolveExhaustTuning(value);
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
