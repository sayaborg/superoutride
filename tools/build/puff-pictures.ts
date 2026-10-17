import { PNG } from 'pngjs';
import { reportError } from '../course/authoring-io.js';
import { drawPuffPictures } from '../graphics/drawn/puffs.js';
import { createNodeContentStore } from './node-content-store.js';
import { writeDrawnSprite } from './drawn-sprite.js';

/**
 * The puff pictures command: `npm run puff-pictures` draws every tire puff picture deterministically as a
 * production-only source with its recipe and named palettes under `content/sprite-sources/`, then makes its course
 * image as `npm run sprite -- import` does. A source may later be replaced by another image of the same name and size,
 * made into its picture by the sprite command without this one.
 */
const content = new URL('../../content/', import.meta.url);
const store = createNodeContentStore();

try {
  const written: string[] = [];
  for (const { name, raster, palettes } of drawPuffPictures())
    written.push(await writeDrawnSprite(content, store, PNG, name, raster, palettes));
  console.log(JSON.stringify({ ok: true, written }));
} catch (error) {
  reportError(error);
}
