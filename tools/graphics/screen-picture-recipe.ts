import { readDictionary, readDocument, readEnum, readNumber, readRecord } from '../../src/core/admission.js';
import { TILE_PICTURE_LIMITS } from '../../src/image/tile-picture.js';

/**
 * The screen picture recipes: the size each screen picture is drawn at from its source, `<name>.png` beside the
 * recipes under `content/screen-picture-sources/`. They are production-only data, which the build does not deliver.
 */
export const SCREEN_PICTURE_RECIPES_FORMAT = 'superoutride.screen-picture-recipes';
export const SCREEN_PICTURE_RECIPES_VERSION = 1;
export const SCREEN_PICTURE_SOURCES_DIRECTORY = 'screen-picture-sources';
export const SCREEN_PICTURE_RECIPES_FILE = `${SCREEN_PICTURE_SOURCES_DIRECTORY}/recipes.json`;

/** How the source reaches the picture: `fill` scales it to the whole picture; `contain` fits it inside, centred. */
export const SCREEN_PICTURE_FITS = ['fill', 'contain'] as const;

export interface ScreenPictureRecipe {
  /** The picture's size in 16×16 tiles. */
  readonly columns: number;
  readonly rows: number;
  readonly fit: (typeof SCREEN_PICTURE_FITS)[number];
}

/** Admit the recipes: each picture's size in tiles and its fit. */
export function readScreenPictureRecipes(value: unknown): ReadonlyMap<string, ScreenPictureRecipe> {
  const document = readDocument(
    value,
    ['format', 'version', 'pictures'],
    SCREEN_PICTURE_RECIPES_FORMAT,
    SCREEN_PICTURE_RECIPES_VERSION,
  );
  const pictures = readDictionary(document.pictures, '/pictures', (item, path) => {
    const recipe = readRecord(item, path, ['columns', 'rows', 'fit']);
    return Object.freeze({
      columns: readNumber(recipe.columns, `${path}/columns`, {
        min: 1,
        max: TILE_PICTURE_LIMITS.columns,
        integer: true,
      }),
      rows: readNumber(recipe.rows, `${path}/rows`, { min: 1, max: TILE_PICTURE_LIMITS.rows, integer: true }),
      fit: readEnum(recipe.fit, SCREEN_PICTURE_FITS, `${path}/fit`),
    });
  });
  return new Map(Object.entries(pictures));
}
