import { PIXEL_EDGE_TOLERANCE } from '../core/tolerances.js';
import { SoftwareSurface } from './software-surface.js';
import { rgb555ToRgba } from './rgb555.js';

export const SPRITE_TRANSPARENT = 0;
export const SPRITE_SOURCE_TEXELS_PER_METER = 40;

export interface SpriteLodDocument {
  readonly format: 'superoutride.sprite-lod';
  readonly version: 1;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly levels: readonly { readonly paletteRgb555: readonly number[]; readonly indices: readonly number[] }[];
}

/** Shared untrimmed storage lattice for readers, offline compilers and fixture authoring. */
export function spriteLodLayout(width: number, height: number) {
  if (!(width > 0 && height > 0 && Number.isInteger(width) && Number.isInteger(height))) {
    throw new RangeError('sprite dimensions must be positive integers');
  }
  if (!Number.isSafeInteger(width * height)) throw new RangeError('sprite extent is too large');
  return Array.from({ length: Math.ceil(Math.log2(Math.max(width, height))) + 1 }, (_, k) => ({
    width: Math.ceil(width / 2 ** k),
    height: Math.ceil(height / 2 ** k),
  }));
}

interface SpriteLevel {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint32Array;
}

export interface SpriteAsset {
  readonly name: string;
  /** Logical master extent, independent of the selected storage level. */
  readonly width: number;
  readonly height: number;
  /** Physical width represented by the bitmap. No arbitrary visual scale multiplier exists. */
  readonly worldWidthMeters: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly levels: readonly SpriteLevel[];
}

interface SpriteDrawStats {
  outputSamples: number;
  writtenPixels: number;
  clipped: boolean;
}

/** Optional workload observer. It does not change sprite visibility or rasterization. */
export type SpriteScanlineObserver = (screenY: number, outputSamples: number, writtenPixels: number) => void;

export function createSpriteAsset(
  name: string,
  width: number,
  height: number,
  pixels: Uint32Array,
  anchorX: number | undefined,
  anchorY: number | undefined,
  worldWidthMeters: number,
): SpriteAsset {
  return assembleSpriteAsset(name, width, height, [pixels.slice()], anchorX, anchorY, worldWidthMeters);
}

function assembleSpriteAsset(
  name: string,
  width: number,
  height: number,
  levels: readonly Uint32Array[],
  anchorX: number | undefined,
  anchorY: number | undefined,
  worldWidthMeters: number,
): SpriteAsset {
  const layout = spriteLodLayout(width, height);
  if (levels.length < 1 || levels.length > layout.length) {
    throw new RangeError('sprite LOD count exceeds the finite master pyramid');
  }
  const compiledLevels = levels.map((pixels, k) => {
    const { width: levelWidth, height: levelHeight } = layout[k]!;
    if (pixels.length !== levelWidth * levelHeight) throw new RangeError('sprite pixel buffer size mismatch');
    return Object.freeze({ width: levelWidth, height: levelHeight, pixels });
  });
  const resolvedAnchorX = anchorX ?? (width - 1) * 0.5;
  const resolvedAnchorY = anchorY ?? height - 1;
  if (!Number.isFinite(resolvedAnchorX) || !Number.isFinite(resolvedAnchorY))
    throw new RangeError('sprite anchor must be finite');
  if (!(worldWidthMeters > 0) || !Number.isFinite(worldWidthMeters)) {
    throw new RangeError('sprite worldWidthMeters must be finite and > 0');
  }
  return Object.freeze({
    name,
    width,
    height,
    worldWidthMeters,
    anchorX: resolvedAnchorX,
    anchorY: resolvedAnchorY,
    levels: Object.freeze(compiledLevels),
  });
}

/** Load completed indexed RGB555 LODs. No filtering, quantization or metric inference from a lower level. */
export function readSpriteLodAsset(value: unknown): SpriteAsset {
  const source = spriteRecord(value, ['format', 'version', 'name', 'width', 'height', 'anchorX', 'anchorY', 'levels']);
  if (source.format !== 'superoutride.sprite-lod' || source.version !== 1) {
    throw new RangeError('unsupported sprite LOD format/version');
  }
  if (typeof source.name !== 'string' || !source.name.trim()) throw new RangeError('sprite name is required');
  const { width, height, anchorX, anchorY } = source;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    !Number.isSafeInteger(width * height)
  )
    throw new RangeError('sprite master dimensions must be positive safe integers');
  if (
    typeof anchorX !== 'number' ||
    typeof anchorY !== 'number' ||
    !Number.isFinite(anchorX) ||
    !Number.isFinite(anchorY)
  ) {
    throw new RangeError('sprite anchor must be finite');
  }
  const layout = spriteLodLayout(width, height);
  if (!Array.isArray(source.levels) || source.levels.length < 1 || source.levels.length > layout.length) {
    throw new RangeError('sprite LOD count exceeds the finite master pyramid');
  }
  const levels = Array.from(source.levels, (value: unknown, k: number) => {
    const level = spriteRecord(value, ['paletteRgb555', 'indices']);
    const paletteRgb555 = readSpritePaletteRgb555(level.paletteRgb555);
    const { indices } = level;
    const length = layout[k]!.width * layout[k]!.height;
    if (!Array.isArray(indices) || indices.length !== length || !spriteIntegerArray(indices, paletteRgb555.length)) {
      throw new RangeError('sprite index buffer must match the LOD lattice and palette');
    }
    const palette = [SPRITE_TRANSPARENT, ...paletteRgb555.map(rgb555ToRgba)];
    return Uint32Array.from(indices, (index: number) => palette[index]!);
  });
  return assembleSpriteAsset(
    source.name,
    width,
    height,
    levels,
    anchorX,
    anchorY,
    width / SPRITE_SOURCE_TEXELS_PER_METER,
  );
}

/** Shared palette contract for completed images and source-image compilation. */
export function readSpritePaletteRgb555(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length > 15 ||
    !spriteIntegerArray(value, 0x7fff) ||
    new Set(value).size !== value.length
  )
    throw new RangeError('sprite palette must contain at most 15 distinct RGB555 colors');
  return [...value];
}

function spriteIntegerArray(values: readonly unknown[], maximum: number): boolean {
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maximum) return false;
  }
  return true;
}

function spriteRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError('sprite record is required');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(record, key))) {
    throw new RangeError('sprite record has missing or unknown fields');
  }
  return record;
}

/** Geometric-mean transitions; the exact boundary selects the coarser level. */
export function selectSpriteLevel(asset: SpriteAsset, pixelsPerMeter: number): number {
  const scale = pixelsPerMeter * (asset.worldWidthMeters / asset.width);
  if (!(scale > 0) || !Number.isFinite(scale)) throw new RangeError('sprite scale must be finite and positive');
  let level = 0;
  let boundary = Math.SQRT1_2;
  while (level + 1 < asset.levels.length && scale <= boundary) {
    level += 1;
    boundary *= 0.5;
  }
  return level;
}

export function countOpaqueSpriteColors(asset: SpriteAsset): number {
  return Math.max(
    ...asset.levels.map((level) => {
      const colors = new Set<number>();
      for (const pixel of level.pixels) if (pixel !== SPRITE_TRANSPARENT) colors.add(pixel >>> 0);
      return colors.size;
    }),
  );
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
      const color = level.pixels[sourceRow + sx]!;
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
