import { TIRE_SOUND_INPUT_KEYS, tireSoundParameters } from './tire-sound-transport.js';
import { follow } from './audio-parameter.js';
import { sameControlSettings, type ControlSettings } from './audio-control-policy.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import { sameUnifiedSettings, type UnifiedSettings } from './tire-unified-acoustics.js';
import { sameRollingSettings, type RollingSettings } from './tire-rolling-acoustics.js';
import { TIRE_COMPONENTS, type TireComponents } from './tire-sound-components.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';
import type { TireSurfaceSounds } from './surface-sounds.js';
import type { ProcessingReport } from './processing-meter.js';
import { watchProcessor } from './processor-failure.js';

/**
 * One reusable worklet. Only tire sound settings fade/replace generators; engines, context and driving continue.
 * Surface numbers are positions in `materialIds`; the worklet receives the records at the same numbers. Settings and
 * surfaces are admitted ones, used as given.
 */
export function createTireVoice(
  context: BaseAudioContext,
  destination: AudioNode,
  { materialIds, surfaces }: TireSurfaceSounds,
) {
  const node = new AudioWorkletNode(context, 'vehicle-tires', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { surfaces },
  });
  const output = context.createGain();
  output.gain.value = 0;
  node.connect(output).connect(destination);
  let desiredSettings = DEFAULT_AUDIO_SETTINGS.unified;
  let rolling = DEFAULT_AUDIO_SETTINGS.rolling;
  let control = DEFAULT_AUDIO_SETTINGS.control;
  type Entry = { settings: UnifiedSettings; rolling: RollingSettings; control: ControlSettings };
  let active: Entry | null = null;
  let pending: (Entry & { at: number }) | null = null;
  const same = (entry: Entry | null): boolean =>
    entry !== null &&
    sameUnifiedSettings(desiredSettings, entry.settings) &&
    sameRollingSettings(rolling, entry.rolling) &&
    sameControlSettings(entry.control, control);
  let disposed = false;
  const requireProcessor = watchProcessor(node, 'tire sound');
  return {
    setSettings(value: UnifiedSettings): void {
      desiredSettings = value;
    },
    setRollingSettings(value: RollingSettings): void {
      rolling = value;
    },
    setControl(value: ControlSettings): void {
      if (!sameControlSettings(control, value)) control = value;
    },
    setComponents(value: TireComponents): void {
      if (disposed) return;
      for (const key of TIRE_COMPONENTS)
        if (typeof value[key] !== 'boolean') throw new RangeError('invalid tire component state');
      for (const key of TIRE_COMPONENTS) node.parameters.get(`mix_${key}`)!.value = value[key] ? 1 : 0;
    },
    update(state: VehicleAudioObservation): void {
      if (disposed) return;
      requireProcessor();
      const now = context.currentTime;
      for (const axle of ['front', 'rear'] as const) {
        const controls = tireSoundParameters(state[axle], materialIds);
        for (const key of TIRE_SOUND_INPUT_KEYS) node.parameters.get(`${axle}_tire_${key}`)!.value = controls[key];
        node.parameters.get(`${axle}_tire_surfaceIndex`)!.value = controls.surfaceIndex;
      }
      const changed = !same(active);
      if (active !== null && changed) {
        if (!same(pending)) {
          pending = { settings: desiredSettings, rolling, control, at: now + control.transitionSeconds };
          follow(output.gain, 0, now, control.fadeSeconds); // Authored settings-change fade, not vibration decay.
        }
        if (now < pending!.at) return;
      }
      if (changed) {
        node.port.postMessage({ settings: desiredSettings, rolling, control, surfaces });
        active = { settings: desiredSettings, rolling, control };
        follow(output.gain, 1, now, control.gainSeconds);
      } else if (pending) follow(output.gain, 1, now, control.gainSeconds);
      pending = null;
    },
    /** Rest the worklet from context time `at` (its kernels stop and it renders silence), or wake it with null. */
    rest(at: number | null): void {
      if (disposed) return;
      node.port.postMessage({ restAt: at });
    },
    /** DEV: report the worklet's processing to `listener`, or stop with null. */
    measureProcessing(listener: ((report: ProcessingReport) => void) | null): void {
      if (disposed) return;
      node.port.onmessage = listener && (({ data }) => listener(data as ProcessingReport));
      node.port.postMessage({ measure: listener !== null });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try {
        node.port.postMessage('stop');
      } finally {
        node.port.close();
        node.disconnect();
        output.disconnect();
      }
    },
  };
}
