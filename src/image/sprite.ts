import {
  readArray,
  readDictionary,
  readDocument,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
} from '../core/admission.js';
import { IndexedPattern, readIndexedPalette, readPatternSymbols } from './indexed-image.js';
import { evaluatePaletteMixture, linearToRgb555, selectImageLodLevel, type PaletteMixture } from './image-filter.js';
// Dimensionless weight sum: 10^-10 normalization budget for serialized mixture sums.
// Positive unit-total sums accumulate O(n*eps) error; this allows about 4.5e5 eps.
const MIXTURE_WEIGHT_SUM_TOLERANCE = 1e-10;

/**
 * Texels per metre at an image's base point in its level 0: level `k` has `40 / 2^k`, the scale the picture contract's
 * size `k` is drawn at ([Image assets](../../docs/image-assets.md#picture-contract)).
 */
export const SPRITE_SOURCE_TEXELS_PER_METER = 40;

export interface SpritePalette {
  readonly colors: readonly number[];
}

/** One frame of indexed texels with its anchor, the image's base point, in texel-centre coordinates. */
export interface SpriteFrame {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly pattern: IndexedPattern;
}

/**
 * One level of a drawn image, level `k` at `40 / 2^k` texels per metre at its base point: its picture in resolved
 * colors and its shadow, a frame drawn at the same scale with its anchor at the base point's ground (null for none).
 */
export interface SpriteLevel extends SpriteFrame {
  readonly paletteRgb555: readonly number[];
  readonly shadow: SpriteFrame | null;
}

/** Which way a board repeats within its plane to the screen's edge. */
export type SpriteExtend = 'left' | 'right';

/**
 * An image the renderer draws: its levels, level `k` at `40 / 2^k` texels per metre, and, for a board extending
 * sideways, the way it repeats.
 */
export interface SpriteAsset {
  readonly name: string;
  readonly levels: readonly SpriteLevel[];
  readonly extend?: SpriteExtend;
}

/** A shadow master and its build-generated levels: binary frames, nonzero opaque. */
export interface SpriteShadowDocument {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly levels: readonly { readonly indices: readonly number[] }[];
}

