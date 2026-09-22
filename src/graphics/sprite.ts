import { PIXEL_EDGE_TOLERANCE } from '../core/tolerances.js';
import { SoftwareSurface } from './software-surface.js';
import { IndexedPattern, readIndexedPalette, indexedPaletteRgba } from './indexed-image.js';
import { evaluatePaletteMixture, linearToRgb555, selectImageLodLevel, type PaletteMixture } from './image-filter.js';

const SPRITE_TRANSPARENT = 0;
export const SPRITE_SOURCE_TEXELS_PER_METER = 40;

export interface SpriteLodDocument {
  readonly format: 'superoutride.sprite-lod';
  readonly version: 2;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly variants: readonly (readonly number[])[];
  readonly levels: readonly {
    readonly paletteRgb555: readonly number[];
    readonly indices: readonly number[];
    readonly mixtures: readonly PaletteMixture[];
  }[];
}

/** One identity mapping for normalized masters, including an unused transparent slot. */
export function spriteIdentityMixtures(): PaletteMixture[] {
  return Array.from({ length: 16 }, (_, index) => (index === 0 ? [] : [[index, 1]]));
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
  readonly paletteChoices: readonly (readonly number[])[];
  readonly levels: readonly SpriteLevel[];
}
interface SpriteDrawStats {
  outputSamples: number;
  writtenPixels: number;
  clipped: boolean;
}
export type SpriteScanlineObserver = (screenY: number, outputSamples: number, writtenPixels: number) => void;

/** Completed-image admission: filtering is never performed by the reader or blitter. */
export function readSpriteLodAsset(value: unknown): SpriteAsset {
  const source = spriteRecord(value, [
    'format',
    'version',
    'name',
    'width',
    'height',
    'anchorX',
    'anchorY',
    'variants',
    'levels',
  ]);
  if (source.format !== 'superoutride.sprite-lod' || source.version !== 2)
    throw new RangeError('unsupported sprite LOD format/version');
  if (typeof source.name !== 'string' || !source.name.trim()) throw new RangeError('sprite name is required');
  const { width, height, anchorX, anchorY } = source;
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
  if (!Array.isArray(source.levels) || source.levels.length < 1 || source.levels.length > layout.length)
    throw new RangeError('sprite LOD count exceeds the finite master pyramid');
  if (!Array.isArray(source.variants)) throw new RangeError('sprite variants must list every alternate base palette');
  const base = readIndexedPalette(
    spriteRecord(source.levels[0], ['paletteRgb555', 'indices', 'mixtures']).paletteRgb555,
  );
  const paletteChoices = Object.freeze([base, ...Array.from(source.variants, readIndexedPalette)]);
  const levels = Array.from(source.levels, (value: unknown, k: number) => {
    const level = spriteRecord(value, ['paletteRgb555', 'indices', 'mixtures']);
    const paletteRgb555 = readIndexedPalette(level.paletteRgb555);
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
        if ((slot === 0 && mixture.length !== 0) || (mixture.length > 0 && Math.abs(total - 1) > 1e-10))
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
    name: source.name,
    width,
    height,
    anchorX,
    anchorY,
    worldWidthMeters: width / SPRITE_SOURCE_TEXELS_PER_METER,
    paletteChoices,
    levels: Object.freeze(levels),
  });
}

/** Calculate an instance's palette once. Patterns and mixture identities remain shared and immutable. */
export function createSpritePaletteVariant(asset: SpriteAsset, palette: readonly number[]): SpriteAsset {
  const base = readIndexedPalette(palette);
  if (!asset.paletteChoices.some((choice) => choice.every((value, i) => i === 0 || value === base[i])))
    throw new RangeError('palette variant was not included when compiling these LOD patterns');
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

export function readSpritePaletteRgb555(value: unknown): number[] {
  return [...readIndexedPalette(value)];
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

export function drawScaledSprite(
  target: SoftwareSurface,
  asset: SpriteAsset,
  xAnchor: number,
  yAnchor: number,
  pixelsPerMeter: number,
  scanlineObserver?: SpriteScanlineObserver,
): SpriteDrawStats {
  const scale = pixelsPerMeter * (asset.worldWidthMeters / asset.width);
  if (!(scale > 0) || !Number.isFinite(scale)) {
    return { outputSamples: 0, writtenPixels: 0, clipped: true };
  }
  const levelIndex = selectSpriteLevel(asset, pixelsPerMeter);
  const level = asset.levels[levelIndex]!;
  const sourceStep = 2 ** levelIndex;

  const leftBoundary = xAnchor - scale * (asset.anchorX + 0.5);
  const topBoundary = yAnchor - scale * (asset.anchorY + 0.5);
  const rightBoundary = leftBoundary + scale * asset.width;
  const bottomBoundary = topBoundary + scale * asset.height;

  const unclippedX0 = Math.ceil(leftBoundary - 0.5 - PIXEL_EDGE_TOLERANCE);
  const unclippedX1 = Math.floor(rightBoundary - 0.5 - PIXEL_EDGE_TOLERANCE);
  const unclippedY0 = Math.ceil(topBoundary - 0.5 - PIXEL_EDGE_TOLERANCE);
  const unclippedY1 = Math.floor(bottomBoundary - 0.5 - PIXEL_EDGE_TOLERANCE);

  const x0 = Math.max(0, unclippedX0);
  const x1 = Math.min(target.width - 1, unclippedX1);
  const y0 = Math.max(0, unclippedY0);
  const y1 = Math.min(target.height - 1, unclippedY1);

  if (x1 < x0 || y1 < y0) {
    return { outputSamples: 0, writtenPixels: 0, clipped: true };
  }

  const invScale = 1 / scale;
  let outputSamples = 0;
  let writtenPixels = 0;

  for (let y = y0; y <= y1; y += 1) {
    const sourceY = asset.anchorY + (y + 0.5 - yAnchor) * invScale;
    const sy = Math.floor((sourceY + 0.5) / sourceStep);
    if (sy < 0 || sy >= level.height) continue;
    const targetRow = y * target.width;
    const sourceRow = sy * level.width;
    let rowOutputSamples = 0;
    let rowWrittenPixels = 0;

    for (let x = x0; x <= x1; x += 1) {
      const sourceX = asset.anchorX + (x + 0.5 - xAnchor) * invScale;
      const sx = Math.floor((sourceX + 0.5) / sourceStep);
      if (sx < 0 || sx >= level.width) continue;
      outputSamples += 1;
      rowOutputSamples += 1;
      const color = level.paletteRgba[level.pattern.indexAt(sourceRow + sx)]!;
      if (color === SPRITE_TRANSPARENT) continue;
      target.pixels[targetRow + x] = color;
      writtenPixels += 1;
      rowWrittenPixels += 1;
    }

    if (scanlineObserver && (rowOutputSamples > 0 || rowWrittenPixels > 0)) {
      scanlineObserver(y, rowOutputSamples, rowWrittenPixels);
    }
  }

  return {
    outputSamples,
    writtenPixels,
    clipped: x0 !== unclippedX0 || x1 !== unclippedX1 || y0 !== unclippedY0 || y1 !== unclippedY1,
  };
}
