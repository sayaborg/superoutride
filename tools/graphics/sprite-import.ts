import { compileSpriteLod } from './sprite-lod-compiler.js';
import {
  readArray,
  readBoolean,
  readDictionary,
  readDocument,
  readEnum,
  readNumber,
  readRecord,
  readString,
} from '../../src/core/admission.js';
import type { PNG as PngDecoder } from 'pngjs';
import { admit, requireAdmission } from '../../src/core/admission.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { SHA256_TEXT } from '../../src/core/content-digest.js';
import { readRgb555, rgba, unpackRgba } from '../../src/image/rgb555.js';
import type { ContentStore } from '../authoring/content-store.js';
import { decodeSpritePng } from './sprite-png.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { boardShadow } from './board-shadow.js';
import { optimizeSpritePalette, quantizeSpriteSamples, SPRITE_DITHERS, type SpriteDither } from './sprite-colors.js';
import { mirrorSprite } from './sprite-mirror.js';
import {
  normalizeSpriteSource,
  sampleSpriteCrop,
  type SourceImage,
  type SpriteCrop,
} from './sprite-source-compiler.js';

/**
 * Sprite import: an authored source image (PNG) and its recipe make one normalized course image master. The recipe is
 * production-only data, saved beside its PNG under `content/sprite-sources/`, which the build does not deliver.
 */
export const SPRITE_RECIPE_FORMAT = 'superoutride.sprite-recipe';
export const SPRITE_RECIPE_VERSION = 5;
/** The directory of sources and recipes: `<name>.png` and `<name>.json`, the master's name being `<name>`. */
export const SPRITE_SOURCES_DIRECTORY = 'sprite-sources';

/**
 * The default anchor of a source `width` texels wide, in texel-centre coordinates: its middle, where a board stands on
 * its bottom edge.
 */
export function defaultSpriteAnchor(width: number): { readonly x: number } {
  return { x: (width - 1) / 2 };
}

/**
 * The original picture a product picture is based on: its name, the SHA-256 of its body PNG (its master without the
 * shadow frame), and the map of a source pixel p to the original body's `scale·p + (x, y)`.
 */
export interface SpriteRecipeBasis {
  readonly image: string;
  readonly bodySha256: string;
  readonly transform: { readonly scale: number; readonly x: number; readonly y: number };
}

export interface SpriteRecipe {
  readonly format: typeof SPRITE_RECIPE_FORMAT;
  readonly version: typeof SPRITE_RECIPE_VERSION;
  readonly crop: SpriteCrop;
  readonly widthMeters: number;
  /**
   * The base point: `x` across and `y`, the ground row, in source texel-centre coordinates; without `y` the picture
   * stands on its crop's bottom edge.
   */
  readonly anchor: { readonly x: number; readonly y?: number };
  /** Rectangles hidden (made transparent) or shown again, applied in order. */
  readonly mask: readonly (SpriteCrop & { readonly hidden: boolean })[];
  /**
   * The named palettes, each 16 slot colors from slot 0, the first the default the source is normalized with and the
   * others the same slots in other colors; null generates one, `original` (median cut).
   */
  readonly palettes: Readonly<Record<string, readonly number[]>> | null;
  /** Absent, `none`. */
  readonly dither?: SpriteDither;
  /** `board`: the picture casts the board shadow; absent, it casts none. */
  readonly shadow?: 'board';
  /** Import also writes `<name>-mirrored`, the picture and its shadow reflected together. */
  readonly mirror?: true;
  readonly basedOn?: SpriteRecipeBasis;
}

/** The fields a recipe may omit, each meaning the behavior of a recipe without it. */
const OPTIONAL_RECIPE_FIELDS = ['dither', 'shadow', 'mirror', 'basedOn'] as const;

