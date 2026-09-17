import { TIRE_SOUND_INPUT_KEYS } from './tire-sound-observation.js';
import { tireParameters } from './tire-synthesis.js';
import { follow } from './audio-parameter.js';
import { AUDIO_TIMING } from './audio-presentation.js';
import { resolveTireTuning, sameTireTuning, type TireTuning } from './tire-tuning.js';
import {
  contactTireParameters,
  tireSoundParameters,
  DEFAULT_TIRE_SOUND_MODEL,
  TIRE_SOUND_MODELS,
  TIRE_SOUND_CONTROLS,
  TIRE_COMPONENTS,
  type TireComponents,
  type TireSoundModel,
} from './tire-sound-controls.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** One reusable worklet. Only tires fade/switch; engines, context and driving continue. */
export function createTireVoice(context: BaseAudioContext, destination: AudioNode) {
  const node = new AudioWorkletNode(context, 'vehicle-tires', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const output = context.createGain();
  output.gain.value = 0;
  node.connect(output).connect(destination);
  let desired: TireSoundModel = DEFAULT_TIRE_SOUND_MODEL;
  let active: TireSoundModel | null = null;
  const tunings = { modal: resolveTireTuning('modal'), unified: resolveTireTuning('unified') };
  let activeTuning: TireTuning | null = null;
  let pending: { model: TireSoundModel; tuning: TireTuning | null; at: number } | null = null;
  let failed = false,
    disposed = false;
  node.onprocessorerror = () => {
    failed = true;
  };
  return {
    setTuning(value: TireTuning): void {
      if (!sameTireTuning(tunings[value.model], value)) {
        const next = resolveTireTuning(value.model, value.tuning);
        if (!next) throw new RangeError('unknown tire tuning model');
        tunings[value.model] = next;
      }
    },
    setModel(model: TireSoundModel): void {
      if (!TIRE_SOUND_MODELS.includes(model)) throw new RangeError('unknown tire sound model');
      desired = model;
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
      const desiredInput = TIRE_SOUND_CONTROLS[desired].input,
        activeInput = active === null ? null : TIRE_SOUND_CONTROLS[active].input;
      // Controls keep tracking while fading. Only the active or immediately requested mapping is needed.
      for (const axle of ['front', 'rear'] as const) {
        if (desiredInput === 'hopf' || activeInput === 'hopf') {
          const controls = tireParameters(state[axle]);
          node.parameters.get(`${axle}_squeal`)!.value = controls.squeal;
          node.parameters.get(`${axle}_pitch`)!.value = controls.pitch;
        }
        if (desiredInput === 'observation' || activeInput === 'observation') {
          const controls = tireSoundParameters(state[axle]);
          for (const key of TIRE_SOUND_INPUT_KEYS) node.parameters.get(`${axle}_tire_${key}`)!.value = controls[key];
          node.parameters.get(`${axle}_tire_surfaceIndex`)!.value = controls.surfaceIndex;
        }
        if (desiredInput === 'contact' || activeInput === 'contact') {
          const controls = contactTireParameters(state[axle]);
          node.parameters.get(`${axle}_travelSpeed`)!.value = controls.travelSpeed;
          node.parameters.get(`${axle}_slipSpeed`)!.value = controls.slipSpeed;
          node.parameters.get(`${axle}_load`)!.value = controls.load;
          node.parameters.get(`${axle}_surfaceIndex`)!.value = controls.surfaceIndex;
        }
      }
      const tuning = desired === 'modal' || desired === 'unified' ? tunings[desired] : null;
      const changed = desired !== active || !sameTireTuning(tuning, activeTuning);
      if (active !== null && changed) {
        if (pending?.model !== desired || !sameTireTuning(pending.tuning, tuning)) {
          pending = { model: desired, tuning, at: now + AUDIO_TIMING.transitionSeconds };
          follow(output.gain, 0, now, 0.01); // Authored 10 ms model-switch fade, not tire vibration decay.
        }
        if (now < pending.at) return;
      }
      if (changed) {
        node.port.postMessage(tuning ? { model: desired, tuning: tuning.tuning } : { model: desired });
        active = desired;
        activeTuning = tuning;
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
