import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import { createEngineVoice } from './engine-voice.js';
import { createTireVoice } from './tire-voice.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** One player and one rival slot. All nodes live until disposal. */
export async function createAudioEngine(context: AudioContext) {
  await context.audioWorklet.addModule(new URL('./noise-processor.js', import.meta.url));
  const master = context.createGain();
  master.gain.value = 0;
  const safety = context.createDynamicsCompressor();
  safety.threshold.value = -6;
  safety.knee.value = 6;
  safety.ratio.value = 12;
  safety.attack.value = 0.003;
  safety.release.value = 0.12;
  master.connect(safety).connect(context.destination);
  const noise = new AudioWorkletNode(context, 'driving-noise', {
    numberOfInputs: 0,
    numberOfOutputs: 3,
    outputChannelCount: [1, 1, 1],
  });
  const player = createEngineVoice(context, master);
  const rivalPan = context.createStereoPanner();
  rivalPan.connect(master);
  const rival = createEngineVoice(context, rivalPan);
  const tires = createTireVoice(context, noise, master);
  const wind = context.createBiquadFilter();
  wind.type = 'lowpass';
  wind.frequency.value = 650;
  wind.Q.value = 0.5;
  const windGain = context.createGain();
  windGain.gain.value = 0;
  noise.connect(wind, 2);
  wind.connect(windGain).connect(master);
  let disposed = false;
  return {
    update(state: VehicleAudioObservation, profile: VehicleAudioProfile): void {
      player.update(state, profile);
      tires.update(state);
      follow(windGain.gain, 0.12 * clamp(state.speed / 85, 0, 1) ** 2, context.currentTime);
    },
    updateRival(state: VehicleAudioObservation, profile: VehicleAudioProfile, gain: number, pan: number): void {
      rival.update(state, profile, gain);
      follow(rivalPan.pan, clamp(pan, -1, 1), context.currentTime, 0.06);
    },
    silenceRival(): void {
      rival.silence();
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
      noise.port.postMessage('stop');
      noise.port.close();
      for (const node of [noise, wind, windGain, rivalPan, master, safety]) node.disconnect();
    },
  };
}
