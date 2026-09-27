import { TIRE_SOUND_SURFACE_IDS } from './tire-surface-acoustics.js';

/** Bounded read-only acoustic transport. Bounds are numerical transport choices, not tire physics. */
export const TIRE_SOUND_INPUTS = Object.freeze({
  longitudinalVelocity: Object.freeze({ min: -100, max: 100 }),
  lateralVelocity: Object.freeze({ min: -100, max: 100 }),
  wheelAngularSpeed: Object.freeze({ min: -1000, max: 1000 }),
  wheelSpeed: Object.freeze({ min: -200, max: 200 }),
  load: Object.freeze({ min: 0, max: 30000 }),
  longitudinalPower: Object.freeze({ min: 0, max: 1000000 }),
  lateralPower: Object.freeze({ min: 0, max: 1000000 }),
});
export type TireSoundObservation = { readonly [K in keyof typeof TIRE_SOUND_INPUTS]: number };
export const TIRE_SOUND_INPUT_KEYS = Object.freeze(Object.keys(TIRE_SOUND_INPUTS) as (keyof TireSoundObservation)[]);
/** Validate bounded acoustic transport, never alter the vehicle observation. */
export function validateTireSoundObservation(value: TireSoundObservation, surfaceIndex: number): void {
  if (!Number.isInteger(surfaceIndex) || surfaceIndex < 0 || surfaceIndex >= TIRE_SOUND_SURFACE_IDS.length)
    throw new RangeError('invalid tire sound surface');
  for (const key of TIRE_SOUND_INPUT_KEYS) {
    const range = TIRE_SOUND_INPUTS[key],
      number = value[key];
    if (!Number.isFinite(number) || number < range.min || number > range.max)
      throw new RangeError(`invalid tire sound observation: ${key}`);
  }
}
