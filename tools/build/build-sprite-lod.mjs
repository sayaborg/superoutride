import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { compileSpriteLodWithAuthoredPalette } from '../../dist/graphics/sprite-lod-compiler.js';

const [sourcePath, recipePath, outputPath, ...extra] = process.argv.slice(2);
if (!sourcePath || !recipePath || !outputPath || extra.length) {
  throw new Error('Usage: npm run build:sprite-lod -- MASTER.json RECIPE.json OUTPUT.json');
}
if ([sourcePath, recipePath].some((path) => resolve(path) === resolve(outputPath))) {
  throw new Error('Sprite output must not overwrite source or recipe');
}
const [source, recipe] = await Promise.all(
  [sourcePath, recipePath].map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
);
const product = compileSpriteLodWithAuthoredPalette(source, recipe);
const bytes = JSON.stringify(product) + '\n';
// Exclusive output: an explicit new path keeps source art and previous products reviewable.
await writeFile(outputPath, bytes, { flag: 'wx' });
console.log(
  JSON.stringify({
    output: outputPath,
    levels: product.levels.length,
    bytes: Buffer.byteLength(bytes),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }),
);
