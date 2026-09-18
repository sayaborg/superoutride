import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createSpriteLodFilterFixture } from '../../dist/dev/fixtures/sprite-lod.js';
import { compileSpriteLodWithAuthoredPalette } from '../../dist/graphics/sprite-lod-compiler.js';
import { createSpriteSourceFixture } from '../../dist/dev/fixtures/sprite-source.js';
import { unpackRgba } from '../../dist/graphics/software-surface.js';
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
  const { r, g, b, a } = unpackRgba(sample.pixels[i]);
  bytes.set([r, g, b, a], i * 4);
}
await writeFile(
  new URL('sprite-source-example.png', output),
  PNG.sync.write({ width: sample.width, height: sample.height, data: bytes }),
);

// Comparison recipes are explicit diagnostic inputs. The browser reads completed products only.
for (const [name, colorSpace] of [
  ['encoded', 'encoded-srgb'],
  ['linear', 'linear-srgb'],
]) {
  const product = compileSpriteLodWithAuthoredPalette(createSpriteLodFilterFixture(), {
    colorSpace,
    coverageThreshold: 0.5,
  });
  await writeFile(new URL(`sprite-lod-${name}.json`, output), JSON.stringify(product) + '\n');
}
