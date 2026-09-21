import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { compileSpriteLod } from '../../dist/graphics/sprite-lod-compiler.js';
import { readSpriteLodAsset, createSpritePaletteVariant } from '../../dist/graphics/sprite.js';
import { integrateImageBox, evaluatePaletteMixture } from '../../dist/graphics/image-filter.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { masterDocument as master, palette16, levelPixels } from '../helpers/indexed-images.mjs';

const color = (document, k, i = 0) => document.levels[k].paletteRgb555[document.levels[k].indices[i]];

test('shared linear light box average creates the independently expected 23/31 gray, not encoded 16/31', () => {
  const source = master(2, 2, [0, 0x7fff], [1, 2, 2, 1]);
  const product = compileSpriteLod(source);
  assert.equal(color(product, 1), (23 << 10) | (23 << 5) | 23);
  assert.deepEqual(product.levels[1].mixtures[product.levels[1].indices[0]], [
    [1, 0.5],
    [2, 0.5],
  ]);
  assert.deepEqual(product.levels[0], source.levels[0]);
  const average = integrateImageBox(
    Uint32Array.from([rgb555ToRgba(0), rgb555ToRgba(0x7fff), rgb555ToRgba(0x7fff), rgb555ToRgba(0)]),
    2,
    0,
    0,
    2,
    2,
    4,
    1,
  );
  assert.deepEqual([average.red, average.green, average.blue], [0.5, 0.5, 0.5]);
});

test('coverage equality is opaque and transparent cells never add a dark halo', () => {
  const sparse = compileSpriteLod(master(2, 2, [0x7c00], [1, 0, 0, 0]));
  assert.deepEqual(sparse.levels[1].indices, [0]);
  const half = compileSpriteLod(master(2, 2, [0x7c00], [1, 0, 0, 1]));
  assert.equal(color(half, 1), 0x7c00);
  const transparent = compileSpriteLod(master(1, 3, [], [0, 0, 0]));
  assert.ok(transparent.levels.every((level) => level.indices.every((index) => index === 0)));
});

test('odd and thin logical footprints do not treat storage padding as transparent', () => {
  for (const [width, height] of [
    [3, 3],
    [1, 65],
    [65, 1],
  ]) {
    const source = master(width, height, [0x7fff], Array(width * height).fill(1));
    const output = compileSpriteLod(source);
    assert.ok(output.levels.every((level) => level.indices.every((index) => index === 1)));
    assert.equal(readSpriteLodAsset(output).worldWidthMeters, width / 40);
    assert.equal(output.anchorX, source.anchorX);
    assert.equal(output.anchorY, source.anchorY);
    assert.equal(output.levels.at(-1).indices.length, 1);
  }
});

test('every level integrates the original master, not the thresholded previous level', () => {
  const source = master(4, 4, [0x7fff], [1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0]);
  const product = compileSpriteLod(source);
  assert.deepEqual(product.levels[1].indices, [0, 0, 1, 1]);
  // L1 would be half-covered; the master is only 7/16 covered, so the direct L2 remains transparent.
  assert.deepEqual(product.levels[2].indices, [0]);
});

test('filtering a replacement master and replacing the exact mixture commute before color reduction', () => {
  const source = master(3, 3, [0x1202, 0x7fff, 0x3e0], [1, 2, 3, 3, 1, 2, 1, 0, 2]);
  const replacement = palette16([0x7c00, 0x01f, 0x2108]);
  source.variants.push(replacement);
  const product = compileSpriteLod(source);
  for (let k = 1; k < product.levels.length; k++) {
    const step = 2 ** k,
      width = Math.ceil(source.width / step),
      height = Math.ceil(source.height / step);
    const pixels = Uint32Array.from(source.levels[0].indices, (index) =>
      index ? rgb555ToRgba(replacement[index]) : 0,
    );
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const index = product.levels[k].indices[y * width + x];
        if (!index) continue;
        const x1 = Math.min(source.width, (x + 1) * step),
          y1 = Math.min(source.height, (y + 1) * step);
        const mean = integrateImageBox(
          pixels,
          source.width,
          x * step,
          y * step,
          x1,
          y1,
          (x1 - x * step) * (y1 - y * step),
          1,
        );
        const actual = evaluatePaletteMixture(product.levels[k].mixtures[index], replacement);
        for (const [channel, value] of [mean.red, mean.green, mean.blue].entries())
          assert.ok(Math.abs(actual[channel] - value) < 1e-14);
      }
  }
  const asset = readSpriteLodAsset(product),
    variant = createSpritePaletteVariant(asset, replacement);
  assert.equal(variant.levels[1].pattern, asset.levels[1].pattern);
  assert.notDeepEqual(levelPixels(variant.levels[1]), levelPixels(asset.levels[1]));
  assert.throws(() => createSpritePaletteVariant(asset, palette16([0x7fff])), /not included/);
});

