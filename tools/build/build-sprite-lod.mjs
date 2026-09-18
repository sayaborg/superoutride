import { readFile } from 'node:fs/promises';
import { writeSpriteArtifact } from './write-sprite-artifact.mjs';
import { compileSpriteLodWithAuthoredPalette } from '../../dist/graphics/sprite-lod-compiler.js';

const [sourcePath, recipePath, outputPath, ...extra] = process.argv.slice(2);
if (!sourcePath || !recipePath || !outputPath || extra.length) {
  throw new Error('Usage: npm run build:sprite-lod -- MASTER.json RECIPE.json OUTPUT.json');
}
const [source, recipe] = await Promise.all(
  [sourcePath, recipePath].map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
);
const product = compileSpriteLodWithAuthoredPalette(source, recipe);
await writeSpriteArtifact(outputPath, [sourcePath, recipePath], product);
