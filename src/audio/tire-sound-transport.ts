/**
 * Transport of tire audio observations to the worklet: bounded domains, the one validation and the AudioParam ranges.
 * Kernels own smoothing; component switching is in tire-sound-components.
 */
import { SURFACE_SOUND_LIMIT } from './surface-sounds.js';
import type { TireAudioObservation } from './vehicle-audio-observation.js';

/** The largest finite float32, the most an AudioParam carries. */
const AUDIO_PARAM_MAXIMUM = 3.4028234663852886e38;
const signed = Object.freeze({ min: -AUDIO_PARAM_MAXIMUM, max: AUDIO_PARAM_MAXIMUM });
const nonnegative = Object.freeze({ min: 0, max: AUDIO_PARAM_MAXIMUM });

/**
 * The acoustic transport: each observation as the AudioParam carries it, any finite float32 value, signed or
 * nonnegative. The rolling synthesis saturates its inputs (`x / (x + reference)`) and the friction synthesis reads the
 * friction power per load and the load's square root, finite for any finite input, so none is bounded in transport.
 */
export const TIRE_SOUND_INPUTS = Object.freeze({
  longitudinalVelocity: signed,
  lateralVelocity: signed,
  wheelAngularSpeed: signed,
  wheelSpeed: signed,
  load: nonnegative,
  longitudinalPower: nonnegative,
  lateralPower: nonnegative,
});
export type TireSoundObservation = { readonly [K in keyof typeof TIRE_SOUND_INPUTS]: number };
export const TIRE_SOUND_INPUT_KEYS = Object.freeze(Object.keys(TIRE_SOUND_INPUTS) as (keyof TireSoundObservation)[]);

const observationRanges = Object.fromEntries(
  Object.entries(TIRE_SOUND_INPUTS).map(([key, range]) => [
    `tire_${key}`,
    Object.freeze({ minValue: range.min, maxValue: range.max, defaultValue: 0 }),
  ]),
) as {
  readonly [K in keyof TireSoundObservation as `tire_${K}`]: Readonly<{
    minValue: number;
    maxValue: number;
    defaultValue: number;
  }>;
};

// Transport domains, shared by the voice and worklet. Kernels own smoothing.
export const TIRE_CONTROL_RANGES = Object.freeze({
  ...observationRanges,
  tire_surfaceIndex: Object.freeze({ minValue: 0, maxValue: SURFACE_SOUND_LIMIT - 1, defaultValue: 0 }),
});

/**
 * The only validation of tire sound values; the worklet and kernels read the result as trusted. Each value must be
 * finite as the transport's float32 carries it, and the nonnegative ones at least 0; none is bounded further. The
 * surface number is the material's position in `materialIds`, the material catalog order.
 */
export function tireSoundParameters(tire: TireAudioObservation, materialIds: readonly string[]) {
  const silent = {
    longitudinalVelocity: 0,
    lateralVelocity: 0,
    wheelSpeed: 0,
    wheelAngularSpeed: 0,
    load: 0,
    longitudinalPower: 0,
    lateralPower: 0,
    surfaceIndex: 0,
  };
  if (!Number.isFinite(tire.load) || tire.load < 0) throw new RangeError('invalid tire sound load');
  if (tire.load === 0 || tire.surface === null) return silent;
  const surfaceIndex = materialIds.indexOf(tire.surface);
  const values = {
    longitudinalVelocity: tire.longitudinalVelocity,
    lateralVelocity: tire.lateralVelocity,
    wheelSpeed: tire.wheelSpeed,
    wheelAngularSpeed: tire.wheelAngularSpeed,
    load: tire.load,
    longitudinalPower: tire.longitudinalPower,
    lateralPower: tire.lateralPower,
  };
  if (surfaceIndex < 0) throw new RangeError('unknown tire sound surface');
  for (const key of Object.keys(values) as (keyof TireSoundObservation)[]) {
    const range = TIRE_SOUND_INPUTS[key],
      value = values[key];
    if (!Number.isFinite(Math.fround(value)) || value < range.min)
      throw new RangeError(`invalid tire sound observation: ${key}`);
  }
  return { ...values, surfaceIndex };
}
