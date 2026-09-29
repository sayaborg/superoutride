/**
 * One sound record per material ID: the rolling generator's surface palette and the friction system's input.
 * Listening values, NOT measured surface properties.
 */
export type SurfaceSound = Readonly<{
  rolling: Readonly<{ low: number; high: number; textureLengthMeters: number; textureDepth: number }>;
  friction: Readonly<{ roughness: number; susceptibility: number }>;
}>;

export const SURFACE_SOUNDS: Readonly<Record<string, SurfaceSound>> = Object.freeze({
  ASPHALT: Object.freeze({
    rolling: Object.freeze({ low: 0.9, high: 0.18, textureLengthMeters: 0.3, textureDepth: 0.12 }),
    friction: Object.freeze({ roughness: 1, susceptibility: 1 }),
  }),
  SHOULDER: Object.freeze({
    rolling: Object.freeze({ low: 0.85, high: 0.7, textureLengthMeters: 0.6, textureDepth: 0.4 }),
    friction: Object.freeze({ roughness: 1.3, susceptibility: 0.4 }),
  }),
  GRASS: Object.freeze({
    rolling: Object.freeze({ low: 0.85, high: 0.12, textureLengthMeters: 1.4, textureDepth: 0.45 }),
    friction: Object.freeze({ roughness: 0.75, susceptibility: 0.04 }),
  }),
  DIRT: Object.freeze({
    rolling: Object.freeze({ low: 1, high: 0.55, textureLengthMeters: 0.8, textureDepth: 0.8 }),
    friction: Object.freeze({ roughness: 1.5, susceptibility: 0.12 }),
  }),
  SAND: Object.freeze({
    rolling: Object.freeze({ low: 0.3, high: 0.8, textureLengthMeters: 0.12, textureDepth: 0.2 }),
    friction: Object.freeze({ roughness: 1.1, susceptibility: 0.02 }),
  }),
});

// Numbers follow the table's key order; 11-10 replaces it with the material catalog order.
export const SURFACE_SOUND_IDS: readonly string[] = Object.freeze(Object.keys(SURFACE_SOUNDS));

/** Records by transport number, read by the kernels without string lookup. */
export const SURFACE_SOUND_RECORDS: readonly SurfaceSound[] = Object.freeze(Object.values(SURFACE_SOUNDS));

/** Product assembly admits a material catalog only when every delivered material has a sound record. */
export function validateSurfaceSoundIds(materialIds: readonly string[]): void {
  const missing = materialIds.filter((id) => !Object.hasOwn(SURFACE_SOUNDS, id));
  if (missing.length) throw new RangeError(`Surface sounds are missing material IDs: ${missing.join(', ')}`);
}
