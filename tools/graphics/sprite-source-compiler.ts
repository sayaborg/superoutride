import { readDocument, readNumber, readRecord, readString, requireAdmission } from '../../src/core/admission.js';
import { readIndexedPalette } from '../../src/image/indexed-image.js';
import { integrateImageBox, type PaletteMixture } from '../../src/image/image-filter.js';
import { createSpriteSlotChooser } from './sprite-area-filter.js';
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
  readonly version: 4;
  readonly name: string;
  readonly crop: SpriteCrop;
  readonly widthMeters: number | null;
  /** Across and, optionally, the ground row; without `y` the master stands on its bottom edge. */
  readonly anchor: { readonly x: number; readonly y?: number };
  readonly paletteRgb555: readonly number[];
}

/**
 * Crop and normalize decoded straight-alpha sRGB pixels into one editable indexed master; `sampled`, when the caller
 * has sampled the same crop at the same width already (`sampleSpriteCrop`), is used in place of sampling it again.
 */
export function normalizeSpriteSource(
  image: SourceImage,
  recipe: unknown,
  sampled?: ReturnType<typeof sampleSpriteCrop>,
): SpriteLodDocument {
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
    4,
  );
  const name = readString(settings.name, '/name');
  const crop = readRecord(settings.crop, '/crop', ['x', 'y', 'width', 'height']);
  const x = readNumber(crop.x, '/crop/x', { min: 0, max: image.width - 1, integer: true }),
    y = readNumber(crop.y, '/crop/y', { min: 0, max: image.height - 1, integer: true }),
    cropWidth = readNumber(crop.width, '/crop/width', { min: 1, max: image.width - x, integer: true }),
    cropHeight = readNumber(crop.height, '/crop/height', { min: 1, max: image.height - y, integer: true });
  const widthMeters = readNumber(settings.widthMeters, '/widthMeters', { min: 0, exclusiveMin: true });
  const { width, height, samples } =
    sampled ?? sampleSpriteCrop(image, { x, y, width: cropWidth, height: cropHeight }, widthMeters);
  const scale = width / cropWidth;
  const anchor = readRecord(settings.anchor, '/anchor', [
    'x',
    ...(isObject(settings.anchor) && Object.hasOwn(settings.anchor, 'y') ? ['y'] : []),
  ]);
  // A texel-centre coordinate maps by its pixel edges, so the same point of the picture is kept.
  const anchorX = (readNumber(anchor.x, '/anchor/x') + 0.5 - x) * scale - 0.5;
  const anchorY = anchor.y === undefined ? null : (readNumber(anchor.y, '/anchor/y') + 0.5 - y) * scale - 0.5;
  requireAdmission(
    Number.isFinite(anchorX) && (anchorY === null || Number.isFinite(anchorY)),
    'invalid_numeric_domain',
    '/anchor',
    'Mapped anchor must be finite',
  );
  const paletteRgb555 = readSpritePaletteRgb555(settings.paletteRgb555, '/paletteRgb555');
  const choose = createSpriteSlotChooser(paletteRgb555);
  const indices = samples.map(choose);
  return {
    format: 'superoutride.sprite-lod',
    version: 7,
    name,
    width,
    height,
    anchorX,
    ...(anchorY === null ? {} : { anchorY }),
    defaultPalette: 'original',
    palettes: { original: { colors: paletteRgb555 } },
    levels: [{ paletteRgb555, indices, mixtures: spriteIdentityMixtures() }],
  };
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** The width in texels of a master `widthMeters` wide. */
export function spriteMasterWidth(widthMeters: number): number {
  return Math.round(widthMeters * SPRITE_SOURCE_TEXELS_PER_METER);
}

/** A recipe's crop, width and base point: what places its master on its source. */
interface MasterPlacing {
  readonly crop: SpriteCrop;
  readonly widthMeters: number;
  readonly anchor: { readonly x: number; readonly y?: number };
}

/** Source pixels across one master texel: the crop's width over the master's (`masterWidth` texels). */
export function masterTexel(recipe: MasterPlacing, masterWidth = spriteMasterWidth(recipe.widthMeters)): number {
  return recipe.crop.width / masterWidth;
}

/**
 * Where a master texel's centre `(mx, my)` lies on the source, in pixel-edge coordinates (pixel p spans p to p + 1):
 * the crop's corner and `m + 0.5` texels.
 */
