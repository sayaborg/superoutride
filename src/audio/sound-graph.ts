import { clamp } from '../core/math.js';
import { AUDIO_CONTROL_POLICY } from './audio-control-policy.js';
import { follow } from './audio-parameter.js';

// A new sound kind adds one bus here and connects its voices to that bus's input.
export const SOUND_BUSES = Object.freeze(['engine', 'tire'] as const);
export type SoundBus = (typeof SOUND_BUSES)[number];

/** Output protection for the summed mix, not a vehicle or pipe property. */
export const MASTER_COMPRESSOR_SETTINGS = Object.freeze({
  thresholdDb: -6,
  kneeDb: 6,
  ratio: 12,
  attackSeconds: 0.003,
  releaseSeconds: 0.12,
});

/** Named buses into one master gain and compressor; voices connect to a bus input. */
export function createSoundGraph(context: BaseAudioContext) {
  const master = context.createGain();
  master.gain.value = 0;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = MASTER_COMPRESSOR_SETTINGS.thresholdDb;
  compressor.knee.value = MASTER_COMPRESSOR_SETTINGS.kneeDb;
  compressor.ratio.value = MASTER_COMPRESSOR_SETTINGS.ratio;
  compressor.attack.value = MASTER_COMPRESSOR_SETTINGS.attackSeconds;
  compressor.release.value = MASTER_COMPRESSOR_SETTINGS.releaseSeconds;
  master.connect(compressor).connect(context.destination);
  const buses = Object.fromEntries(
    SOUND_BUSES.map((bus) => {
      const gain = context.createGain();
      gain.gain.value = 1;
      gain.connect(master);
      return [bus, gain];
    }),
  ) as Record<SoundBus, GainNode>;
  return {
    input(bus: SoundBus): AudioNode {
      return buses[bus];
    },
    setBusGain(bus: SoundBus, value: number): void {
      if (!Number.isFinite(value)) throw new RangeError('invalid audio bus gain');
      follow(buses[bus].gain, clamp(value, 0, 1), context.currentTime, AUDIO_CONTROL_POLICY.mixSeconds);
    },
    setMasterGain(value: number): void {
      follow(master.gain, clamp(value, 0, 1), context.currentTime, AUDIO_CONTROL_POLICY.mixSeconds);
    },
    dispose(): void {
      for (const bus of SOUND_BUSES) buses[bus].disconnect();
      master.disconnect();
      compressor.disconnect();
    },
  };
}
