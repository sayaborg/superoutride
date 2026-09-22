import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import type { ExhaustTuning } from './exhaust-acoustics.js';
import { createTireVoice } from './tire-voice.js';
import type { UnifiedTuning } from './tire-unified-acoustics.js';
import type { TireComponents } from './tire-sound-controls.js';
import { createEngineVoice } from './engine-voice.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** Fixed player/rival engines and one player tire worklet containing independent front/rear sources. */
export async function createAudioEngine(context: AudioContext) {
  await context.audioWorklet.addModule(new URL('./vehicle-processor.js', import.meta.url));
  const master = context.createGain();
  master.gain.value = 0;
  const safety = context.createDynamicsCompressor();
  safety.threshold.value = -6;
  safety.knee.value = 6;
  safety.ratio.value = 12;
  safety.attack.value = 0.003;
  safety.release.value = 0.12;
  master.connect(safety).connect(context.destination);
  const engineBus = context.createGain();
  const tireBus = context.createGain();
  engineBus.gain.value = tireBus.gain.value = 1;
  engineBus.connect(master);
  tireBus.connect(master);
  const player = createEngineVoice(context, engineBus);
  const rivalPan = context.createStereoPanner();
  rivalPan.connect(engineBus);
  const rival = createEngineVoice(context, rivalPan);
  const tires = createTireVoice(context, tireBus);
  let disposed = false;
  return {
    update(state: VehicleAudioObservation, profile: VehicleAudioProfile): void {
      player.update(state, profile);
      tires.update(state);
    },
    updateRival(state: VehicleAudioObservation, profile: VehicleAudioProfile, gain: number, pan: number): void {
      rival.update(state, profile, gain);
      follow(rivalPan.pan, clamp(pan, -1, 1), context.currentTime, 0.06);
    },
    silenceRival(): void {
      rival.silence();
    },
    setTuning(value: ExhaustTuning): void {
      player.setTuning(value);
      rival.setTuning(value);
    },
    setTireTuning(value: UnifiedTuning): void {
      tires.setTuning(value);
    },
    setMix(engine: number, tire: number): void {
      if (!Number.isFinite(engine + tire)) throw new RangeError('invalid audio mix');
      follow(engineBus.gain, clamp(engine, 0, 1), context.currentTime, 0.015);
      follow(tireBus.gain, clamp(tire, 0, 1), context.currentTime, 0.015);
    },
    setTireComponents(value: TireComponents): void {
      tires.setComponents(value);
    },
    setVolume(value: number): void {
      follow(master.gain, clamp(value, 0, 1), context.currentTime, 0.015);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      player.dispose();
      rival.dispose();
      tires.dispose();
      for (const node of [rivalPan, engineBus, tireBus, master, safety]) node.disconnect();
    },
  };
}
