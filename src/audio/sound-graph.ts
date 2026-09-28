import { clamp } from '../core/math.js';
import { DEFAULT_CONTROL_SETTINGS, type ControlSettings } from './audio-control-policy.js';
import { follow } from './audio-parameter.js';

// A new sound kind adds one bus here and connects its voices to that bus's input.
export const SOUND_BUSES = Object.freeze(['engine', 'tire'] as const);
export type SoundBus = (typeof SOUND_BUSES)[number];

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

export const DEFAULT_MIX_SETTINGS: MixSettings = Object.freeze({
  thresholdDb: -6,
  kneeDb: 6,
  ratio: 12,
  attackSeconds: 0.003,
  releaseSeconds: 0.12,
});

export const MIX_SETTING_RANGES: Readonly<Record<keyof MixSettings, { min: number; max: number; step: number }>> =
  Object.freeze({
    thresholdDb: Object.freeze({ min: -40, max: 0, step: 1 }),
    kneeDb: Object.freeze({ min: 0, max: 40, step: 1 }),
    ratio: Object.freeze({ min: 1, max: 20, step: 0.5 }),
    attackSeconds: Object.freeze({ min: 0.001, max: 0.1, step: 0.001 }),
    releaseSeconds: Object.freeze({ min: 0.02, max: 1, step: 0.01 }),
  });

export function resolveMixSettings(overrides: Partial<MixSettings> = {}): MixSettings {
  const settings = { ...DEFAULT_MIX_SETTINGS };
  for (const key of Object.keys(MIX_SETTING_RANGES) as (keyof MixSettings)[]) {
    const value = overrides[key] === undefined ? settings[key] : overrides[key];
    const range = MIX_SETTING_RANGES[key];
    if (!Number.isFinite(value) || value < range.min || value > range.max)
      throw new RangeError(`invalid mix settings: ${key}`);
    settings[key] = value;
  }
  return Object.freeze(settings);
}

/** Named buses into one master gain and compressor; voices connect to a bus input. */
export function createSoundGraph(context: BaseAudioContext) {
  const master = context.createGain();
  master.gain.value = 0;
  const compressor = context.createDynamicsCompressor();
  const applyMix = (mix: MixSettings): void => {
    compressor.threshold.value = mix.thresholdDb;
    compressor.knee.value = mix.kneeDb;
    compressor.ratio.value = mix.ratio;
    compressor.attack.value = mix.attackSeconds;
    compressor.release.value = mix.releaseSeconds;
  };
  applyMix(DEFAULT_MIX_SETTINGS);
  let control: ControlSettings = DEFAULT_CONTROL_SETTINGS;
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
      follow(buses[bus].gain, clamp(value, 0, 1), context.currentTime, control.mixSeconds);
    },
    setMasterGain(value: number): void {
      follow(master.gain, clamp(value, 0, 1), context.currentTime, control.mixSeconds);
    },
    /** Written directly to the compressor's parameters. */
    setMixSettings(value: MixSettings): void {
      applyMix(resolveMixSettings(value));
    },
    setControlSettings(value: ControlSettings): void {
      control = value;
    },
    dispose(): void {
      for (const bus of SOUND_BUSES) buses[bus].disconnect();
      master.disconnect();
      compressor.disconnect();
    },
  };
}
