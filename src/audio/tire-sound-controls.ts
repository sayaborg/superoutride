import { TIRE_SOUND_INPUTS, TIRE_SOUND_SURFACES, type TireSoundObservation } from './tire-sound-observation.js';
import { CONTACT_INPUTS, CONTACT_TEXTURES, CONTACT_TEXTURE_KEYS } from './tire-contact-acoustics.js';
import type { TireAudioObservation } from './vehicle-audio-observation.js';

export const TIRE_COMPONENTS = Object.freeze([
  Object.freeze({ key: 'road', label: 'R', description: 'Rolling' }),
  Object.freeze({ key: 'scrub', label: 'S', description: 'Sliding friction' }),
  Object.freeze({ key: 'squeal', label: 'Q', description: 'Squeal' }),
] as const);
type TireComponent = (typeof TIRE_COMPONENTS)[number]['key'];
// Composition owns model identity, transport and actual output taps; kernels have no model flags.
export const TIRE_SOUND_CONTROLS = Object.freeze({
  hopf: Object.freeze({ input: 'hopf', components: Object.freeze([]) }),
  contact: Object.freeze({ input: 'contact', components: Object.freeze([]) }),
  spectral: Object.freeze({ input: 'observation', components: TIRE_COMPONENTS }),
  hybrid: Object.freeze({ input: 'observation', components: TIRE_COMPONENTS }),
  modal: Object.freeze({
    input: 'observation',
    components: Object.freeze([Object.freeze({ ...TIRE_COMPONENTS[2], description: 'Friction / squeal' })]),
  }),
  unified: Object.freeze({
    input: 'observation',
    components: Object.freeze([
      TIRE_COMPONENTS[0],
      Object.freeze({ ...TIRE_COMPONENTS[2], description: 'Friction / squeal' }),
    ]),
  }),
});
export type TireSoundModel = keyof typeof TIRE_SOUND_CONTROLS;
export const TIRE_SOUND_MODELS = Object.freeze(Object.keys(TIRE_SOUND_CONTROLS) as TireSoundModel[]);
export const DEFAULT_TIRE_SOUND_MODEL: TireSoundModel = 'hybrid';

export function tireComponentDescription(model: TireSoundModel, component: TireComponent): string | undefined {
  return TIRE_SOUND_CONTROLS[model].components.find(({ key }) => key === component)?.description;
}
export function tireComponentAvailable(model: TireSoundModel, component: TireComponent): boolean {
  return tireComponentDescription(model, component) !== undefined;
}
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

// Transport domains, shared by the voice, worklet and diagnostics. Kernels own smoothing.
export const TIRE_CONTROL_RANGES = Object.freeze({
  ...observationRanges,
  tire_surfaceIndex: Object.freeze({ minValue: 0, maxValue: TIRE_SOUND_SURFACES.length - 1, defaultValue: 0 }),
  squeal: Object.freeze({ minValue: 0, maxValue: 1, defaultValue: 0 }),
  pitch: Object.freeze({ minValue: 400, maxValue: 2400, defaultValue: 900 }),
  travelSpeed: Object.freeze({ minValue: 0, maxValue: CONTACT_INPUTS.travelSpeed.max, defaultValue: 0 }),
  slipSpeed: Object.freeze({ minValue: 0, maxValue: CONTACT_INPUTS.slipSpeed.max, defaultValue: 0 }),
  load: Object.freeze({ minValue: 0, maxValue: CONTACT_INPUTS.load.max, defaultValue: 0 }),
  surfaceIndex: Object.freeze({ minValue: 0, maxValue: CONTACT_TEXTURE_KEYS.length - 1, defaultValue: 0 }),
});

// Authored macro-to-representative mapping, NOT a measurement of local tread motion/pressure.
// At normal support, every axle has the same representative 5 N reference, regardless of vehicle mass.
export const TIRE_CONTACT_MAPPING = Object.freeze({ referenceLoad: 5, slipHalfSpeed: 20 });
const surfaceIndices = new Map(CONTACT_TEXTURE_KEYS.map((key, index) => [CONTACT_TEXTURES[key].surface, index]));

/** One read-only mapping for both axles; source names never select a maneuver or vehicle. */
export function contactTireParameters(tire: TireAudioObservation) {
  if (!Number.isFinite(tire.load) || tire.load < 0) throw new RangeError('invalid tire contact load');
  if (tire.load === 0 || tire.surface === 'VOID') return { travelSpeed: 0, slipSpeed: 0, load: 0, surfaceIndex: 0 };
  const surfaceIndex = surfaceIndices.get(tire.surface);
  if (
    ![tire.load, tire.referenceLoad, tire.travelSpeed, tire.slipSpeed].every(Number.isFinite) ||
    tire.referenceLoad <= 0 ||
    tire.travelSpeed < 0 ||
    tire.slipSpeed < 0 ||
    surfaceIndex === undefined
  )
    throw new RangeError('invalid tire contact observation');
  return {
    travelSpeed: Math.min(CONTACT_INPUTS.travelSpeed.max, tire.travelSpeed),
    slipSpeed: CONTACT_INPUTS.slipSpeed.max * (tire.slipSpeed / (tire.slipSpeed + TIRE_CONTACT_MAPPING.slipHalfSpeed)),
    load: Math.min(CONTACT_INPUTS.load.max, TIRE_CONTACT_MAPPING.referenceLoad * (tire.load / tire.referenceLoad)),
    surfaceIndex,
  };
}

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
    demand: 0,
    surfaceIndex: 0,
  };
  if (!Number.isFinite(tire.load) || tire.load < 0) throw new RangeError('invalid tire sound load');
  if (tire.load === 0 || tire.surface === 'VOID') return silent;
  const surfaceIndex = TIRE_SOUND_SURFACES.findIndex((surface) => surface === tire.surface);
  const values = {
    longitudinalVelocity: tire.longitudinalVelocity,
    lateralVelocity: tire.lateralVelocity,
    wheelSpeed: tire.wheelSpeed,
    wheelAngularSpeed: tire.wheelAngularSpeed,
    load: tire.load,
    longitudinalPower: tire.longitudinalPower,
    lateralPower: tire.lateralPower,
    demand: tire.utilization,
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
