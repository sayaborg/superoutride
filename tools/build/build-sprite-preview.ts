import { buildBrowserTools } from './build-browser-tools.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createSpriteLodFilterFixture } from '../graphics/fixtures/sprite-lod.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';
import { createSpriteSourceFixture } from '../graphics/fixtures/sprite-source.js';
import { unpackRgba } from '../../src/image/rgb555.js';
import { PNG } from 'pngjs';

// Browser-only delivery consumes source directly; Node tools never import generated modules.
const output = new URL('../../dist/tools/graphics/', import.meta.url);
await buildBrowserTools();
await writeFile(
  new URL('png-codec-LICENSE.txt', output),
  await readFile(new URL('../../node_modules/pngjs/LICENSE', import.meta.url)),
);
const sample = createSpriteSourceFixture(),
  bytes = Buffer.alloc(sample.pixels.length * 4);
for (let i = 0; i < sample.pixels.length; i++) {
  const { r, g, b, a } = unpackRgba(sample.pixels[i]!);
  bytes.set([r, g, b, a], i * 4);
}
const png = new PNG({ width: sample.width, height: sample.height });
png.data = bytes;
await writeFile(new URL('sprite-source-example.png', output), PNG.sync.write(png));

// One shared production filter; the browser receives completed products only.
await writeFile(
  new URL('sprite-lod-linear.json', output),
  JSON.stringify(compileSpriteLod(createSpriteLodFilterFixture())) + '\n',
);

const masters = JSON.parse(await readFile(new URL('../../content/sprites/vehicles.json', import.meta.url), 'utf8')) as {
  sprites: SpriteLodDocument[];
};
const product = { ...masters, sprites: masters.sprites.map(compileSpriteLod) };
const library = new URL('../../dist/content/sprites/vehicles.json', import.meta.url);
await mkdir(new URL('./', library), { recursive: true });
const libraryBytes = JSON.stringify(product) + '\n';
await writeFile(library, libraryBytes);
const levels = product.sprites.flatMap((sprite) => sprite.levels.slice(1));
console.log(
  JSON.stringify({
    spriteMasters: masters.sprites.length,
    spriteLevels: product.sprites.reduce((n, s) => n + s.levels.length, 0),
    masterJsonBytes: Buffer.byteLength(JSON.stringify(masters) + '\n'),
    deliveredJsonBytes: Buffer.byteLength(libraryBytes),
    addedLodPatternBytes: levels.reduce((n, level) => n + Math.ceil(level.indices.length / 2), 0),
    addedLodRgb555PaletteBytes: levels.length * 32,
  }),
);
