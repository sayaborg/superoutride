import { createSpriteAreaFilter } from './sprite-area-filter.js';
import { readSpritePaletteRgb555, SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from './sprite.js';

interface SourceImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint32Array;
}

/** Crop and normalize decoded straight-alpha sRGB pixels into one editable indexed master. */
export function normalizeSpriteSource(image: SourceImage, recipe: unknown): SpriteLodDocument {
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width * image.height > 16 * 1024 * 1024 ||
    !(image.pixels instanceof Uint32Array) ||
    image.pixels.length !== image.width * image.height
  )
    throw new RangeError('source image requires positive dimensions and matching RGBA pixels');
  const settings = record(recipe, [
    'format',
    'version',
    'name',
    'crop',
    'widthMeters',
    'anchor',
    'paletteRgb555',
    'filter',
  ]);
  if (settings.format !== 'superoutride.sprite-source' || settings.version !== 1)
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
  const filter = createSpriteAreaFilter(paletteRgb555, settings.filter);
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
    version: 1,
    name: settings.name,
    width,
    height,
    anchorX,
    anchorY,
    levels: [{ paletteRgb555, indices }],
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
