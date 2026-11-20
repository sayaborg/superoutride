import { clamp } from '../core/math.js';
import { fadeToSilence, follow } from './audio-parameter.js';
import { sameControlSettings, type ControlSettings } from './audio-control-policy.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import type { ExhaustConfiguration } from './exhaust-processor.js';
import type { ExhaustRateDivisor } from './exhaust-rate.js';
import type { VehicleEngineSound } from './vehicle-engine-sound.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';
import type { ProcessingReport } from './processing-meter.js';
import { watchProcessor } from './processor-failure.js';

/**
 * A locked downshift's rev-matching blip, the owner's values (no derivation; chosen by listening): an opening peak and
 * its exponential decay time, combined with the effective opening by `max`. The physical shift is instantaneous.
 */
export const DOWNSHIFT_BLIP = Object.freeze({ opening: 1, decaySeconds: 0.25 });

/**
 * One reusable exhaust worklet. A change of engine sound, kernel divisor, gain or kernel control installs a new kernel
 * after the same fade. Settings are admitted ones, used as given; `gain` is the engine's for its divisor
 * (`engineGain`).
 */
export function createEngineVoice(
  context: BaseAudioContext,
  destination: AudioNode,
  { control: initialControl = DEFAULT_AUDIO_SETTINGS.control }: { control?: ControlSettings } = {},
) {
  let control = initialControl;
  const output = context.createGain();
  output.gain.value = 0;
  output.connect(destination);
  const exhaust = new AudioWorkletNode(context, 'exhaust-waveguide', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  exhaust.connect(output);
  const requireProcessor = watchProcessor(exhaust, 'engine sound');
  let active: ExhaustConfiguration | null = null;
  let pending: (ExhaustConfiguration & { at: number }) | null = null;
  const same = (entry: ExhaustConfiguration | null, sound: VehicleEngineSound, divisor: number, gain: number) =>
    entry?.sound === sound &&
    entry.divisor === divisor &&
    entry.gain === gain &&
    sameControlSettings(entry.control, control);
  // The last shift and afterfire sequences heard; null until the first update after construction or silence.
  let heardShift: number | null = null;
  let heardAfterfire: number | null = null;
  return {
    update(
      state: VehicleAudioObservation,
      sound: VehicleEngineSound,
      divisor: ExhaustRateDivisor,
      gain: number,
      distanceGain = 1,
    ): void {
      requireProcessor();
      const now = context.currentTime;
      const changed = !same(active, sound, divisor, gain);
      if (active && changed) {
        if (!same(pending, sound, divisor, gain)) {
          pending = { sound, divisor, gain, control, at: fadeToSilence(output.gain, now, control.fadeSeconds) };
        }
        if (pending && now < pending.at) return;
      }
      pending = null;
      if (changed) {
        active = { sound, divisor, gain, control };
        exhaust.port.postMessage(active);
      }
      const { shift, afterfire } = state;
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
      // Each afterfire not yet heard sends the kernel one.
      if (heardAfterfire !== null)
        for (let sequence = heardAfterfire; sequence < afterfire; sequence++) exhaust.port.postMessage('afterfire');
      heardAfterfire = afterfire;
      // The kernel is the only smoothing authority for its observations.
      exhaust.parameters.get('rpm')!.value = state.rpm;
      exhaust.parameters.get('load')!.value = clamp(state.effectiveOpening, 0, 1);
      exhaust.parameters.get('fuelCut')!.value = state.fuelCut ? 1 : 0;
      follow(output.gain, clamp(distanceGain, 0, 1), now, control.gainSeconds);
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
      // A newly assigned competitor's earlier shifts and afterfires must not sound.
      heardShift = null;
      heardAfterfire = null;
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
