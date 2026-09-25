import { admit } from '../../src/core/admission.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { readFile } from 'node:fs/promises';
import { writeSpriteArtifact } from './write-sprite-artifact.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';

const [sourcePath, outputPath, ...extra] = process.argv.slice(2);
if (!sourcePath || !outputPath || extra.length) {
  throw new Error('Usage: npm run build:sprite-lod -- MASTER.json OUTPUT.json');
}
const source = JSON.parse(await readFile(sourcePath, 'utf8')) as SpriteLodDocument;
const compiled = admit(sourcePath, () => compileSpriteLod(source));
if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
const product = compiled.value;
await writeSpriteArtifact(outputPath, [sourcePath], product);
