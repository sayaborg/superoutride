import { TIRE_SOUND_INPUT_KEYS } from './tire-sound-observation.js';
import { follow } from './audio-parameter.js';
import { AUDIO_CONTROL_POLICY } from './audio-control-policy.js';
import { resolveUnifiedSettings, sameUnifiedSettings, type UnifiedSettings } from './tire-unified-acoustics.js';
import { tireSoundParameters, TIRE_COMPONENTS, type TireComponents } from './tire-sound-controls.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** One reusable worklet. Only tire sound settings fade/replace generators; engines, context and driving continue. */
export function createTireVoice(context: BaseAudioContext, destination: AudioNode) {
  const node = new AudioWorkletNode(context, 'vehicle-tires', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const output = context.createGain();
  output.gain.value = 0;
  node.connect(output).connect(destination);
  let desiredSettings = resolveUnifiedSettings();
  let activeSettings: UnifiedSettings | null = null;
  let pending: { settings: UnifiedSettings; at: number } | null = null;
  let failed = false,
    disposed = false;
  node.onprocessorerror = () => {
    failed = true;
  };
  return {
    setSettings(value: UnifiedSettings): void {
      desiredSettings = resolveUnifiedSettings(value);
    },
    setComponents(value: TireComponents): void {
      if (disposed) return;
      for (const { key } of TIRE_COMPONENTS)
        if (typeof value[key] !== 'boolean') throw new RangeError('invalid tire component state');
      for (const { key } of TIRE_COMPONENTS) node.parameters.get(`mix_${key}`)!.value = value[key] ? 1 : 0;
    },
    update(state: VehicleAudioObservation): void {
      if (disposed) return;
      if (failed) throw new Error('tire sound processor failed');
      const now = context.currentTime;
      for (const axle of ['front', 'rear'] as const) {
        const controls = tireSoundParameters(state[axle]);
        for (const key of TIRE_SOUND_INPUT_KEYS) node.parameters.get(`${axle}_tire_${key}`)!.value = controls[key];
        node.parameters.get(`${axle}_tire_surfaceIndex`)!.value = controls.surfaceIndex;
      }
      const changed = activeSettings === null || !sameUnifiedSettings(desiredSettings, activeSettings);
      if (activeSettings !== null && changed) {
        if (pending === null || !sameUnifiedSettings(pending.settings, desiredSettings)) {
          pending = { settings: desiredSettings, at: now + AUDIO_CONTROL_POLICY.transitionSeconds };
          follow(output.gain, 0, now, 0.01); // Authored settings-change fade, not vibration decay.
        }
        if (now < pending.at) return;
      }
      if (changed) {
        node.port.postMessage({ settings: desiredSettings });
        activeSettings = desiredSettings;
        follow(output.gain, 1, now);
      } else if (pending) follow(output.gain, 1, now);
      pending = null;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      node.onprocessorerror = null;
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
