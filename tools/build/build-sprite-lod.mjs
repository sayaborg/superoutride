import { readFile } from 'node:fs/promises';
import { writeSpriteArtifact } from './write-sprite-artifact.mjs';
import { compileSpriteLod } from '../../dist/image/sprite-lod-compiler.js';

const [sourcePath, outputPath, ...extra] = process.argv.slice(2);
if (!sourcePath || !outputPath || extra.length) {
  throw new Error('Usage: npm run build:sprite-lod -- MASTER.json OUTPUT.json');
}
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const product = compileSpriteLod(source);
await writeSpriteArtifact(outputPath, [sourcePath], product);
