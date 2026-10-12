import { PNG } from 'pngjs';
import { compileTilePicture } from '../../src/image/tile-picture.js';
import { SKY_TILE_ROWS } from '../../src/course/compiler/course-appearance.js';
import { createNodeContentStore } from './node-content-store.js';
import { reportError, requireInput } from '../course/authoring-io.js';
import { drawTilePictures } from '../graphics/screen-pictures.js';

/**
 * The skies command: draw every course sky that has a source, `content/sky-sources/<name>.png` with its entry in that
 * directory's recipes (the screen picture recipe format), and write it as the course image `content/images/<name>.json`,
 * a tile picture `SKY_TILE_ROWS` tiles high and opaque. Skies without a source are left as they are.
 */
const USAGE = 'Usage: npm run skies';
const store = createNodeContentStore();

try {
  requireInput(process.argv.length === 2, '/arguments', USAGE);
  const skies: string[] = [];
  for (const [name, document] of await drawTilePictures(store, PNG, 'sky-sources')) {
    const picture = compileTilePicture(document);
    requireInput(
      picture.rows === SKY_TILE_ROWS && picture.opaque,
      `/sky-sources/${name}`,
      `A sky is an opaque tile picture ${SKY_TILE_ROWS} tiles high`,
    );
    // Course images are saved as their exact compact bytes.
    await store.write(`images/${name}.json`, new TextEncoder().encode(JSON.stringify(document)));
    skies.push(`content/images/${name}.json`);
  }
  console.log(JSON.stringify({ ok: true, skies }));
} catch (error) {
  reportError(error);
}
