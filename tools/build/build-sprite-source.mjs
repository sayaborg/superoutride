import { readFile, stat } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { rgba } from '../../dist/graphics/software-surface.js';
import { normalizeSpriteSource, SPRITE_SOURCE_PIXEL_LIMIT } from '../../dist/graphics/sprite-source-compiler.js';
import { writeSpriteArtifact } from './write-sprite-artifact.mjs';

const [sourcePath, recipePath, outputPath, ...extra] = process.argv.slice(2);
if (!sourcePath || !recipePath || !outputPath || extra.length)
  throw new Error('Usage: npm run build:sprite-source -- SOURCE.png RECIPE.json MASTER.json');
// Local authoring limits, checked before decode/allocation; unrelated to a device budget.
if ((await stat(sourcePath)).size > 32 * 1024 * 1024) throw new RangeError('PNG exceeds 32 MiB');
const bytes = await readFile(sourcePath);
if (
  bytes.length < 33 ||
  !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
  bytes.readUInt32BE(8) !== 13 ||
  bytes.toString('ascii', 12, 16) !== 'IHDR'
)
  throw new RangeError('PNG requires a valid signature and IHDR');
const width = bytes.readUInt32BE(16),
  height = bytes.readUInt32BE(20);
if (bytes[24] !== 8 || width < 1 || height < 1 || width * height > SPRITE_SOURCE_PIXEL_LIMIT)
  throw new RangeError(`PNG must be 8-bit and contain at most ${SPRITE_SOURCE_PIXEL_LIMIT} pixels`);
// pngjs decodes still images; reject animation rather than silently extracting its first image.
for (let offset = 8; offset + 12 <= bytes.length;) {
  const length = bytes.readUInt32BE(offset);
  if (offset + length + 12 > bytes.length) throw new RangeError('truncated PNG chunk');
  if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL')
    throw new RangeError('animated PNG input is not supported');
  offset += length + 12;
}
// No decoder-side gamma/ICC conversion: prepare sRGB sources before import.
const decoded = PNG.sync.read(bytes, { checkCRC: true });
const pixels = new Uint32Array(decoded.width * decoded.height);
for (let i = 0; i < pixels.length; i++) {
  const offset = i * 4;
  pixels[i] = rgba(decoded.data[offset], decoded.data[offset + 1], decoded.data[offset + 2], decoded.data[offset + 3]);
}
const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
const master = normalizeSpriteSource({ width: decoded.width, height: decoded.height, pixels }, recipe);
await writeSpriteArtifact(outputPath, [sourcePath, recipePath], master);
