import { readArray, readBoolean, readDocument, readNumber, readRecord } from '../../src/core/admission.js';
import type { PNG as PngDecoder } from 'pngjs';
import { admit } from '../../src/core/admission.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { readRgb555, rgba, unpackRgba } from '../../src/image/rgb555.js';
import type { ContentStore } from '../authoring/content-store.js';
import { decodeSpritePng } from './sprite-png.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { generateSpritePalette } from './sprite-palette.js';
import { normalizeSpriteSource, type SourceImage, type SpriteCrop } from './sprite-source-compiler.js';

/**
 * Sprite import: an authored source image (PNG) and its recipe make one normalized course image master. The recipe is
 * production-only data, saved beside its PNG under `content/sprite-sources/`, which the build does not deliver.
 */
export const SPRITE_RECIPE_FORMAT = 'superoutride.sprite-recipe';
export const SPRITE_RECIPE_VERSION = 2;
/** The directory of sources and recipes: `<name>.png` and `<name>.json`, the master's name being `<name>`. */
export const SPRITE_SOURCES_DIRECTORY = 'sprite-sources';

export interface SpriteRecipe {
  readonly format: typeof SPRITE_RECIPE_FORMAT;
  readonly version: typeof SPRITE_RECIPE_VERSION;
  readonly crop: SpriteCrop;
  readonly widthMeters: number;
  readonly anchor: { readonly x: number; readonly y: number };
  /** Rectangles hidden (made transparent) or shown again, applied in order. */
  readonly mask: readonly (SpriteCrop & { readonly hidden: boolean })[];
  /** The 16 slot colors from slot 0; null generates them (median cut). */
  readonly palette: readonly number[] | null;
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
    ['format', 'version', 'crop', 'widthMeters', 'anchor', 'mask', 'palette'],
    SPRITE_RECIPE_FORMAT,
    SPRITE_RECIPE_VERSION,
  );
  const crop = readRectangle(document.crop, '/crop').rectangle;
  const widthMeters = readNumber(document.widthMeters, '/widthMeters', { min: 0, exclusiveMin: true });
  const anchor = readRecord(document.anchor, '/anchor', ['x', 'y']);
  const mask = readArray(document.mask, '/mask', (item, path) => {
    const { record, rectangle } = readRectangle(item, path, ['hidden']);
    return { ...rectangle, hidden: readBoolean(record.hidden, `${path}/hidden`) };
  });
  const palette =
    document.palette === null ? null : readArray(document.palette, '/palette', readRgb555, { length: 16 });
  return {
    format: SPRITE_RECIPE_FORMAT,
    version: SPRITE_RECIPE_VERSION,
    crop,
    widthMeters,
    anchor: { x: readNumber(anchor.x, '/anchor/x'), y: readNumber(anchor.y, '/anchor/y') },
    mask,
    palette,
  };
}

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

/** The recipe's slot colors, or the 15-color median-cut candidate of the masked crop. */
export function recipePalette(image: SourceImage, recipe: SpriteRecipe): readonly number[] {
  return recipe.palette ?? generateSpritePalette(maskedSource(image, recipe.mask), recipe.crop, 15);
}

/** Import one master named `name`: the masked source normalized by the current normalization with the recipe's palette. */
export function importSprite(image: SourceImage, recipe: SpriteRecipe, name: string): SpriteLodDocument {
  return normalizeSpriteSource(maskedSource(image, recipe.mask), {
    format: 'superoutride.sprite-source',
    version: 2,
    name,
    crop: recipe.crop,
    widthMeters: recipe.widthMeters,
    anchor: recipe.anchor,
    paletteRgb555: recipePalette(image, recipe),
  });
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

/**
 * A course image master as its named file, `images/<name>.json` in the saved layout: the source's name, which courses
 * use. Writing it replaces an image of that name, so every course using the name shows the new image.
 */
export function courseImageFile(master: SpriteLodDocument) {
  return { path: `images/${master.name}.json`, bytes: new TextEncoder().encode(formatSavedJson(master)) };
}
