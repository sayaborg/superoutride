import { CONTACT_INPUTS, CONTACT_TEXTURES, CONTACT_TEXTURE_KEYS } from './tire-contact-acoustics.js';
import type { TireAudioObservation } from './vehicle-audio-observation.js';

export type TireSoundModel = 'current' | 'contact';
export const DEFAULT_TIRE_SOUND_MODEL: TireSoundModel = 'current';

// Transport domains, shared by the voice, worklet and diagnostics. Kernels own smoothing.
export const TIRE_CONTROL_RANGES = Object.freeze({
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
