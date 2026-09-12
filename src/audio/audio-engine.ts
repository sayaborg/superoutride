import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import type { DEFAULT_EXHAUST_TUNING } from './exhaust-acoustics.js';
import { createEngineVoice } from './engine-voice.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** Engine comparison only: one player and one rival slot. No tire/wind nodes are constructed. */
export async function createAudioEngine(context: AudioContext) {
  await context.audioWorklet.addModule(new URL('./exhaust-processor.js', import.meta.url));
  const master = context.createGain();
  master.gain.value = 0;
  const safety = context.createDynamicsCompressor();
  safety.threshold.value = -6;
  safety.knee.value = 6;
  safety.ratio.value = 12;
  safety.attack.value = 0.003;
  safety.release.value = 0.12;
  master.connect(safety).connect(context.destination);
  const player = createEngineVoice(context, master);
  const rivalPan = context.createStereoPanner();
  rivalPan.connect(master);
  const rival = createEngineVoice(context, rivalPan);
  let disposed = false;
  return {
    update(state: VehicleAudioObservation, profile: VehicleAudioProfile): void {
      player.update(state, profile);
    },
    updateRival(state: VehicleAudioObservation, profile: VehicleAudioProfile, gain: number, pan: number): void {
      rival.update(state, profile, gain);
      follow(rivalPan.pan, clamp(pan, -1, 1), context.currentTime, 0.06);
    },
    silenceRival(): void {
      rival.silence();
    },
    setCoupled(value: boolean): void {
      player.setCoupled(value);
      rival.setCoupled(value);
    },
    setTuning(value: typeof DEFAULT_EXHAUST_TUNING): void {
      player.setTuning(value);
      rival.setTuning(value);
    },
    setVolume(value: number): void {
      follow(master.gain, clamp(value, 0, 1), context.currentTime, 0.015);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      player.dispose();
      rival.dispose();
      for (const node of [rivalPan, master, safety]) node.disconnect();
    },
  };
}
