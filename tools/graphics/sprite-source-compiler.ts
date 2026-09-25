import { readDocument, readNumber, readRecord, readString, requireAdmission } from '../../src/core/admission.js';
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
  const settings = readDocument(
    recipe,
    ['format', 'version', 'name', 'crop', 'widthMeters', 'anchor', 'paletteRgb555'],
    'superoutride.sprite-source',
    2,
  );
  const name = readString(settings.name, '/name');
  const crop = readRecord(settings.crop, '/crop', ['x', 'y', 'width', 'height']);
  const x = readNumber(crop.x, '/crop/x', { min: 0, max: image.width - 1, integer: true }),
    y = readNumber(crop.y, '/crop/y', { min: 0, max: image.height - 1, integer: true }),
    cropWidth = readNumber(crop.width, '/crop/width', { min: 1, max: image.width - x, integer: true }),
    cropHeight = readNumber(crop.height, '/crop/height', { min: 1, max: image.height - y, integer: true });
  const widthMeters = readNumber(settings.widthMeters, '/widthMeters', { min: 0, exclusiveMin: true });
  const width = Math.round(widthMeters * SPRITE_SOURCE_TEXELS_PER_METER);
  const scale = width / cropWidth,
    height = Math.ceil((cropHeight * width) / cropWidth);
  // Authoring admission limit, independent of the runtime interchange and device budget.
  requireAdmission(
    Number.isSafeInteger(width) && width >= 1 && Number.isSafeInteger(height) && width * height <= 1024 * 1024,
    'resource_limit',
    '/widthMeters',
    'Normalized master must contain 1 to 1048576 texels',
  );
  const anchor = readRecord(settings.anchor, '/anchor', ['x', 'y']);
  const anchorX = (readNumber(anchor.x, '/anchor/x') + 0.5 - x) * scale - 0.5;
  const anchorY = (readNumber(anchor.y, '/anchor/y') + 0.5 - y) * scale - 0.5;
  requireAdmission(
    Number.isFinite(anchorX) && Number.isFinite(anchorY),
    'invalid_numeric_domain',
    '/anchor',
    'Mapped anchor must be finite',
  );
  const paletteRgb555 = readSpritePaletteRgb555(settings.paletteRgb555, '/paletteRgb555');
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
    name,
    width,
    height,
    anchorX,
    anchorY,
    defaultPalette: 'original',
    palettes: { original: { colors: paletteRgb555 } },
    levels: [{ paletteRgb555, indices, mixtures: spriteIdentityMixtures() }],
  };
}

/** One identity mapping for normalized masters, including an unused transparent slot. */
export function spriteIdentityMixtures(): PaletteMixture[] {
  return Array.from({ length: 16 }, (_, index) => (index === 0 ? [] : [[index, 1]]));
}

export function readSpritePaletteRgb555(value: unknown, path = ''): number[] {
  return [...readIndexedPalette(value, path)];
}
