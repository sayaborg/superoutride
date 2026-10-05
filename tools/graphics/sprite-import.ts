import {
  readArray,
  readBoolean,
  readDocument,
  readNumber,
  readRecord,
  readEnum,
  requireAdmission,
} from '../../src/core/admission.js';
import type { PNG as PngDecoder } from 'pngjs';
import { admit } from '../../src/core/admission.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { encodeContentJson } from '../../src/content/content-manifest.js';
import { readRgb555, rgba, rgbaToRgb555, unpackRgba } from '../../src/image/rgb555.js';
import type { ContentStore } from '../authoring/content-store.js';
import { decodeSpritePng } from './sprite-png.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { generateSpritePalette } from './sprite-palette.js';
import { normalizeSpriteSource, type SourceImage, type SpriteCrop } from './sprite-source-compiler.js';

/**
 * Sprite import: an authored source image (PNG) and its recipe make one normalized master. The recipe is
 * production-only data, saved beside its PNG under `content/sprite-sources/`, which the build does not deliver.
 */
export const SPRITE_RECIPE_FORMAT = 'superoutride.sprite-recipe';
export const SPRITE_RECIPE_VERSION = 1;
/** The directory of sources and recipes: `<name>.png` and `<name>.json`, the master's name being `<name>`. */
export const SPRITE_SOURCES_DIRECTORY = 'sprite-sources';
/** A vehicle image's slot for the brake lamp, which its set colors; artwork never takes it. */
export const BRAKE_LAMP_SLOT = 15;

export interface SpriteRecipe {
  readonly format: typeof SPRITE_RECIPE_FORMAT;
  readonly version: typeof SPRITE_RECIPE_VERSION;
  /** A vehicle image (slots 1–14, slot 15 the lamp) or a course image (slots 1–15). */
  readonly target: 'vehicle' | 'course';
  readonly crop: SpriteCrop;
  readonly widthMeters: number;
  readonly anchor: { readonly x: number; readonly y: number };
  /** Rectangles hidden (made transparent) or shown again, applied in order. */
  readonly mask: readonly (SpriteCrop & { readonly hidden: boolean })[];
  /** Slot colors from 0: 15 for a vehicle image, 16 for a course image; null generates them (median cut). */
  readonly palette: readonly number[] | null;
  /** A vehicle image's lamp pixels: inside any rectangle, or of any source color (RGB555 of the pixel). */
  readonly lamp: { readonly rectangles: readonly SpriteCrop[]; readonly colors: readonly number[] };
}

function readRectangle(value: unknown, path: string, extra: readonly string[] = []) {
  const record = readRecord(value, path, ['x', 'y', 'width', 'height', ...extra]);
  const at = (field: string, min: number) =>
    readNumber(record[field], `${path}/${field}`, { min, max: 1 << 20, integer: true });
  return { record, rectangle: { x: at('x', 0), y: at('y', 0), width: at('width', 1), height: at('height', 1) } };
}

/** Admit a recipe document. */
export function readSpriteRecipe(value: unknown): SpriteRecipe {
  const document = readDocument(
    value,
    ['format', 'version', 'target', 'crop', 'widthMeters', 'anchor', 'mask', 'palette', 'lamp'],
    SPRITE_RECIPE_FORMAT,
    SPRITE_RECIPE_VERSION,
  );
  const target = readEnum(document.target, ['vehicle', 'course'] as const, '/target');
  const crop = readRectangle(document.crop, '/crop').rectangle;
  const widthMeters = readNumber(document.widthMeters, '/widthMeters', { min: 0, exclusiveMin: true });
  const anchor = readRecord(document.anchor, '/anchor', ['x', 'y']);
  const mask = readArray(document.mask, '/mask', (item, path) => {
    const { record, rectangle } = readRectangle(item, path, ['hidden']);
    return { ...rectangle, hidden: readBoolean(record.hidden, `${path}/hidden`) };
  });
  const slots = target === 'vehicle' ? BRAKE_LAMP_SLOT : 16;
  const palette =
    document.palette === null ? null : readArray(document.palette, '/palette', readRgb555, { length: slots });
  const lamp = readRecord(document.lamp, '/lamp', ['rectangles', 'colors']);
  const rectangles = readArray(
    lamp.rectangles,
    '/lamp/rectangles',
    (item, path) => readRectangle(item, path).rectangle,
  );
  const colors = readArray(lamp.colors, '/lamp/colors', readRgb555);
  requireAdmission(
    target === 'vehicle' || (!rectangles.length && !colors.length),
    'invalid_value',
    '/lamp',
    'Only a vehicle image has brake-lamp pixels',
  );
  return {
    format: SPRITE_RECIPE_FORMAT,
    version: SPRITE_RECIPE_VERSION,
    target,
    crop,
    widthMeters,
    anchor: { x: readNumber(anchor.x, '/anchor/x'), y: readNumber(anchor.y, '/anchor/y') },
    mask,
    palette,
    lamp: { rectangles, colors },
  };
}

