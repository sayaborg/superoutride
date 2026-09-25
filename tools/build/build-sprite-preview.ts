import { buildBrowserTools } from './build-browser-tools.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createContentWriter } from './content-manifest.js';
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
  sets: Record<string, { assets: number[][]; brakeLamp: { off: number; on: number } }>;
};
const product = {
  ...masters,
  sprites: masters.sprites.map((image, index) => {
    try {
      const bindings = Object.values(masters.sets).filter((set) => set.assets.flat().includes(index));
      if (!bindings.length) throw new RangeError('vehicle image must belong to a sprite set');
      const lamp = bindings[0]!.brakeLamp;
      if (!lamp || bindings.some((set) => set.brakeLamp?.off !== lamp.off || set.brakeLamp?.on !== lamp.on))
        throw new RangeError('shared vehicle images require the same set brake-lamp colors');
      return compileSpriteLod(image, [[lamp.off], [lamp.on]]);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new Error(
        JSON.stringify([
          {
            kind: 'input',
            code: 'invalid_value',
            document: 'content/sprites/vehicles.json',
            path: `/sprites/${index}`,
            message: error.message,
          },
        ]),
        { cause: error },
      );
    }
  }),
};
const writer = createContentWriter(new URL('../../dist/content/', import.meta.url));
const libraryBytes = JSON.stringify(product) + '\n';
await writer.stage('image', 'vehicles', product);
await writer.save();
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
