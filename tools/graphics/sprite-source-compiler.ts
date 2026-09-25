import { readIndexedPalette } from '../../src/image/indexed-image.js';
import type { PaletteMixture } from '../../src/image/image-filter.js';
import { createSpriteAreaFilter } from './sprite-area-filter.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';

/** Shared decoded-image admission, also checked by file adapters before allocation. */
export const SPRITE_SOURCE_PIXEL_LIMIT = 16 * 1024 * 1024;

export interface SourceImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint32Array;
}

export interface SpriteCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Editable source settings; compilation rejects incomplete or invalid values. */
export interface SpriteSourceRecipe {
  readonly format: 'superoutride.sprite-source';
  readonly version: 2;
  readonly name: string;
  readonly crop: SpriteCrop;
  readonly widthMeters: number | null;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly paletteRgb555: readonly number[];
}

/** Crop and normalize decoded straight-alpha sRGB pixels into one editable indexed master. */
export function normalizeSpriteSource(image: SourceImage, recipe: unknown): SpriteLodDocument {
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width * image.height > SPRITE_SOURCE_PIXEL_LIMIT ||
    !(image.pixels instanceof Uint32Array) ||
    image.pixels.length !== image.width * image.height
  )
    throw new RangeError('source image requires positive dimensions and matching RGBA pixels');
  const settings = record(recipe, ['format', 'version', 'name', 'crop', 'widthMeters', 'anchor', 'paletteRgb555']);
  if (settings.format !== 'superoutride.sprite-source' || settings.version !== 2)
    throw new RangeError('unsupported sprite source recipe format/version');
  if (typeof settings.name !== 'string' || !settings.name.trim()) throw new RangeError('sprite name is required');
  const crop = record(settings.crop, ['x', 'y', 'width', 'height']);
  const x = finite(crop.x),
    y = finite(crop.y),
    cropWidth = finite(crop.width),
    cropHeight = finite(crop.height);
  if (
    ![x, y, cropWidth, cropHeight].every(Number.isSafeInteger) ||
    x < 0 ||
    y < 0 ||
    cropWidth < 1 ||
    cropHeight < 1 ||
    x + cropWidth > image.width ||
    y + cropHeight > image.height
  )
    throw new RangeError('crop must be an integer rectangle inside the source');
  const widthMeters = finite(settings.widthMeters);
  const width = Math.round(widthMeters * SPRITE_SOURCE_TEXELS_PER_METER);
  const scale = width / cropWidth,
    height = Math.ceil((cropHeight * width) / cropWidth);
  // Authoring admission limit, independent of the runtime interchange and device budget.
  if (
    widthMeters <= 0 ||
    !Number.isSafeInteger(width) ||
    width < 1 ||
    !Number.isSafeInteger(height) ||
    width * height > 1024 * 1024
  )
    throw new RangeError('normalized master must contain 1 to 1048576 texels');
  const anchor = record(settings.anchor, ['x', 'y']);
  const anchorX = (finite(anchor.x) + 0.5 - x) * scale - 0.5;
  const anchorY = (finite(anchor.y) + 0.5 - y) * scale - 0.5;
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) throw new RangeError('mapped anchor must be finite');
  const paletteRgb555 = readSpritePaletteRgb555(settings.paletteRgb555);
  const filter = createSpriteAreaFilter(paletteRgb555);
  const indices = Array<number>(width * height).fill(0);
  for (let dy = 0; dy < height; dy++)
    for (let dx = 0; dx < width; dx++) {
      // Integer overlap units avoid fractional resampling gaps at fully opaque boundaries.
      const x0 = x * width + dx * cropWidth,
        y0 = y * width + dy * cropWidth;
      const x1 = Math.min((x + cropWidth) * width, x0 + cropWidth);
      const y1 = Math.min((y + cropHeight) * width, y0 + cropWidth);
      // A fractional final row is transparent padding in the new master, not vertical stretching.
      indices[dy * width + dx] = filter(image.pixels, image.width, x0, y0, x1, y1, cropWidth * cropWidth, width);
    }
  return {
    format: 'superoutride.sprite-lod',
    version: 4,
    name: settings.name,
    width,
    height,
    anchorX,
    anchorY,
    defaultPalette: 'original',
    palettes: { original: { colors: paletteRgb555 } },
    levels: [{ paletteRgb555, indices, mixtures: spriteIdentityMixtures() }],
  };
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RangeError('source recipe record required');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(object, key)))
    throw new RangeError('source recipe has missing or unknown fields');
  return object;
}

function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new RangeError('source recipe numbers must be finite');
  return value;
}

/** One identity mapping for normalized masters, including an unused transparent slot. */
export function spriteIdentityMixtures(): PaletteMixture[] {
  return Array.from({ length: 16 }, (_, index) => (index === 0 ? [] : [[index, 1]]));
}

export function readSpritePaletteRgb555(value: unknown): number[] {
  return [...readIndexedPalette(value)];
}
