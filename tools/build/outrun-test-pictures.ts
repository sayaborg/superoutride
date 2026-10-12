import { readFile } from 'node:fs/promises';
import { atomicWrite, reportError, requireInput } from '../course/authoring-io.js';
import { encodePng } from '../graphics/drawn/raster.js';
import { drawSeriesPicture } from '../graphics/drawn/series-picture.js';

/**
 * The OUTRUN TEST pictures command: draw every OUTRUN TEST picture's production-only source deterministically and
 * write it with its recipe, for the existing commands to make the delivered pictures from: the series picture to
 * `content/screen-picture-sources/` (then `npm run screen-pictures`). Any source may later be replaced by another image
 * under the same name without touching the course.
 */
const USAGE = 'Usage: npm run outrun-test-pictures';
const content = new URL('../../content/', import.meta.url);

try {
  requireInput(process.argv.length === 2, '/arguments', USAGE);
  const written: string[] = [];
  const write = async (path: string, bytes: Uint8Array | string) => {
    await atomicWrite(new URL(path, content).pathname, bytes);
    written.push(`content/${path}`);
  };
  await write('screen-picture-sources/outrun-test.png', encodePng(drawSeriesPicture()));
  const recipesPath = 'screen-picture-sources/recipes.json';
  const recipes = JSON.parse(await readFile(new URL(recipesPath, content), 'utf8')) as {
    pictures: Record<string, unknown>;
  };
  recipes.pictures['outrun-test'] = { columns: 20, rows: 15, fit: 'fill' };
  // One picture a line, as the recipes are written.
  const lines = Object.entries(recipes.pictures).map(
    ([name, recipe]) => `    ${JSON.stringify(name)}: ${JSON.stringify(recipe)}`,
  );
  await write(
    recipesPath,
    `${JSON.stringify({ ...recipes, pictures: {} }, null, 2).replace('"pictures": {}', `"pictures": {\n${lines.join(',\n')}\n  }`)}\n`,
  );
  console.log(JSON.stringify({ ok: true, written }));
} catch (error) {
  reportError(error);
}
