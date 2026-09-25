import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createSpriteLodFilterFixture } from '../graphics/fixtures/sprite-lod.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';
import { createSpriteSourceFixture } from '../graphics/fixtures/sprite-source.js';
import { unpackRgba } from '../../src/image/rgb555.js';

/**
 * The browser-tools build: four browser tools and their worklet entries form one self-contained,
 * versioned output tree under dist/tools, with the Sprite Tool's PNG example and the LOD filter sample.
 * It delivers no content; the content build owns dist/content.
 */
const root = new URL('../../', import.meta.url);
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: [
    'tools/graphics/sprite-tool.ts',
    'tools/graphics/sprite-lod.ts',
    'tools/audio/audio-browser.ts',
    'tools/audio/tire-browser.ts',
    'tools/audio/exhaust-processor.ts',
    'tools/audio/tire-processor.ts',
  ],
  outbase: 'tools',
  outdir: 'dist/tools',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  tsconfig: 'tsconfig.tools.json',
  chunkNames: 'shared/[name]-[hash]',
  alias: { pngjs: 'pngjs/browser.js' },
});
for (const name of [
  'graphics/sprite-tool.html',
  'graphics/sprite-tool.css',
  'graphics/sprite-lod.html',
  'audio/audio-browser.html',
  'audio/tire-browser.html',
]) {
  const target = new URL(`dist/tools/${name}`, root);
  await mkdir(new URL('./', target), { recursive: true });
  const source = await readFile(new URL(`tools/${name}`, root), 'utf8');
  await writeFile(target, source.replace('href="../../?mode=', 'href="../../../../?mode='));
}

// Browser-only delivery consumes source directly; Node tools never import generated modules.
const output = new URL('dist/tools/graphics/', root);
await writeFile(new URL('png-codec-LICENSE.txt', output), await readFile(new URL('node_modules/pngjs/LICENSE', root)));
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
