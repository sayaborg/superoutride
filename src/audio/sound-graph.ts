import { clamp } from '../core/math.js';
import type { ControlSettings } from './audio-control-policy.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import { follow } from './audio-parameter.js';

/**
 * The buses and what each declares: `live` buses sound only while a run is driven. A new sound kind adds one bus
 * here and connects its voices to that bus's input.
 */
const BUS_DECLARATIONS = Object.freeze({
  engine: Object.freeze({ live: true }),
  tire: Object.freeze({ live: true }),
  music: Object.freeze({ live: false }),
});
export type SoundBus = keyof typeof BUS_DECLARATIONS;
export const SOUND_BUSES = Object.freeze(Object.keys(BUS_DECLARATIONS) as SoundBus[]);
/** Whether `bus` sounds only while a run is driven. */
export const isLiveBus = (bus: SoundBus): boolean => BUS_DECLARATIONS[bus].live;

/**
 * Master compressor: output protection for the summed mix, not a vehicle or pipe property. No derivation;
 * listening settings on the DEV MIX panel.
 */
export interface MixSettings {
  readonly thresholdDb: number;
  readonly kneeDb: number;
  readonly ratio: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
}

export const MIX_SETTING_RANGES: Readonly<Record<keyof MixSettings, { min: number; max: number; step: number }>> =
  Object.freeze({
    thresholdDb: Object.freeze({ min: -40, max: 0, step: 1 }),
    kneeDb: Object.freeze({ min: 0, max: 40, step: 1 }),
    ratio: Object.freeze({ min: 1, max: 20, step: 0.5 }),
    attackSeconds: Object.freeze({ min: 0.001, max: 0.1, step: 0.001 }),
    releaseSeconds: Object.freeze({ min: 0.02, max: 1, step: 0.01 }),
  });

export function resolveMixSettings(overrides: Partial<MixSettings> = {}): MixSettings {
  const settings = { ...DEFAULT_AUDIO_SETTINGS.mix };
  for (const key of Object.keys(MIX_SETTING_RANGES) as (keyof MixSettings)[]) {
    const value = overrides[key] === undefined ? settings[key] : overrides[key];
    const range = MIX_SETTING_RANGES[key];
    if (!Number.isFinite(value) || value < range.min || value > range.max)
      throw new RangeError(`invalid mix settings: ${key}`);
    settings[key] = value;
  }
  return Object.freeze(settings);
}

/**
 * Named buses into one master gain and compressor; voices connect to a bus input. The live buses pass one live gate,
 * open only while a run is driven.
 */
export function createSoundGraph(context: BaseAudioContext) {
  const master = context.createGain();
  master.gain.value = 0;
  const liveGate = context.createGain();
  liveGate.gain.value = 0;
  liveGate.connect(master);
  const compressor = context.createDynamicsCompressor();
  const applyMix = (mix: MixSettings): void => {
    compressor.threshold.value = mix.thresholdDb;
    compressor.knee.value = mix.kneeDb;
    compressor.ratio.value = mix.ratio;
    compressor.attack.value = mix.attackSeconds;
    compressor.release.value = mix.releaseSeconds;
  };
  applyMix(DEFAULT_AUDIO_SETTINGS.mix);
  let control: ControlSettings = DEFAULT_AUDIO_SETTINGS.control;
  master.connect(compressor).connect(context.destination);
  const buses = Object.fromEntries(
    SOUND_BUSES.map((bus) => {
      const gain = context.createGain();
      gain.gain.value = 1;
      gain.connect(isLiveBus(bus) ? liveGate : master);
      return [bus, gain];
    }),
  ) as Record<SoundBus, GainNode>;
  return {
    input(bus: SoundBus): AudioNode {
      return buses[bus];
    },
    setBusGain(bus: SoundBus, value: number): void {
      if (!Number.isFinite(value)) throw new RangeError('invalid audio bus gain');
      follow(buses[bus].gain, clamp(value, 0, 1), context.currentTime, control.mixSeconds);
    },
    setMasterGain(value: number): void {
      follow(master.gain, clamp(value, 0, 1), context.currentTime, control.mixSeconds);
    },
    /**
     * Close the live gate with the silence fade, or open it: closed first, it opens after the transition time, so
     * kernels that woke from rest reach the current observation before they are heard.
     */
    setLive(live: boolean): void {
      const now = context.currentTime;
      follow(liveGate.gain, 0, now, control.fadeSeconds);
      if (live) liveGate.gain.setTargetAtTime(1, now + control.transitionSeconds, control.mixSeconds);
    },
    /** Admitted settings, written directly to the compressor's parameters. */
    setMixSettings(value: MixSettings): void {
      applyMix(value);
    },
    setControlSettings(value: ControlSettings): void {
      control = value;
    },
    dispose(): void {
      for (const bus of SOUND_BUSES) buses[bus].disconnect();
      liveGate.disconnect();
      master.disconnect();
      compressor.disconnect();
    },
  };
}