export interface SpriteLodDocument {
  readonly format: 'superoutride.sprite-lod';
  readonly version: 5;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Its base point across; down, the middle of its bottom row's lower edge, `height − 0.5`. */
  readonly anchorX: number;
  readonly defaultPalette: string;
  readonly palettes: Readonly<Record<string, SpritePalette>>;
  readonly levels: readonly {
    readonly paletteRgb555: readonly number[];
    readonly indices: readonly number[];
    readonly mixtures: readonly PaletteMixture[];
  }[];
  readonly shadow?: SpriteShadowDocument;
  /** A board extending sideways: the way it repeats. */
  readonly extend?: SpriteExtend;
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

/** A master anchor coordinate's place in level `k`: `(a + 0.5) / 2^k - 0.5`. */
export function levelAnchor(anchor: number, k: number): number {
  return (anchor + 0.5) / 2 ** k - 0.5;
}

interface SpriteLodLevel extends SpriteLevel {
  readonly mixtures: readonly PaletteMixture[];
}

/**
 * A course image: a master and its direct-master pyramid, with its named palettes and each level's mixtures of them.
 * Its master extent at 40 texels/m is its logical size; its level `k` frames are `ceil(W / 2^k)` by `ceil(H / 2^k)`.
 */
export interface SpriteLodAsset extends SpriteAsset {
  readonly width: number;
  readonly height: number;
  readonly worldWidthMeters: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly defaultPalette: string;
  readonly palettes: Readonly<Record<string, SpritePalette>>;
  readonly levels: readonly SpriteLodLevel[];
}

/** One frame's row-major indices of a declared extent, as a pattern. */
function readFrameIndices(value: unknown, path: string, width: number, height: number): IndexedPattern {
  return new IndexedPattern(width, height, readPatternSymbols(value, path, width * height));
}

/** Completed-image admission: filtering is never performed by the reader or blitter. */
export function readSpriteLodAsset(value: unknown): SpriteLodAsset {
  const document = readDocument(
    value,
    [
      'format',
      'version',
      'name',
      'width',
      'height',
      'anchorX',
      'defaultPalette',
      'palettes',
      'levels',
      ...(typeof value === 'object' && value !== null && Object.hasOwn(value, 'shadow') ? ['shadow'] : []),
      ...(typeof value === 'object' && value !== null && Object.hasOwn(value, 'extend') ? ['extend'] : []),
    ],
    'superoutride.sprite-lod',
    5,
  );
  const name = readString(document.name, '/name');
  const { palettes, defaultPalette } = readSpritePalettes(document);
  const picture = readSpritePicture(document, '', palettes, defaultPalette, (count) =>
    document.shadow === undefined ? null : readShadow(document.shadow, count),
  );
  const extend = document.extend === undefined ? {} : { extend: readExtend(document.extend, '/extend') };
  return Object.freeze({ name, ...picture, defaultPalette, palettes, ...extend });
}

function readExtend(value: unknown, path: string): SpriteExtend {
  requireAdmission(value === 'left' || value === 'right', 'invalid_value', path, 'extend must be "left" or "right"');
  return value;
}

/** An image's named palettes and the default one, which names one of them. */
export function readSpritePalettes(document: Record<string, unknown>) {
  const palettes = readDictionary(document.palettes, '/palettes', (value, path) =>
    Object.freeze({ colors: readIndexedPalette(readRecord(value, path, ['colors']).colors, `${path}/colors`) }),
  );
  const defaultPalette = readString(document.defaultPalette, '/defaultPalette');
  requireAdmission(
    Object.hasOwn(palettes, defaultPalette),
    'unresolved_reference',
    '/defaultPalette',
    'Default palette must name an image palette',
  );
  return { palettes, defaultPalette };
}

/**
 * A picture at `path` in its image: its master extent and anchor, and its levels, every one at most the LOD's, the
 * master's colors those of the image's default palette; `readShadows` reads its shadow's levels, as many as its own.
 */
export function readSpritePicture(
  record: Record<string, unknown>,
  path: string,
  palettes: Readonly<Record<string, SpritePalette>>,
  defaultPalette: string,
  readShadows: (count: number) => readonly SpriteFrame[] | null,
) {
  const extent = { min: 1, max: Number.MAX_SAFE_INTEGER, integer: true };
  const width = readNumber(record.width, `${path}/width`, extent);
  const height = readNumber(record.height, `${path}/height`, extent);
  requireAdmission(
    Number.isSafeInteger(width * height),
    'resource_limit',
    `${path}/height`,
    'Sprite extent is too large',
  );
  const anchorX = readNumber(record.anchorX, `${path}/anchorX`);
  // A picture stands on its bottom edge: its anchor's height follows from its own.
  const anchorY = height - 0.5;
  const layout = spriteLodLayout(width, height);
  const levelDocuments = readArray(record.levels, `${path}/levels`, (level) => level, { min: 1, max: layout.length });
  const levelFields = ['paletteRgb555', 'indices', 'mixtures'];
  const base = readIndexedPalette(
    readRecord(levelDocuments[0], `${path}/levels/0`, levelFields).paletteRgb555,
    `${path}/levels/0/paletteRgb555`,
  );
  requireAdmission(
    base.every((color, i) => color === palettes[defaultPalette]!.colors[i]),
    'invalid_value',
    `${path}/levels/0/paletteRgb555`,
    'Master colors must equal the named default palette',
  );
  const shadows = readShadows(levelDocuments.length);
  const levels = levelDocuments.map((value, k) => {
    const at = `${path}/levels/${k}`;
    const level = readRecord(value, at, levelFields);
    const paletteRgb555 = k === 0 ? base : readIndexedPalette(level.paletteRgb555, `${at}/paletteRgb555`);
    const mixtures = Object.freeze(
      readArray(level.mixtures, `${at}/mixtures`, (value) => value, { length: 16 }).map((value, slot) =>
        readMixture(value, `${at}/mixtures/${slot}`, k, slot, base, paletteRgb555),
      ),
    );
    const { width: w, height: h } = layout[k]!;
    const indices = readPatternSymbols(level.indices, `${at}/indices`, w * h, {
      test: (index) => !index || mixtures[index]!.length > 0,
      message: 'Opaque index requires a palette mixture',
    });
    return Object.freeze({
      width: w,
      height: h,
      anchorX: levelAnchor(anchorX, k),
      anchorY: levelAnchor(anchorY, k),
      pattern: new IndexedPattern(w, h, indices),
      paletteRgb555,
      mixtures,
      shadow: shadows?.[k] ?? null,
    });
  });
  return {
    width,
    height,
    anchorX,
    anchorY,
    worldWidthMeters: width / SPRITE_SOURCE_TEXELS_PER_METER,
    levels: Object.freeze(levels),
  };
}

/**
 * A course image's shadow: a master frame whose anchor is the image's base point on the ground, and its levels, exactly
 * as many as the image's, level `k` of `ceil(w / 2^k)` by `ceil(h / 2^k)` texels anchored as the image's levels are.
 */
function readShadow(value: unknown, count: number): readonly SpriteFrame[] {
  const shadow = readRecord(value, '/shadow', ['width', 'height', 'anchorX', 'anchorY', 'levels']);
  const extent = { min: 1, max: 1 << 20, integer: true };
  const width = readNumber(shadow.width, '/shadow/width', extent);
  const height = readNumber(shadow.height, '/shadow/height', extent);
  const anchorX = readNumber(shadow.anchorX, '/shadow/anchorX');
  const anchorY = readNumber(shadow.anchorY, '/shadow/anchorY');
  const levels = readArray(shadow.levels, '/shadow/levels', (level, path) => readRecord(level, path, ['indices']), {
    length: count,
  });
  return Object.freeze(
    levels.map((level, k) => {
      const w = Math.ceil(width / 2 ** k),
        h = Math.ceil(height / 2 ** k);
      return Object.freeze({
        width: w,
        height: h,
        anchorX: levelAnchor(anchorX, k),
        anchorY: levelAnchor(anchorY, k),
        pattern: readFrameIndices(level.indices, `/shadow/levels/${k}/indices`, w, h),
      });
    }),
  );
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

/** A named color is resolved once before rendering: every level's palette evaluated in it. */
export function createSpritePalette(asset: SpriteLodAsset, name: string): SpriteLodAsset {
  const base = asset.palettes[name]!.colors;
  const levels = asset.levels.map((level) => {
    const paletteRgb555 = Object.freeze(
      level.mixtures.map((mixture, i) =>
        i === 0 || !mixture.length ? 0 : linearToRgb555(...evaluatePaletteMixture(mixture, base)),
      ),
    );
    return Object.freeze({ ...level, paletteRgb555 });
  });
  return Object.freeze({ ...asset, levels: Object.freeze(levels) });
}

/** Geometric-mean transitions; the exact boundary selects the coarser level. */
export function selectSpriteLevel(asset: SpriteAsset, pixelsPerMeter: number): number {
  return selectImageLodLevel(pixelsPerMeter / SPRITE_SOURCE_TEXELS_PER_METER, asset.levels.length - 1);
}
