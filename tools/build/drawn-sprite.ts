import { formatSavedJson } from '../../src/content/saved-json.js';
import { atomicWrite } from '../course/authoring-io.js';
import { encodePng, type Raster } from '../graphics/drawn/raster.js';
import { TEXELS_PER_METRE } from '../graphics/drawn/kit.js';
import {
  courseImageFile,
  defaultSpriteAnchor,
  importSpriteSource,
  SPRITE_RECIPE_FORMAT,
  SPRITE_RECIPE_VERSION,
} from '../graphics/sprite-import.js';
import type { ContentStore } from '../authoring/content-store.js';
import type { PNG } from 'pngjs';

/**
 * Save a drawn picture as a sprite source, `content/sprite-sources/<name>.png` with its recipe (the whole raster at 40
 * texels per metre, standing on the middle of its bottom edge, with `palettes`), and make its course image from them as
 * the sprite command imports one; returns the image's content path.
 */
export async function writeDrawnSprite(
  content: URL,
  store: ContentStore,
  png: typeof PNG,
  name: string,
  raster: Raster,
  palettes: Readonly<Record<string, readonly number[]>> | null,
): Promise<string> {
  await atomicWrite(new URL(`sprite-sources/${name}.png`, content).pathname, encodePng(raster));
  const recipe = {
    format: SPRITE_RECIPE_FORMAT,
    version: SPRITE_RECIPE_VERSION,
    crop: { x: 0, y: 0, width: raster.width, height: raster.height },
    widthMeters: raster.width / TEXELS_PER_METRE,
    anchor: defaultSpriteAnchor(raster.width, raster.height),
    mask: [],
    palettes,
  };
  await atomicWrite(new URL(`sprite-sources/${name}.json`, content).pathname, formatSavedJson(recipe));
  const { master } = await importSpriteSource(store, name, png);
  const file = courseImageFile(master);
  await store.write(file.path, file.bytes);
  return `content/${file.path}`;
}
