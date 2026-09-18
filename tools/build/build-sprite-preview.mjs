import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createSpriteLodFilterFixture } from '../../dist/dev/fixtures/sprite-lod.js';
import { compileSpriteLodWithAuthoredPalette } from '../../dist/graphics/sprite-lod-compiler.js';

// Stage the same diagnostic under the coherent build root; no unversioned module import remains.
const output = new URL('../../dist/tools/graphics/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['sprite-lod.html', 'sprite-lod.mjs']) {
  const source = await readFile(new URL(`../graphics/${name}`, import.meta.url), 'utf8');
  await writeFile(new URL(name, output), source.replaceAll('../../dist/', '../../'));
}

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
