import { PNG } from 'pngjs';
import { reportError } from '../course/authoring-io.js';
import { drawGuidancePictures } from '../graphics/drawn/guidance.js';
import { createNodeContentStore } from './node-content-store.js';
import { writeDrawnSprite } from './drawn-sprite.js';

/**
 * The guidance pictures command: `npm run guidance-pictures` draws the boards that show which road to take where
 * OUTRUN's roads part, deterministically, as production-only sources with their recipes under `content/sprite-sources/`,
 * then makes their course images as `npm run sprite -- import` does.
 */
const content = new URL('../../content/', import.meta.url);
const store = createNodeContentStore();

try {
  const written: string[] = [];
  for (const { name, raster } of drawGuidancePictures())
    written.push(await writeDrawnSprite(content, store, PNG, name, raster, null));
  console.log(JSON.stringify({ ok: true, written }));
} catch (error) {
  reportError(error);
}
