import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { atomicWrite, reportError, requireInput } from '../course/authoring-io.js';
import { encodePng, type Raster } from '../graphics/drawn/raster.js';
import { drawSeriesPicture } from '../graphics/drawn/series-picture.js';
import { SKIES, SPRITES, TEXELS_PER_METRE } from '../graphics/drawn/scenery.js';
import { createNodeContentStore } from './node-content-store.js';
import { courseImageFile, importSpriteSource } from '../graphics/sprite-import.js';
import { drawTilePictures } from '../graphics/screen-pictures.js';
import { replaceDocument } from '../authoring/content-store.js';

/**
 * The OUTRUN TEST pictures command: `npm run outrun-test-pictures -- [name ...]` draws the named OUTRUN TEST pictures
 * (every one by default) deterministically as production-only sources with their recipes, then makes the delivered
 * pictures from them as the picture commands do: the series picture into `content/screen-picture-sources/` (then the
 * screen picture), sprites into `content/sprite-sources/` (then the course image, as `npm run sprite -- import`) and
 * skies into `content/sky-sources/` (then the course image, as `npm run skies`). A source may later be replaced by
 * another image of the same name and size, made into its picture by those commands without this one.
 */
const content = new URL('../../content/', import.meta.url);
const store = createNodeContentStore();
const names = process.argv.slice(2);
const SERIES = 'outrun-test';
const wanted = (name: string) => !names.length || names.includes(name);

/** Rewrite a recipes file with `pictures[name] = recipe`, one picture a line. */
async function setRecipe(path: string, name: string, recipe: unknown) {
  let recipes: { pictures: Record<string, unknown> };
  try {
    recipes = JSON.parse(await readFile(new URL(path, content), 'utf8')) as typeof recipes;
  } catch {
    recipes = { format: 'superoutride.screen-picture-recipes', version: 1, pictures: {} } as never;
  }
  recipes.pictures[name] = recipe;
  await atomicWrite(new URL(path, content).pathname, formatSavedJson(recipes));
}

try {
  const known = [SERIES, ...Object.keys(SPRITES), ...Object.keys(SKIES)];
  for (const name of names) requireInput(known.includes(name), '/arguments', `Unknown picture ${name}`);
  const written: string[] = [];
  if (wanted(SERIES)) {
    await atomicWrite(
      new URL(`screen-picture-sources/${SERIES}.png`, content).pathname,
      encodePng(drawSeriesPicture()),
    );
    await setRecipe('screen-picture-sources/recipes.json', SERIES, { columns: 20, rows: 15, fit: 'fill' });
    const document = (await drawTilePictures(store, PNG)).get(SERIES)!;
    await replaceDocument(store, `screen-pictures/${SERIES}.json`, document);
    written.push(`content/screen-pictures/${SERIES}.json`);
  }
  for (const [name, draw] of Object.entries(SPRITES)) {
    if (!wanted(name)) continue;
    const raster: Raster = draw();
    await atomicWrite(new URL(`sprite-sources/${name}.png`, content).pathname, encodePng(raster));
    const recipe = {
      format: 'superoutride.sprite-recipe',
      version: 3,
      crop: { x: 0, y: 0, width: raster.width, height: raster.height },
      widthMeters: raster.width / TEXELS_PER_METRE,
      anchor: { x: raster.width / 2 - 0.5, y: raster.height - 1 },
      mask: [],
      palettes: null,
    };
    await atomicWrite(new URL(`sprite-sources/${name}.json`, content).pathname, formatSavedJson(recipe));
    const { master } = await importSpriteSource(store, name, PNG);
    const file = courseImageFile(master);
    await store.write(file.path, file.bytes);
    written.push(`content/${file.path}`);
  }
  const skies = Object.entries(SKIES).filter(([name]) => wanted(name));
  for (const [name, draw] of skies) {
    const raster = draw();
    await atomicWrite(new URL(`sky-sources/${name}.png`, content).pathname, encodePng(raster));
    await setRecipe('sky-sources/recipes.json', name, {
      columns: raster.width / 16,
      rows: raster.height / 16,
      fit: 'fill',
    });
  }
  if (skies.length)
    for (const [name, document] of await drawTilePictures(store, PNG, 'sky-sources'))
      if (skies.some(([n]) => n === name)) {
        await store.write(`images/${name}.json`, new TextEncoder().encode(JSON.stringify(document)));
        written.push(`content/images/${name}.json`);
      }
  console.log(JSON.stringify({ ok: true, written }));
} catch (error) {
  reportError(error);
}
