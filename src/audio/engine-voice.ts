import { clamp } from '../core/math.js';
import { fadeToSilence, follow } from './audio-parameter.js';
import { sameControlSettings, type ControlSettings } from './audio-control-policy.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import { EXHAUST_SETTING_RANGES } from './exhaust-acoustics.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import type { VehicleEngineSound } from './vehicle-engine-sound.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';
import type { ProcessingReport } from './processing-meter.js';
import { watchProcessor } from './processor-failure.js';

function sameExhaustSettings(left: ExhaustSettings | undefined, right: ExhaustSettings): boolean {
  if (!left) return false;
  for (const key in EXHAUST_SETTING_RANGES) {
    const name = key as keyof ExhaustSettings;
    if (left[name] !== right[name]) return false;
  }
  return true;
}

/**
 * One reusable exhaust worklet. Engine sound, drive, exhaust settings and kernel control changes share the same fade.
 * Settings are admitted ones, used as given; `drive` is the gain into the soft clip (`engineDriveGain`).
 */
export function createEngineVoice(
  context: BaseAudioContext,
  destination: AudioNode,
  {
    sound: initialSound,
    settings: initialSettings = DEFAULT_AUDIO_SETTINGS.exhaust,
    control: initialControl = DEFAULT_AUDIO_SETTINGS.control,
  }: {
    sound?: VehicleEngineSound;
    settings?: ExhaustSettings;
    control?: ControlSettings;
  } = {},
) {
  let settings = initialSettings;
  let control = initialControl;
  const output = context.createGain();
  output.gain.value = 0;
  output.connect(destination);
  const exhaust = new AudioWorkletNode(context, 'exhaust-waveguide', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: initialSound ? { sound: initialSound, settings, control, drive: 1 } : undefined,
  });
  exhaust.connect(output);
  const requireProcessor = watchProcessor(exhaust, 'engine sound');
  type Installed = { sound: VehicleEngineSound; drive: number; settings: ExhaustSettings; control: ControlSettings };
  let active: Installed | null = initialSound ? { sound: initialSound, drive: 1, settings, control } : null;
  let pending: (Installed & { at: number }) | null = null;
  const same = (entry: Installed | null, sound: VehicleEngineSound, drive: number): boolean =>
    entry?.sound === sound &&
    entry.drive === drive &&
    sameExhaustSettings(entry.settings, settings) &&
    sameControlSettings(entry.control, control);
  // The last shift sequence heard; null until the first update after construction or silence.
  let heardShift: number | null = null;
  return {
    update(state: VehicleAudioObservation, sound: VehicleEngineSound, drive: number, gain = 1): void {
      requireProcessor();
      const now = context.currentTime;
      const changed = !same(active, sound, drive);
      if (active && changed) {
        if (!same(pending, sound, drive)) {
          pending = { sound, drive, settings, control, at: fadeToSilence(output.gain, now, control.fadeSeconds) };
        }
        if (pending && now < pending.at) return;
      }
      pending = null;
      if (changed) {
        exhaust.port.postMessage({ sound, settings, control, drive });
        active = { sound, drive, settings, control };
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
        blip.setValueAtTime(settings.blipOpening, now);
        blip.setTargetAtTime(0, now, settings.blipDecaySeconds);
      }
      heardShift = shift.sequence;
      // The kernel is the only smoothing authority for its observations.
      exhaust.parameters.get('rpm')!.value = state.rpm;
      exhaust.parameters.get('load')!.value = clamp(state.effectiveOpening, 0, 1);
      exhaust.parameters.get('fuelCut')!.value = state.fuelCut ? 1 : 0;
      follow(output.gain, clamp(gain, 0, 1), now, control.gainSeconds);
    },
    setSettings(value: ExhaustSettings): void {
      if (!sameExhaustSettings(settings, value)) settings = value;
    },
    setControl(value: ControlSettings): void {
      if (!sameControlSettings(control, value)) control = value;
    },
    /** Rest the worklet from context time `at` (its kernels stop and it renders silence), or wake it with null. */
    rest(at: number | null): void {
      exhaust.port.postMessage({ restAt: at });
    },
    /** DEV: report the worklet's processing to `listener`, or stop with null. */
    measureProcessing(listener: ((report: ProcessingReport) => void) | null): void {
      exhaust.port.onmessage = listener && (({ data }) => listener(data as ProcessingReport));
      exhaust.port.postMessage({ measure: listener !== null });
    },
    silence(): void {
      // A newly assigned competitor's earlier shifts must not sound.
      heardShift = null;
      fadeToSilence(output.gain, context.currentTime, control.fadeSeconds);
    },
    dispose(): void {
      exhaust.port.postMessage('stop');
      exhaust.port.close();
      exhaust.disconnect();
      output.disconnect();
    },
  };
}
