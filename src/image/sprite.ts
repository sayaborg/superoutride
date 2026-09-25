import { IndexedPattern, readIndexedPalette, indexedPaletteRgba } from './indexed-image.js';
import { evaluatePaletteMixture, linearToRgb555, selectImageLodLevel, type PaletteMixture } from './image-filter.js';
// Dimensionless weight sum: 10^-10 normalization budget for serialized mixture sums.
// Positive unit-total sums accumulate O(n*eps) error; this allows about 4.5e5 eps.
const MIXTURE_WEIGHT_SUM_TOLERANCE = 1e-10;

export const SPRITE_SOURCE_TEXELS_PER_METER = 40;

export interface SpritePalette {
  readonly colors: readonly number[];
}

/** Named colors participating in LOD compilation. */
export function spritePaletteStates(palettes: Readonly<Record<string, SpritePalette>>): readonly (readonly number[])[] {
  return Object.values(palettes).map((palette) => palette.colors);
}

export interface SpriteLodDocument {
  readonly format: 'superoutride.sprite-lod';
  readonly version: 4;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly defaultPalette: string;
  readonly palettes: Readonly<Record<string, SpritePalette>>;
  readonly levels: readonly {
    readonly paletteRgb555: readonly number[];
    readonly indices: readonly number[];
    readonly mixtures: readonly PaletteMixture[];
  }[];
}

export function spriteLodLayout(width: number, height: number) {
  if (!(width > 0 && height > 0 && Number.isInteger(width) && Number.isInteger(height)))
    throw new RangeError('sprite dimensions must be positive integers');
  if (!Number.isSafeInteger(width * height)) throw new RangeError('sprite extent is too large');
  return Array.from({ length: Math.ceil(Math.log2(Math.max(width, height))) + 1 }, (_, k) => ({
    width: Math.ceil(width / 2 ** k),
    height: Math.ceil(height / 2 ** k),
  }));
}

interface SpriteLevel {
  readonly width: number;
  readonly height: number;
  readonly pattern: IndexedPattern;
  readonly paletteRgb555: readonly number[];
  readonly paletteRgba: readonly number[];
  readonly mixtures: readonly PaletteMixture[];
}
export interface SpriteAsset {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly worldWidthMeters: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly defaultPalette: string;
  readonly palettes: Readonly<Record<string, SpritePalette>>;
  readonly levels: readonly SpriteLevel[];
}

