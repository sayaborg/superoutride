import {
  readArray,
  readDictionary,
  readDocument,
  readNumber,
  readRecord,
  readRgb555,
  readString,
  requireAdmission,
} from '../core/admission.js';
import { IndexedPattern, readIndexedPalette, indexedPaletteRgba, readPatternSymbol } from './indexed-image.js';
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
  const document = readDocument(
    value,
    ['format', 'version', 'name', 'width', 'height', 'anchorX', 'anchorY', 'defaultPalette', 'palettes', 'levels'],
    'superoutride.sprite-lod',
    4,
  );
  const name = readString(document.name, '/name');
  const extent = { min: 1, max: Number.MAX_SAFE_INTEGER, integer: true };
  const width = readNumber(document.width, '/width', extent);
  const height = readNumber(document.height, '/height', extent);
  requireAdmission(Number.isSafeInteger(width * height), 'resource_limit', '/height', 'Sprite extent is too large');
  const anchorX = readNumber(document.anchorX, '/anchorX');
  const anchorY = readNumber(document.anchorY, '/anchorY');
  const layout = spriteLodLayout(width, height);
  const levelDocuments = readArray(document.levels, '/levels', (level) => level, { min: 1, max: layout.length });
  const palettes = readDictionary(document.palettes, '/palettes', (value, path) =>
    Object.freeze({ colors: readPalette(readRecord(value, path, ['colors']).colors, `${path}/colors`, paletteSuffix) }),
  );
  const defaultPalette = readString(document.defaultPalette, '/defaultPalette');
  requireAdmission(
    Object.hasOwn(palettes, defaultPalette),
    'unresolved_reference',
    '/defaultPalette',
    'Default palette must name an image palette',
  );
  const levelFields = ['paletteRgb555', 'indices', 'mixtures'];
  const base = readPalette(
    readRecord(levelDocuments[0], '/levels/0', levelFields).paletteRgb555,
    '/levels/0/paletteRgb555',
    paletteSuffix,
  );
  requireAdmission(
    base.every((color, i) => color === palettes[defaultPalette]!.colors[i]),
    'invalid_value',
    '/levels/0/paletteRgb555',
    'Master colors must equal the named default palette',
  );
  const levels = levelDocuments.map((value, k) => {
    const path = `/levels/${k}`;
    const level = readRecord(value, path, levelFields);
    const paletteRgb555 = k === 0 ? base : readIndexedPalette(level.paletteRgb555, `${path}/paletteRgb555`);
    const mixtures = Object.freeze(
      readArray(level.mixtures, `${path}/mixtures`, (value) => value, { length: 16 }).map((value, slot) =>
        readMixture(value, `${path}/mixtures/${slot}`, k, slot, base, paletteRgb555),
      ),
    );
    const { width: w, height: h } = layout[k]!;
    const indices = readArray(
      level.indices,
      `${path}/indices`,
      (value, at) => {
        const index = readPatternSymbol(value, at);
        requireAdmission(
          !index || mixtures[index]!.length > 0,
          'invalid_value',
          at,
          'Opaque index requires a palette mixture',
        );
        return index;
      },
      { length: w * h },
    );
    return Object.freeze({
      width: w,
      height: h,
      pattern: new IndexedPattern(w, h, indices),
      paletteRgb555,
      paletteRgba: indexedPaletteRgba(paletteRgb555),
      mixtures,
    });
  });
  return Object.freeze({
    name,
    width,
    height,
    anchorX,
    anchorY,
    worldWidthMeters: width / SPRITE_SOURCE_TEXELS_PER_METER,
    defaultPalette,
    palettes,
    levels: Object.freeze(levels),
  });
}

/** One palette slot's mixture of unique opaque master slots with positive weights summing to one. */
function readMixture(
  value: unknown,
  path: string,
  level: number,
  slot: number,
  base: readonly number[],
  paletteRgb555: readonly number[],
): PaletteMixture {
  const used = new Set<number>();
  let total = 0;
  const mixture = readArray(value, path, (pair, at) => {
    const [index, weight] = readArray(pair, at, (value) => value, { length: 2 });
    const source = readNumber(index, `${at}/0`, { min: 1, max: 15, integer: true });
    requireAdmission(!used.has(source), 'invalid_value', `${at}/0`, 'Mixture slots must be unique');
    used.add(source);
    const share = readNumber(weight, `${at}/1`, { min: 0, exclusiveMin: true, max: 1 });
    total += share;
    return Object.freeze([source, share] as const);
  });
  requireAdmission(slot > 0 || mixture.length === 0, 'invalid_value', path, 'Slot zero is unused');
  requireAdmission(
    mixture.length === 0 || Math.abs(total - 1) <= MIXTURE_WEIGHT_SUM_TOLERANCE,
    'invalid_value',
    path,
    'Opaque palette mixture weights must sum to one',
  );
  requireAdmission(
    level > 0 || slot === 0 || (mixture.length === 1 && mixture[0]![0] === slot && mixture[0]![1] === 1),
    'invalid_value',
    path,
    'Master palette mixtures must retain semantic slot identity',
  );
  requireAdmission(
    level === 0 || !mixture.length || linearToRgb555(...evaluatePaletteMixture(mixture, base)) === paletteRgb555[slot],
    'invalid_value',
    path,
    'Level palette must match its linear master mixture',
  );
  return mixture;
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
function readPalette(value: unknown, path: string, suffix: readonly number[]): readonly number[] {
  const colors = readArray(value, path, readRgb555, { length: 16 - suffix.length });
  return Object.freeze([...colors, ...suffix]);
}

/** Geometric-mean transitions; the exact boundary selects the coarser level. */
export function selectSpriteLevel(asset: SpriteAsset, pixelsPerMeter: number): number {
  const scale = pixelsPerMeter * (asset.worldWidthMeters / asset.width);
  return selectImageLodLevel(scale, asset.levels.length - 1);
}
