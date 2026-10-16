import { DefinitionDomainError } from '../core/admission.js';
import { ROLLING_SETTING_RANGES } from './tire-rolling-acoustics.js';

/**
 * One sound record per material ID: the rolling generator's surface palette and the friction system's input, two
 * fractions in [0, 1] of the UNIFIED maxima: `roughness` of the forcing `noiseForcePerSecond` and `susceptibility` of
 * the feedback `feedbackMaximumPerSecond`. Listening values, NOT measured surface properties.
 */
export type SurfaceSound = Readonly<{
  rolling: Readonly<{ low: number; high: number; textureLengthMeters: number; textureDepth: number }>;
  friction: Readonly<{ roughness: number; susceptibility: number }>;
}>;

/**
 * The rolling palette's domain, derived from the rolling generator: a band's excitation is level (below 1) × gain ×
 * `low` or `high` × modulation, and the texture modulation is 1 + depth × u with u in [-1, 1]. `textureDepth` at most 1
 * keeps the modulation in [0, 2], so `low` and `high` at most 1 / (2 × the largest rolling gain) keep every excitation
 * within the noise band's [0, 1] for every admitted rolling setting.
 */
export const ROLLING_PALETTE_LIMITS = Object.freeze({
  level: 1 / (2 * ROLLING_SETTING_RANGES.gain.max),
  textureDepth: 1,
});

/** The transport bound on surface numbers: the worklet's `surfaceIndex` parameter range. */
export const SURFACE_SOUND_LIMIT = 256;

/**
 * The one value check of a surface sound: every number finite and at least 0, `textureLengthMeters` above 0,
 * `low`, `high` and `textureDepth` within `ROLLING_PALETTE_LIMITS` and the friction input within [0, 1], each refused
 * at its own field (`rolling/low`, `friction/roughness`). Returns a detached frozen record.
 */
export function compileSurfaceSound(record: SurfaceSound): SurfaceSound {
  const { rolling } = record;
  const most = {
    low: ROLLING_PALETTE_LIMITS.level,
    high: ROLLING_PALETTE_LIMITS.level,
    textureLengthMeters: Infinity,
    textureDepth: ROLLING_PALETTE_LIMITS.textureDepth,
  };
  for (const key of ['low', 'high', 'textureLengthMeters', 'textureDepth'] as const) {
    const value = rolling[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new DefinitionDomainError(`rolling/${key}`, `${key} must be finite and nonnegative`);
    if (value > most[key]) throw new DefinitionDomainError(`rolling/${key}`, `${key} must be at most ${most[key]}`);
  }
  if (rolling.textureLengthMeters <= 0)
    throw new DefinitionDomainError('rolling/textureLengthMeters', 'textureLengthMeters must be above 0');
  const { friction } = record;
  for (const key of ['roughness', 'susceptibility'] as const) {
    const value = friction[key];
    if (typeof value !== 'number' || !(value >= 0 && value <= 1))
      throw new DefinitionDomainError(`friction/${key}`, `${key} must be within [0, 1]`);
  }
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
