import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import { AUDIO_CONTROL_POLICY } from './audio-control-policy.js';
import { DOWNSHIFT_BLIP, EXHAUST_SETTING_RANGES, resolveExhaustSettings } from './exhaust-acoustics.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import type { CompiledEngineSound } from './engine-sound.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

function sameExhaustSettings(left: ExhaustSettings | undefined, right: ExhaustSettings): boolean {
  if (!left) return false;
  for (const key in EXHAUST_SETTING_RANGES) {
    const name = key as keyof ExhaustSettings;
    if (left[name] !== right[name]) return false;
  }
  return true;
}

/** One reusable exhaust worklet. Engine sound and exhaust settings changes share the same fade. */
export function createEngineVoice(
  context: BaseAudioContext,
  destination: AudioNode,
  {
    sound: initialSound,
    settings: initialSettings = {},
  }: {
    sound?: CompiledEngineSound;
    settings?: Partial<ExhaustSettings>;
  } = {},
) {
  let settings = resolveExhaustSettings(initialSettings);
  const output = context.createGain();
  output.gain.value = 0;
  output.connect(destination);
  const exhaust = new AudioWorkletNode(context, 'exhaust-waveguide', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: initialSound ? { sound: initialSound, settings } : undefined,
  });
  exhaust.connect(output);
  let active = initialSound ? { sound: initialSound, settings } : null;
  let pending: {
    sound: CompiledEngineSound;
    settings: ExhaustSettings;
    at: number;
  } | null = null;
  // The last shift sequence heard; null until the first update after construction or silence.
  let heardShift: number | null = null;
  return {
    update(state: VehicleAudioObservation, sound: CompiledEngineSound, gain = 1): void {
      const now = context.currentTime;
      const changed = active?.sound !== sound || !sameExhaustSettings(active?.settings, settings);
      if (active && changed) {
        if (pending?.sound !== sound || !sameExhaustSettings(pending?.settings, settings)) {
          pending = { sound, settings, at: now + AUDIO_CONTROL_POLICY.transitionSeconds };
          follow(output.gain, 0, now, AUDIO_CONTROL_POLICY.fadeSeconds);
        }
        if (pending && now < pending.at) return;
      }
      pending = null;
      if (changed) {
        exhaust.port.postMessage({ sound, settings });
        active = { sound, settings };
      }
      const { shift } = state;
      if (
        heardShift !== null &&
        shift.sequence !== heardShift &&
        shift.direction === 'DOWN' &&
        shift.toRpm > shift.fromRpm
      ) {
        const blip = exhaust.parameters.get('blip')!;
        blip.cancelScheduledValues(now);
        blip.setValueAtTime(DOWNSHIFT_BLIP.opening, now);
        blip.setTargetAtTime(0, now, DOWNSHIFT_BLIP.decaySeconds);
      }
      heardShift = shift.sequence;
      // The kernel is the only smoothing authority for its observations.
      exhaust.parameters.get('rpm')!.value = state.rpm;
      exhaust.parameters.get('load')!.value = clamp(state.effectiveOpening, 0, 1);
      exhaust.parameters.get('fuelCut')!.value = state.fuelCut ? 1 : 0;
      follow(output.gain, clamp(gain, 0, 1), now, AUDIO_CONTROL_POLICY.gainSeconds);
    },
    setSettings(value: ExhaustSettings): void {
      if (!sameExhaustSettings(settings, value)) settings = resolveExhaustSettings(value);
    },
    silence(): void {
      // A newly assigned competitor's earlier shifts must not sound.
      heardShift = null;
      follow(output.gain, 0, context.currentTime, AUDIO_CONTROL_POLICY.fadeSeconds);
    },
    dispose(): void {
      exhaust.port.postMessage('stop');
      exhaust.port.close();
      exhaust.disconnect();
      output.disconnect();
    },
  };
}
