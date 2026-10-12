import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { compileTilePicture } from '../../src/image/tile-picture.js';
import { SCREEN_PICTURES_DIRECTORY } from '../../src/content/screen-picture-catalog.js';
import { replaceDocument } from '../authoring/content-store.js';
import { createNodeContentStore } from './node-content-store.js';
import { reportError, requireInput } from '../course/authoring-io.js';
import { drawTilePictures } from '../graphics/screen-pictures.js';

/**
 * The screen pictures command: draw every screen picture from its source and recipe (`content/screen-picture-sources/`)
 * and write it as a tile picture, `content/screen-pictures/<name>.json`, with a check sheet, `dist/screen-pictures/
 * <name>.png`: the picture over a grey ground, which nothing reads.
 */
const USAGE = 'Usage: npm run screen-pictures';
const store = createNodeContentStore();

try {
  requireInput(process.argv.length === 2, '/arguments', USAGE);
  const drawn = await drawTilePictures(store, PNG);
  const directory = new URL('../../dist/screen-pictures/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const pictures: string[] = [],
    sheets: string[] = [];
  for (const [name, document] of drawn) {
    await replaceDocument(store, `${SCREEN_PICTURES_DIRECTORY}/${name}.json`, document);
    pictures.push(`content/${SCREEN_PICTURES_DIRECTORY}/${name}.json`);
    const picture = compileTilePicture(document);
    const frame = {
      width: picture.width,
      height: picture.height,
      pixels: new Uint16Array(picture.width * picture.height),
    };
    frame.pixels.fill((12 << 10) | (12 << 5) | 13);
    picture.draw(frame, 0, 0);
    const sheet = new PNG({ width: frame.width, height: frame.height });
    frame.pixels.forEach((value, i) => {
      const { r, g, b } = unpackRgba(rgb555ToRgba(value));
      sheet.data.set([r, g, b, 255], i * 4);
    });
    await writeFile(new URL(`${name}.png`, directory), PNG.sync.write(sheet));
    sheets.push(`dist/screen-pictures/${name}.png`);
  }
  console.log(JSON.stringify({ ok: true, pictures, sheets }));
} catch (error) {
  reportError(
    error instanceof RangeError
      ? { diagnostics: [{ kind: 'tool', code: 'invalid_input', path: '/arguments', message: error.message }] }
      : error,
  );
}