test('all-variant reduction preserves a distant lamp which is indistinguishable from the body in the base palette', () => {
  const colors = [
    0x0800,
    0x0800,
    ...Array.from({ length: 13 }, (_, i) => ((i * 2 + 5) << 10) | ((i * 2 + 5) << 5) | (i * 2 + 5)),
  ];
  const blocks = [
    [1, 1, 1, 1],
    [2, 2, 2, 2],
  ];
  for (let i = 3; i <= 15; i++) blocks.push([i, i, i, i], [i, i, i, 2]);
  const width = blocks.length * 8,
    height = 8,
    indices = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) indices.push(blocks[Math.floor(x / 8)][(y >= 4 ? 2 : 0) + (x % 8 >= 4 ? 1 : 0)]);
  const brake = palette16(colors);
  brake[1] = 0x7c00;
  const source = master(width, height, colors, indices, 'LAMP_PROBE', [brake]);
  const product = compileSpriteLod(source),
    asset = readSpriteLodAsset(product),
    lit = createSpritePaletteVariant(asset, brake);
  const level = product.levels[3];
  assert.ok(new Set(level.indices).size <= 15);
  assert.notEqual(
    level.indices[0],
    level.indices[1],
    'base-equal lamp/body semantics must not collapse under the bright variant',
  );
  const pixels = levelPixels(lit.levels[3]);
  assert.ok((pixels[0] & 255) > 200, 'coarse lamp remains bright');
  assert.ok((pixels[1] & 255) < 80, 'body does not inherit the lamp illumination');
  for (const mixture of level.mixtures)
    if (mixture.length) assert.ok(Math.abs(mixture.reduce((sum, [, w]) => sum + w, 0) - 1) < 1e-12);
});

test('compilation is deterministic, owns its output and requires exactly one normalized master', () => {
  const source = master(3, 2, [0x7fff], [1, 0, 1, 1, 1, 0]),
    snapshot = structuredClone(source);
  const result = compileSpriteLod(source);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(result, compileSpriteLod(source));
  assert.throws(() => compileSpriteLod(result), /exactly one/);
  result.levels[0].indices[0] = 0;
  assert.equal(source.levels[0].indices[0], 1);
});

test('CLI produces deterministic loadable LOD and preserves source/output files on failure', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'outride-sprite-compile-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, 'master.json'),
    output = join(directory, 'output.json'),
    other = join(directory, 'other.json');
  const source = master(3, 3, [0, 0x7fff], [1, 2, 1, 2, 1, 2, 1, 2, 1]);
  await writeFile(sourcePath, JSON.stringify(source));
  const script = new URL('../../tools/build/build-sprite-lod.mjs', import.meta.url);
  const run = (path) =>
    execFileSync(process.execPath, [script.pathname, sourcePath, path], { encoding: 'utf8', stdio: 'pipe' });
  const report = JSON.parse(run(output));
  run(other);
  const bytes = await readFile(output, 'utf8');
  assert.equal(bytes, await readFile(other, 'utf8'));
  assert.equal(report.levels, 3);
  assert.equal(report.bytes, Buffer.byteLength(bytes));
  assert.match(report.sha256, /^[0-9a-f]{64}$/);
  assert.equal(readSpriteLodAsset(JSON.parse(bytes)).levels.length, 3);
  assert.throws(() => run(sourcePath), /overwrite source/);
  assert.throws(() => run(output), /EEXIST/);
  assert.equal(await readFile(sourcePath, 'utf8'), JSON.stringify(source));
  assert.equal(await readFile(output, 'utf8'), bytes);
});
