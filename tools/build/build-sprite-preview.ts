import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createSpriteLodFilterFixture } from '../../src/image/fixtures/sprite-lod.js';
import { compileSpriteLod } from '../../src/image/sprite-lod-compiler.js';
import { createSpriteSourceFixture } from '../../src/image/fixtures/sprite-source.js';
import { unpackRgba } from '../../src/image/rgb555.js';
import { PNG } from 'pngjs';

// Stage the same diagnostic under the coherent build root; no unversioned module import remains.
const output = new URL('../../dist/tools/graphics/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of [
  'sprite-lod.html',
  'sprite-lod.mjs',
  'sprite-tool.html',
  'sprite-tool.css',
  'sprite-tool.mjs',
  'sprite-session.mjs',
  'sprite-png.mjs',
]) {
  const source = await readFile(new URL(`../graphics/${name}`, import.meta.url), 'utf8');
  await writeFile(new URL(name, output), source.replaceAll('../../dist/', '../../'));
}

// The pinned browser codec is an editor-only dependency, wrapped as a versioned ESM module.
const codec = await readFile(new URL('../../node_modules/pngjs/browser.js', import.meta.url), 'utf8');
await writeFile(
  new URL('png-codec.mjs', output),
  `const module = { exports: {} };\nconst exports = module.exports;\n${codec}\nexport const PNG = module.exports.PNG;\n`,
);
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