export function masterTexelOnSource(
  recipe: MasterPlacing,
  mx: number,
  my: number,
  masterWidth = spriteMasterWidth(recipe.widthMeters),
): readonly [number, number] {
  const texel = masterTexel(recipe, masterWidth);
  return [recipe.crop.x + (mx + 0.5) * texel, recipe.crop.y + (my + 0.5) * texel];
}

/**
 * The base point in master texel-centre coordinates, mapped by pixel edges as normalization maps it; without `anchor.y`,
 * the master's last row, where the picture stands on its crop's bottom edge.
 */
export function masterAnchor(recipe: MasterPlacing): { readonly anchorX: number; readonly anchorY: number } {
  const texel = masterTexel(recipe);
  const { crop, anchor } = recipe;
  return {
    anchorX: (anchor.x + 0.5 - crop.x) / texel - 0.5,
    anchorY: anchor.y === undefined ? Math.ceil(crop.height / texel) - 0.5 : (anchor.y + 0.5 - crop.y) / texel - 0.5,
  };
}

/** The recipe with its base point at master texel-centre `(x, y)`, to a billionth of a source pixel. */
export function withMasterAnchor<Recipe extends MasterPlacing>(recipe: Recipe, x: number, y: number): Recipe {
  const [sx, sy] = masterTexelOnSource(recipe, x, y);
  const fine = (value: number) => Math.round(value * 1e9) / 1e9;
  return { ...recipe, anchor: { x: fine(sx - 0.5), y: fine(sy - 0.5) } };
}

/**
 * The master a crop of `image` normalizes to at `widthMeters`: its extent (40 texels per metre across, the aspect kept,
 * a fractional last row padded with transparency rather than stretched) and each texel's linear-light area sample of
 * the crop, row by row. Normalization chooses its slots from these, and the color rule and dithers read the same.
 */
export function sampleSpriteCrop(image: SourceImage, crop: SpriteCrop, widthMeters: number) {
  const width = spriteMasterWidth(widthMeters);
  const height = Math.ceil((crop.height * width) / crop.width);
  // Authoring admission limit, independent of the runtime interchange and device budget.
  requireAdmission(
    Number.isSafeInteger(width) && width >= 1 && Number.isSafeInteger(height) && width * height <= 1024 * 1024,
    'resource_limit',
    '/widthMeters',
    'Normalized master must contain 1 to 1048576 texels',
  );
  return sampleCropAt(image, crop, width);
}

/** The crop's linear-light area samples at `width` texels across, as `sampleSpriteCrop` takes them. */
export function sampleCropAt(image: SourceImage, crop: SpriteCrop, width: number) {
  if (
    ![crop.x, crop.y, crop.width, crop.height, width].every(Number.isSafeInteger) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    width < 1 ||
    crop.x + crop.width > image.width ||
    crop.y + crop.height > image.height
  )
    throw new RangeError('crop must be an integer rectangle inside the source, sampled at a positive width');
  const { x, y, width: cropWidth, height: cropHeight } = crop;
  const height = Math.ceil((cropHeight * width) / cropWidth);
  const samples: ReturnType<typeof integrateImageBox>[] = [];
  for (let dy = 0; dy < height; dy++)
    for (let dx = 0; dx < width; dx++) {
      // Integer overlap units avoid fractional resampling gaps at fully opaque boundaries.
      const x0 = x * width + dx * cropWidth,
        y0 = y * width + dy * cropWidth;
      const x1 = Math.min((x + cropWidth) * width, x0 + cropWidth);
      const y1 = Math.min((y + cropHeight) * width, y0 + cropWidth);
      // A fractional final row is transparent padding in the new master, not vertical stretching.
      samples.push(integrateImageBox(image.pixels, image.width, x0, y0, x1, y1, cropWidth * cropWidth, width));
    }
  return { width, height, samples };
}

/** One identity mapping for normalized masters, including an unused transparent slot. */
export function spriteIdentityMixtures(): PaletteMixture[] {
  return Array.from({ length: 16 }, (_, index) => (index === 0 ? [] : [[index, 1]]));
}

export function readSpritePaletteRgb555(value: unknown, path = ''): number[] {
  return [...readIndexedPalette(value, path)];
}
