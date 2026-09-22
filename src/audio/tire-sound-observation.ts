/** Bounded read-only acoustic transport. Bounds/defaults are numerical/audition choices, not tire physics. */
export const TIRE_SOUND_SURFACES = Object.freeze(['ASPHALT', 'SHOULDER', 'GRASS', 'DIRT', 'SAND'] as const);
export const TIRE_SOUND_INPUTS = Object.freeze({
  longitudinalVelocity: Object.freeze({ min: -100, max: 100, step: 1, value: 25, label: 'Contact longitudinal (m/s)' }),
  lateralVelocity: Object.freeze({ min: -100, max: 100, step: 0.1, value: 4, label: 'Contact lateral (m/s)' }),
  wheelAngularSpeed: Object.freeze({
    min: -1000,
    max: 1000,
    step: 1,
    value: 25 / 0.3,
    label: 'Wheel angular speed (rad/s)',
  }),
  wheelSpeed: Object.freeze({ min: -200, max: 200, step: 1, value: 25, label: 'Wheel peripheral speed (m/s)' }),
  load: Object.freeze({ min: 0, max: 30000, step: 100, value: 4000, label: 'Accepted normal load (N)' }),
  longitudinalPower: Object.freeze({ min: 0, max: 1000000, step: 100, value: 0, label: 'Longitudinal slip work (W)' }),
  lateralPower: Object.freeze({ min: 0, max: 1000000, step: 100, value: 12000, label: 'Lateral slip work (W)' }),
});
export type TireSoundObservation = { readonly [K in keyof typeof TIRE_SOUND_INPUTS]: number };
export const TIRE_SOUND_INPUT_KEYS = Object.freeze(Object.keys(TIRE_SOUND_INPUTS) as (keyof TireSoundObservation)[]);
/** Validate bounded acoustic transport, never alter the vehicle observation. */
export function validateTireSoundObservation(value: TireSoundObservation, surfaceIndex: number): void {
  if (!Number.isInteger(surfaceIndex) || surfaceIndex < 0 || surfaceIndex >= TIRE_SOUND_SURFACES.length)
    throw new RangeError('invalid tire sound surface');
  for (const key of TIRE_SOUND_INPUT_KEYS) {
    const range = TIRE_SOUND_INPUTS[key],
      number = value[key];
    if (!Number.isFinite(number) || number < range.min || number > range.max)
      throw new RangeError(`invalid tire sound observation: ${key}`);
  }
}
