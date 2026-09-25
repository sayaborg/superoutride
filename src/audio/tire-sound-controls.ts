import { TIRE_SOUND_INPUTS, type TireSoundObservation } from './tire-sound-observation.js';
import { TIRE_SOUND_SURFACE_IDS } from './tire-surface-acoustics.js';
import type { TireAudioObservation } from './vehicle-audio-observation.js';

export const TIRE_COMPONENTS = Object.freeze([
  Object.freeze({ key: 'road', label: 'R', description: 'Rolling' }),
  Object.freeze({ key: 'squeal', label: 'Q', description: 'Friction / squeal' }),
] as const);
type TireComponent = (typeof TIRE_COMPONENTS)[number]['key'];
export type TireComponents = Readonly<Record<TireComponent, boolean>>;
// Authored output-control fade, not a physical contact or vibration time constant.
export const TIRE_COMPONENT_FADE_SECONDS = 0.005;
export const TIRE_COMPONENT_RANGE = Object.freeze({ minValue: 0, maxValue: 1, defaultValue: 1 });

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
  tire_surfaceIndex: Object.freeze({ minValue: 0, maxValue: TIRE_SOUND_SURFACE_IDS.length - 1, defaultValue: 0 }),
});

/** Bound only the acoustic transport, never vehicle state; signed kinematics keep their meaning. */
export function tireSoundParameters(tire: TireAudioObservation) {
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
  const surfaceIndex = TIRE_SOUND_SURFACE_IDS.findIndex((surface) => surface === tire.surface);
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
    if (!Number.isFinite(value) || (range.min === 0 && value < 0))
      throw new RangeError(`invalid tire sound observation: ${key}`);
    values[key] = Math.max(range.min, Math.min(range.max, value));
  }
  return { ...values, surfaceIndex };
}
