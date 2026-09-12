import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import { DEFAULT_EXHAUST_TUNING } from './exhaust-acoustics.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** One reusable exhaust worklet. Vehicle/profile and comparison changes share the same fade. */
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
    tuning?: Partial<typeof DEFAULT_EXHAUST_TUNING>;
  } = {},
) {
  let acousticTuning = { ...DEFAULT_EXHAUST_TUNING, ...tuning };
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
  let active = initialProfile ? { profile: initialProfile, coupled, tuning: acousticTuning } : null;
  let pending: { profile: VehicleAudioProfile; coupled: boolean; tuning: typeof acousticTuning; at: number } | null =
    null;
  return {
    update(state: VehicleAudioObservation, profile: VehicleAudioProfile, gain = 1): void {
      const now = context.currentTime;
      const changed = active?.profile !== profile || active?.coupled !== coupled || active?.tuning !== acousticTuning;
      if (active && changed) {
        if (pending?.profile !== profile || pending.coupled !== coupled || pending.tuning !== acousticTuning) {
          pending = { profile, coupled, tuning: acousticTuning, at: now + 0.09 };
          follow(output.gain, 0, now, 0.01);
        }
        if (now < pending.at) return;
      }
      pending = null;
      if (changed) {
        exhaust.port.postMessage({ profile, coupled, tuning: acousticTuning });
        active = { profile, coupled, tuning: acousticTuning };
      }
      follow(exhaust.parameters.get('rpm')!, clamp(state.rpm, state.idleRpm, state.redlineRpm), now);
      follow(exhaust.parameters.get('load')!, clamp(state.drive, 0, 1), now);
      follow(output.gain, clamp(gain, 0, 1), now);
    },
    /** Temporary comparison choice; applied through the next ordinary update, including after suspension. */
    setCoupled(value: boolean): void {
      coupled = value;
    },
    setTuning(value: typeof DEFAULT_EXHAUST_TUNING): void {
      const same = (candidate: typeof acousticTuning) =>
        (Object.keys(DEFAULT_EXHAUST_TUNING) as (keyof typeof value)[]).every((key) => candidate[key] === value[key]);
      if (same(acousticTuning)) return;
      acousticTuning = active && same(active.tuning) ? active.tuning : { ...value };
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
