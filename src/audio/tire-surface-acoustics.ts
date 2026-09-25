import { ROLLING_SURFACES } from './tire-rolling-acoustics.js';
import { UNIFIED_SURFACES } from './tire-unified-acoustics.js';

/** Stable numeric transport order for the worklet; source observations remain material IDs. */
export const TIRE_SOUND_SURFACE_IDS = Object.freeze(Object.keys(ROLLING_SURFACES));

/** Product assembly admits a material catalog only when every delivered material has both sound entries. */
export function validateTireSoundMaterialIds(materialIds: readonly string[]): void {
  const missing = materialIds.filter(
    (id) => !Object.hasOwn(ROLLING_SURFACES, id) || !Object.hasOwn(UNIFIED_SURFACES, id),
  );
  if (missing.length) throw new RangeError(`Tire sound tables are missing material IDs: ${missing.join(', ')}`);
}