const inside = (rectangle: SpriteCrop, x: number, y: number) =>
  x >= rectangle.x && y >= rectangle.y && x < rectangle.x + rectangle.width && y < rectangle.y + rectangle.height;

/** The source with the recipe's mask applied: hidden pixels keep their color and lose their alpha. */
export function maskedSource(image: SourceImage, mask: SpriteRecipe['mask']): SourceImage {
  const pixels = image.pixels.slice();
  for (const rectangle of mask)
    for (let y = rectangle.y; y < Math.min(image.height, rectangle.y + rectangle.height); y++)
      for (let x = rectangle.x; x < Math.min(image.width, rectangle.x + rectangle.width); x++) {
        const i = y * image.width + x;
        const { r, g, b } = unpackRgba(pixels[i]!);
        pixels[i] = rgba(r, g, b, rectangle.hidden ? 0 : unpackRgba(image.pixels[i]!).a);
      }
  return { ...image, pixels };
}

/** The recipe's slot colors, or the median-cut candidate of the masked crop: 14 colors for a vehicle, 15 else. */
export function recipePalette(image: SourceImage, recipe: SpriteRecipe): readonly number[] {
  if (recipe.palette) return recipe.palette;
  const generated = generateSpritePalette(
    maskedSource(image, recipe.mask),
    recipe.crop,
    recipe.target === 'vehicle' ? 14 : 15,
  );
  return recipe.target === 'vehicle' ? generated.slice(0, BRAKE_LAMP_SLOT) : generated;
}

/**
 * Import one master named `name`: the masked source normalized by the current normalization with the recipe's palette.
 * A vehicle image's palette has 15 slots: normalization chooses among slots 1–14 (its slot 15 repeats slot 1, which
 * the area filter's tie rule never prefers), then each texel whose area is mostly lamp pixels takes slot 15.
 */
export function importSprite(image: SourceImage, recipe: SpriteRecipe, name: string): SpriteLodDocument {
  const source = maskedSource(image, recipe.mask);
  const palette = recipePalette(image, recipe);
  const vehicle = recipe.target === 'vehicle';
  const master = normalizeSpriteSource(source, {
    format: 'superoutride.sprite-source',
    version: 2,
    name,
    crop: recipe.crop,
    widthMeters: recipe.widthMeters,
    anchor: recipe.anchor,
    paletteRgb555: vehicle ? [...palette, palette[1]!] : palette,
  });
  if (!vehicle) return master;
  const colors = palette.slice(0, BRAKE_LAMP_SLOT);
  const indices = [...master.levels[0]!.indices];
  const { rectangles, colors: lampColors } = recipe.lamp;
  if (rectangles.length || lampColors.length) {
    // The lamp mask as an image of the same alpha, white on black, normalized the same way.
    const lamp = source.pixels.map((pixel, i) => {
      const { a } = unpackRgba(pixel),
        x = i % source.width,
        y = Math.floor(i / source.width);
      const lit = rectangles.some((r) => inside(r, x, y)) || lampColors.includes(rgbaToRgb555(pixel));
      return lit ? rgba(255, 255, 255, a) : rgba(0, 0, 0, a);
    });
    const lampMaster = normalizeSpriteSource(
      { ...source, pixels: lamp },
      {
        format: 'superoutride.sprite-source',
        version: 2,
        name,
        crop: recipe.crop,
        widthMeters: recipe.widthMeters,
        anchor: recipe.anchor,
        paletteRgb555: [0, 0, 0x7fff, ...Array<number>(13).fill(0)],
      },
    );
    lampMaster.levels[0]!.indices.forEach((slot, i) => {
      if (slot === 2 && indices[i]) indices[i] = BRAKE_LAMP_SLOT;
    });
  }
  return {
    ...master,
    palettes: { original: { colors } },
    levels: [{ ...master.levels[0]!, paletteRgb555: colors, indices }],
  };
}

/** Read source `name` (`<name>.png` and its recipe `<name>.json` under `sprite-sources/`) and import its master. */
export async function importSpriteSource(
  store: ContentStore,
  name: string,
  PNG: typeof PngDecoder,
): Promise<{ readonly recipe: SpriteRecipe; readonly master: SpriteLodDocument }> {
  const base = `${SPRITE_SOURCES_DIRECTORY}/${name}`;
  const text = new TextDecoder().decode(await store.read(`${base}.json`));
  const recipe = requireLoaded(admit(`content/${base}.json`, () => readSpriteRecipe(JSON.parse(text))));
  return { recipe, master: importSprite(await decodeSpritePng(await store.read(`${base}.png`), PNG), recipe, name) };
}

/** A course image master as its content-addressed file: `images/<sha256>.json` holding its compact JSON. */
export async function courseImageFile(master: SpriteLodDocument) {
  const bytes = encodeContentJson(master);
  const sha256 = await contentDigest(bytes);
  return { path: `images/${sha256}.json`, sha256, bytes };
}