/** Completed-image admission: filtering is never performed by the reader or blitter. */
export function readSpriteLodAsset(value: unknown, paletteSuffix: readonly number[] = []): SpriteAsset {
  const document = spriteRecord(value, [
    'format',
    'version',
    'name',
    'width',
    'height',
    'anchorX',
    'anchorY',
    'defaultPalette',
    'palettes',
    'levels',
  ]);
  if (document.format !== 'superoutride.sprite-lod' || document.version !== 4)
    throw new RangeError('unsupported sprite LOD format/version');
  if (typeof document.name !== 'string' || !document.name.trim()) throw new RangeError('sprite name is required');
  const { width, height, anchorX, anchorY } = document;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new RangeError('sprite master dimensions must be positive safe integers');
  if (
    typeof anchorX !== 'number' ||
    typeof anchorY !== 'number' ||
    !Number.isFinite(anchorX) ||
    !Number.isFinite(anchorY)
  )
    throw new RangeError('sprite anchor must be finite');
  const layout = spriteLodLayout(width, height);
  if (!Array.isArray(document.levels) || document.levels.length < 1 || document.levels.length > layout.length)
    throw new RangeError('sprite LOD count exceeds the finite master pyramid');
  if (!document.palettes || typeof document.palettes !== 'object' || Array.isArray(document.palettes))
    throw new RangeError('sprite palettes must be a named dictionary');
  const palettes = Object.freeze(
    Object.fromEntries(
      Object.entries(document.palettes).map(([name, value]) => {
        if (!name.trim() || name !== name.trim()) throw new RangeError('palette name must be nonempty and trimmed');
        const entry = spriteRecord(value, ['colors']);
        const colors = readPalette(entry.colors, paletteSuffix);
        return [name, Object.freeze({ colors })];
      }),
    ),
  );
  if (typeof document.defaultPalette !== 'string' || !Object.hasOwn(palettes, document.defaultPalette))
    throw new RangeError('default palette must name an image palette');
  const base = readPalette(
    spriteRecord(document.levels[0], ['paletteRgb555', 'indices', 'mixtures']).paletteRgb555,
    paletteSuffix,
  );
  if (!base.every((color, i) => color === palettes[document.defaultPalette as string]!.colors[i]))
    throw new RangeError('master colors must equal the named default palette');
  const levels = Array.from(document.levels, (value: unknown, k: number) => {
    const level = spriteRecord(value, ['paletteRgb555', 'indices', 'mixtures']);
    const paletteRgb555 = k === 0 ? base : readIndexedPalette(level.paletteRgb555);
    if (!Array.isArray(level.mixtures) || level.mixtures.length !== 16)
      throw new RangeError('sprite palette requires 16 mixture slots');
    const mixtures = Object.freeze(
      Array.from(level.mixtures, (value: unknown, slot: number): PaletteMixture => {
        if (!Array.isArray(value)) throw new RangeError('sprite mixture must be an array');
        let total = 0;
        const used = new Set<number>();
        const mixture = Array.from(value, (pair: unknown): readonly [number, number] => {
          if (
            !Array.isArray(pair) ||
            pair.length !== 2 ||
            !Number.isInteger(pair[0]) ||
            pair[0] < 1 ||
            pair[0] > 15 ||
            typeof pair[1] !== 'number' ||
            !Number.isFinite(pair[1]) ||
            !(pair[1] > 0) ||
            pair[1] > 1 ||
            used.has(pair[0])
          )
            throw new RangeError('sprite mixture requires unique opaque slots and positive finite weights');
          used.add(pair[0]);
          total += pair[1];
          return Object.freeze([pair[0], pair[1]] as const);
        });
        if (
          (slot === 0 && mixture.length !== 0) ||
          (mixture.length > 0 && Math.abs(total - 1) > MIXTURE_WEIGHT_SUM_TOLERANCE)
        )
          throw new RangeError('opaque palette mixture weights must sum to one; slot zero is unused');
        if (k === 0 && slot > 0 && (mixture.length !== 1 || mixture[0]![0] !== slot || mixture[0]![1] !== 1))
          throw new RangeError('master palette mixtures must retain semantic slot identity');
        if (k > 0 && mixture.length && linearToRgb555(...evaluatePaletteMixture(mixture, base)) !== paletteRgb555[slot])
          throw new RangeError('level palette must match its linear master mixture');
        return Object.freeze(mixture);
      }),
    );
    const { width: w, height: h } = layout[k]!;
    const pattern = new IndexedPattern(w, h, level.indices as readonly number[]);
    for (let i = 0; i < w * h; i++) {
      const index = pattern.indexAt(i);
      if (index && !mixtures[index]!.length) throw new RangeError('opaque index requires a palette mixture');
    }
    return Object.freeze({
      width: w,
      height: h,
      pattern,
      paletteRgb555,
      paletteRgba: indexedPaletteRgba(paletteRgb555),
      mixtures,
    });
  });
  return Object.freeze({
    name: document.name,
    width,
    height,
    anchorX,
    anchorY,
    worldWidthMeters: width / SPRITE_SOURCE_TEXELS_PER_METER,
    defaultPalette: document.defaultPalette,
    palettes,
    levels: Object.freeze(levels),
  });
}

/** Named color and lamp state are resolved once, before rendering. */
export function createSpritePalette(
  asset: SpriteAsset,
  name: string,
  paletteSuffix: readonly number[] = [],
): SpriteAsset {
  const palette = asset.palettes[name]!;
  return applySpritePalette(asset, [...palette.colors.slice(0, 16 - paletteSuffix.length), ...paletteSuffix]);
}

function applySpritePalette(asset: SpriteAsset, base: readonly number[]): SpriteAsset {
  const levels = asset.levels.map((level) => {
    const paletteRgb555 = Object.freeze(
      level.mixtures.map((mixture, i) =>
        i === 0 || !mixture.length ? 0 : linearToRgb555(...evaluatePaletteMixture(mixture, base)),
      ),
    );
    return Object.freeze({ ...level, paletteRgb555, paletteRgba: indexedPaletteRgba(paletteRgb555) });
  });
  return Object.freeze({ ...asset, levels: Object.freeze(levels) });
}

/** A containing format owns any trailing reserved colors; authored arrays must omit them. */
function readPalette(value: unknown, suffix: readonly number[]): readonly number[] {
  if (!Array.isArray(value) || value.length !== 16 - suffix.length)
    throw new RangeError('image palette must omit externally reserved slots');
  return readIndexedPalette([...value, ...suffix]);
}

function spriteRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError('sprite record is required');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(record, key)))
    throw new RangeError('sprite record has missing or unknown fields');
  return record;
}

/** Geometric-mean transitions; the exact boundary selects the coarser level. */
export function selectSpriteLevel(asset: SpriteAsset, pixelsPerMeter: number): number {
  const scale = pixelsPerMeter * (asset.worldWidthMeters / asset.width);
  return selectImageLodLevel(scale, asset.levels.length - 1);
}
