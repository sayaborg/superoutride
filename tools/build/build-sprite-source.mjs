import { readFile, stat } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { normalizeSpriteSource } from '../../dist/graphics/sprite-source-compiler.js';
import { decodeSpritePng, SPRITE_PNG_BYTE_LIMIT } from '../graphics/sprite-png.mjs';
import { writeSpriteArtifact } from './write-sprite-artifact.mjs';

const [sourcePath, recipePath, outputPath, ...extra] = process.argv.slice(2);
if (!sourcePath || !recipePath || !outputPath || extra.length)
  throw new Error('Usage: npm run build:sprite-source -- SOURCE.png RECIPE.json MASTER.json');
if ((await stat(sourcePath)).size > SPRITE_PNG_BYTE_LIMIT) throw new RangeError('PNG exceeds 32 MiB');
const image = await decodeSpritePng(await readFile(sourcePath), PNG);
const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
const master = normalizeSpriteSource(image, recipe);
await writeSpriteArtifact(outputPath, [sourcePath, recipePath], master);
