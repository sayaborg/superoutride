/**
 * One sound record per material ID: the rolling generator's surface palette and the friction system's input.
 * Listening values, NOT measured surface properties.
 */
export type SurfaceSound = Readonly<{
  rolling: Readonly<{ low: number; high: number; textureLengthMeters: number; textureDepth: number }>;
  friction: Readonly<{ roughness: number; susceptibility: number }>;
}>;

/** The transport bound on surface numbers: the worklet's `surfaceIndex` parameter range. */
export const SURFACE_SOUND_LIMIT = 256;

/**
 * The one value check of a surface sound: every number finite and at
 * least 0, `textureLengthMeters` above 0 and `susceptibility` at most 1. Returns a detached frozen record.
 */
export function compileSurfaceSound(record: SurfaceSound): SurfaceSound {
  const { rolling, friction } = record;
  const values = [rolling.low, rolling.high, rolling.textureLengthMeters, rolling.textureDepth];
  values.push(friction.roughness, friction.susceptibility);
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0))
    throw new RangeError('invalid surface sound: values must be finite and nonnegative');
  if (rolling.textureLengthMeters <= 0) throw new RangeError('invalid surface sound: textureLengthMeters');
  if (friction.susceptibility > 1) throw new RangeError('invalid surface sound: susceptibility');
  return Object.freeze({
    rolling: Object.freeze({
      low: rolling.low,
      high: rolling.high,
      textureLengthMeters: rolling.textureLengthMeters,
      textureDepth: rolling.textureDepth,
    }),
    friction: Object.freeze({ roughness: friction.roughness, susceptibility: friction.susceptibility }),
  });
}

/** Admitted surface sounds by material ID, with the delivered document's SHA-256. */
export interface CompiledSurfaceSounds {
  readonly surfaces: Readonly<Record<string, SurfaceSound>>;
  readonly sha256: string;
}

/**
 * Surface sounds numbered in material catalog order: exactly one record per catalog material and none for any
 * other ID, with no fallback. A missing or unknown ID, or more than `SURFACE_SOUND_LIMIT` materials, is a
 * `RangeError`.
 */
export function resolveSurfaceSoundRecords(
  sounds: CompiledSurfaceSounds,
  materialIds: readonly string[],
): readonly SurfaceSound[] {
  const missing = materialIds.filter((id) => !Object.hasOwn(sounds.surfaces, id));
  if (missing.length) throw new RangeError(`Surface sounds are missing material IDs: ${missing.join(', ')}`);
  const unknown = Object.keys(sounds.surfaces).filter((id) => !materialIds.includes(id));
  if (unknown.length) throw new RangeError(`Surface sounds name unknown material IDs: ${unknown.join(', ')}`);
  if (materialIds.length > SURFACE_SOUND_LIMIT) throw new RangeError('Too many surface sounds for transport');
  return Object.freeze(materialIds.map((id) => sounds.surfaces[id]!));
}

/** The tire voice's surfaces: material IDs in catalog order and their sound records at the same numbers. */
export interface TireSurfaceSounds {
  readonly materialIds: readonly string[];
  readonly surfaces: readonly SurfaceSound[];
}