function presentFields(value: unknown, fields: readonly string[]) {
  return typeof value === 'object' && value !== null ? fields.filter((field) => Object.hasOwn(value, field)) : [];
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
    [
      'format',
      'version',
      'crop',
      'widthMeters',
      'anchor',
      'mask',
      'palettes',
      ...presentFields(value, OPTIONAL_RECIPE_FIELDS),
    ],
    SPRITE_RECIPE_FORMAT,
    SPRITE_RECIPE_VERSION,
  );
  const crop = readRectangle(document.crop, '/crop').rectangle;
  const widthMeters = readNumber(document.widthMeters, '/widthMeters', { min: 0, exclusiveMin: true });
  const anchor = readRecord(document.anchor, '/anchor', ['x', ...presentFields(document.anchor, ['y'])]);
  const mask = readArray(document.mask, '/mask', (item, path) => {
    const { record, rectangle } = readRectangle(item, path, ['hidden']);
    return { ...rectangle, hidden: readBoolean(record.hidden, `${path}/hidden`) };
  });
  const palettes =
    document.palettes === null
      ? null
      : readDictionary(document.palettes, '/palettes', (colors, path) =>
          readArray(colors, path, readRgb555, { length: 16 }),
        );
  requireAdmission(
    palettes === null || Object.keys(palettes).length > 0,
    'invalid_value',
    '/palettes',
    'Expected at least one palette',
  );
  if (document.mirror !== undefined)
    requireAdmission(document.mirror === true, 'invalid_value', '/mirror', 'mirror must be true when present');
  if (document.shadow !== undefined)
    requireAdmission(document.shadow === 'board', 'invalid_value', '/shadow', 'shadow must be "board" when present');
  return {
    format: SPRITE_RECIPE_FORMAT,
    version: SPRITE_RECIPE_VERSION,
    crop,
    widthMeters,
    anchor: {
      x: readNumber(anchor.x, '/anchor/x'),
      ...(anchor.y === undefined ? {} : { y: readNumber(anchor.y, '/anchor/y') }),
    },
    mask,
    palettes,
    ...(document.dither === undefined ? {} : { dither: readEnum(document.dither, SPRITE_DITHERS, '/dither') }),
    ...(document.shadow === undefined ? {} : { shadow: 'board' as const }),
    ...(document.mirror === undefined ? {} : { mirror: true as const }),
    ...(document.basedOn === undefined ? {} : { basedOn: readRecipeBasis(document.basedOn, '/basedOn') }),
  };
}

function readRecipeBasis(value: unknown, path: string): SpriteRecipeBasis {
  const basis = readRecord(value, path, ['image', 'bodySha256', 'transform']);
  const transform = readRecord(basis.transform, `${path}/transform`, ['scale', 'x', 'y']);
  return {
    image: readString(basis.image, `${path}/image`),
    bodySha256: readString(basis.bodySha256, `${path}/bodySha256`, SHA256_TEXT),
    transform: {
      scale: readNumber(transform.scale, `${path}/transform/scale`, { min: 0, exclusiveMin: true }),
      x: readNumber(transform.x, `${path}/transform/x`),
      y: readNumber(transform.y, `${path}/transform/y`),
    },
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

/**
 * The recipe's named palettes, or `original`: the 15 colors the color rule (`optimizeSpritePalette`) chooses for the
 * master the masked crop normalizes to.
 */
export function recipePalettes(image: SourceImage, recipe: SpriteRecipe): Readonly<Record<string, readonly number[]>> {
  if (recipe.palettes) return recipe.palettes;
  const { width, height, samples } = sampleSpriteCrop(
    maskedSource(image, recipe.mask),
    recipe.crop,
    recipe.widthMeters,
  );
  return { original: optimizeSpritePalette(samples, width, height).palette };
}

/**
 * Import one master named `name`: the masked source normalized by the current normalization with the recipe's first
 * palette, its default, its colors chosen by the recipe's dither, carrying every named palette and, with
 * `shadow: "board"`, the board shadow of the part above its ground row. `basedOn` changes nothing.
 */
export function importSprite(image: SourceImage, recipe: SpriteRecipe, name: string): SpriteLodDocument {
  const source = maskedSource(image, recipe.mask);
  const palettes = Object.entries(recipePalettes(image, recipe));
  const master = normalizeSpriteSource(source, {
    format: 'superoutride.sprite-source',
    version: 3,
    name,
    crop: recipe.crop,
    widthMeters: recipe.widthMeters,
    anchor: recipe.anchor,
    paletteRgb555: palettes[0]![1],
  });
  const dither = recipe.dither ?? 'none';
  const level = master.levels[0]!;
  const indices =
    dither === 'none'
      ? level.indices
      : quantizeSpriteSamples(
          sampleSpriteCrop(source, recipe.crop, recipe.widthMeters).samples,
          master.width,
          level.paletteRgb555,
          dither,
        );
  const picture: SpriteLodDocument = {
    ...master,
    levels: [{ ...level, indices }],
    defaultPalette: palettes[0]![0],
    palettes: Object.fromEntries(palettes.map(([palette, colors]) => [palette, { colors }])),
  };
  return recipe.shadow ? { ...picture, shadow: boardShadow(picture) } : picture;
}

/**
 * The course image files an import of `recipe` writes: its master's and, with `mirror`, that of its reflection,
 * `<name>-mirrored` (`mirrorSprite`: the picture and its shadow reflected together).
 */
export function importedImageFiles(recipe: SpriteRecipe, master: SpriteLodDocument) {
  return [master, ...(recipe.mirror ? [mirrorSprite(master)] : [])].map(courseImageFile);
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
 * A course image master as its named file, `images/<name>.json` in the saved layout, compiled with every level it is
 * delivered with: the one way a course image is written, so its master and its levels never disagree. The file is the
 * source's name, which courses use; writing it replaces an image of that name, so every course using the name shows
 * the new image.
 */
export function courseImageFile(master: SpriteLodDocument) {
  return {
    path: `images/${master.name}.json`,
    bytes: new TextEncoder().encode(formatSavedJson(compileSpriteLod(master))),
  };
}
