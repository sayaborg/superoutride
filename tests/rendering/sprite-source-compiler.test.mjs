import { palette16 } from '../helpers/indexed-images.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { normalizeSpriteSource } from '../../dist/graphics/sprite-source-compiler.js';
import { compileSpriteLod } from '../../dist/graphics/sprite-lod-compiler.js';
import { readSpriteLodAsset, drawScaledSprite } from '../../dist/graphics/sprite.js';
import { SoftwareSurface, rgba } from '../../dist/graphics/software-surface.js';

const red = rgba(255, 0, 0),
  white = rgba(255, 255, 255),
  black = rgba(0, 0, 0);
const image = (width, height, pixels = Array(width * height).fill(red)) => ({
  width,
  height,
  pixels: Uint32Array.from(pixels),
});
const recipe = (width, height, changes = {}) => ({
  format: 'superoutride.sprite-source',
  version: 2,
  name: 'IMPORTED',
  crop: { x: 0, y: 0, width, height },
  widthMeters: width / 40,
  anchor: { x: (width - 1) / 2, y: height - 1 },
  paletteRgb555: palette16([0x7c00]),
  ...changes,
});
const indices = (output) => output.levels[0].indices;

test('metric source normalization maps a 2 m crop to 80 texels and the existing 80 px projection', () => {
  const source = image(200, 120);
  const settings = recipe(200, 120, {
    crop: { x: 20, y: 10, width: 160, height: 100 },
    widthMeters: 2,
    anchor: { x: 99.5, y: 109.5 },
  });
  const original = structuredClone({ source, settings });
  const output = normalizeSpriteSource(source, settings);
  assert.equal(output.width, 80);
  assert.equal(output.height, 50);
  assert.equal(output.anchorX, 39.5);
  assert.equal(output.anchorY, 49.5);
  const asset = readSpriteLodAsset(compileSpriteLod(output));
  assert.equal(asset.worldWidthMeters, 2);
  assert.equal(drawScaledSprite(new SoftwareSurface(320, 240), asset, 160, 200, 40).outputSamples, 80 * 50);
  assert.deepEqual({ source, settings }, original);
  output.levels[0].paletteRgb555[1] = 0;
  assert.equal(settings.paletteRgb555[1], 0x7c00);
});

test('fractional source footprints integrate area rather than point-sample or stretch', () => {
  const source = image(3, 1, [black, white, black]);
  const output = normalizeSpriteSource(
    source,
    recipe(3, 1, {
      widthMeters: 2 / 40,
      paletteRgb555: palette16([0, 0x4e73, 0x7fff]),
    }),
  );
  // Each output cell covers 1.5 input pixels. Its opaque average is 1/3 white.
  assert.deepEqual(indices(output), [2, 2]);
  assert.equal(output.height, 1);
});

test('source alpha uses the common half-coverage threshold and normalizes visible linear color', () => {
  const source = image(2, 1, [red, rgba(0, 255, 255, 0)]);
  const settings = recipe(2, 1, { widthMeters: 1 / 40, paletteRgb555: palette16([0x7c00, 0x4000]) });
  // The half-height crop covers half the output footprint: one opaque cell is only 1/4.
  assert.deepEqual(indices(normalizeSpriteSource(source, settings)), [0]);
  const partial = image(2, 1, [rgba(255, 0, 0, 128), rgba(0, 255, 255, 0)]);
  assert.deepEqual(indices(normalizeSpriteSource(partial, recipe(2, 1))), [1, 0]);
  const alphaMix = image(2, 2, [red, rgba(0, 0, 255, 128), red, rgba(0, 0, 255, 128)]);
  const mixRecipe = recipe(2, 2, { widthMeters: 1 / 40, paletteRgb555: palette16([0x6813, 0x540a, 0x4010]) });
  assert.deepEqual(indices(normalizeSpriteSource(alphaMix, mixRecipe)), [1]);
});

test('uniform source scaling keeps the fractional final row as coverage and maps source-center anchors', () => {
  const settings = recipe(4, 3, { widthMeters: 2 / 40, anchor: { x: 0, y: 2 } });
  const output = normalizeSpriteSource(image(4, 3), settings);
  assert.deepEqual([output.width, output.height, output.anchorX, output.anchorY], [2, 2, -0.25, 0.75]);
  assert.deepEqual(indices(output), [1, 1, 1, 1]);
  const fractional = normalizeSpriteSource(image(3, 3), recipe(3, 3, { widthMeters: 7 / 40 }));
  assert.ok(indices(fractional).every((value) => value === 1));
});

test('integer enlargement preserves source cells, crop exclusion and source metric rounding', () => {
  const source = image(3, 2, [black, red, white, black, white, red]);
  const output = normalizeSpriteSource(
    source,
    recipe(3, 2, {
      crop: { x: 1, y: 0, width: 2, height: 2 },
      widthMeters: 4 / 40,
      paletteRgb555: palette16([0x7c00, 0x7fff]),
    }),
  );
  assert.deepEqual(indices(output), [1, 1, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 1, 1]);
  const rounded = normalizeSpriteSource(image(80, 80), recipe(80, 80, { widthMeters: 1.976 }));
  assert.equal(rounded.width, 79);
  assert.equal(readSpriteLodAsset(rounded).worldWidthMeters, 1.975);
});

test('source normalization uses the common linear average and stable palette tie ordering', () => {
  const source = image(2, 2, [black, white, white, black]);
  const settings = recipe(2, 2, { widthMeters: 1 / 40, paletteRgb555: palette16([0, 0x7fff, 0x4210, 0x5ef7]) });
  assert.deepEqual(indices(normalizeSpriteSource(source, settings)), [4]);
  for (const colors of [
    [0, 0x7fff],
    [0x7fff, 0],
  ]) {
    const palette = palette16(colors);
    const output = normalizeSpriteSource(source, { ...settings, paletteRgb555: palette });
    assert.equal(palette[indices(output)[0]], 0);
  }
});

test('invalid source recipes and admission limits fail before producing a master', () => {
  const source = image(2, 2),
    settings = recipe(2, 2);
  for (const bad of [
    null,
    {},
    { ...settings, format: 'other' },
    { ...settings, version: 1 },
    { ...settings, crop: { ...settings.crop, rotation: 1 } },
    { ...settings, crop: { ...settings.crop, x: 0.5 } },
    { ...settings, crop: { ...settings.crop, x: 1 } },
    { ...settings, crop: { ...settings.crop, width: 0 } },
    { ...settings, widthMeters: 0 },
    { ...settings, widthMeters: 0.001 },
    { ...settings, widthMeters: Infinity },
    { ...settings, widthMeters: 100 },
    { ...settings, anchor: { x: NaN, y: 0 } },
    { ...settings, filter: {} },
    { ...settings, paletteRgb555: [0, 0] },
    { ...settings, paletteRgb555: Array.from({ length: 17 }, (_, i) => i) },
    { ...settings, paletteRgb555: Array(1) },
    { ...settings, scale: 2 },
  ]) {
    assert.throws(() => normalizeSpriteSource(source, bad), RangeError);
  }
  assert.throws(() => normalizeSpriteSource({ ...source, pixels: new Uint32Array(3) }, settings), /source image/);
  assert.throws(() => normalizeSpriteSource(source, { ...settings, paletteRgb555: [] }), /16/);
  assert.deepEqual(
    indices(normalizeSpriteSource(image(2, 2, [0, 0, 0, 0]), { ...settings, paletteRgb555: palette16([]) })),
    [0, 0, 0, 0],
  );
});

test('PNG source CLI produces a reproducible editable master accepted by the LOD CLI and product reader', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'outride-png-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, 'source.png'),
    recipePath = join(directory, 'source.json');
  const masterPath = join(directory, 'master.json'),
    otherPath = join(directory, 'other.json');
  const productPath = join(directory, 'product.json');
  const png = PNG.sync.write({
    width: 2,
    height: 2,
    data: Buffer.from([255, 0, 0, 255, 0, 255, 255, 0, 255, 0, 0, 128, 0, 0, 0, 255]),
  });
  const settings = recipe(2, 2, { paletteRgb555: palette16([0x7c00, 0]) });
  await writeFile(sourcePath, png);
  await writeFile(recipePath, JSON.stringify(settings));
  const sourceTool = new URL('../../tools/build/build-sprite-source.mjs', import.meta.url).pathname;
  const lodTool = new URL('../../tools/build/build-sprite-lod.mjs', import.meta.url).pathname;
  const run = (path) =>
    execFileSync(process.execPath, [sourceTool, sourcePath, recipePath, path], { encoding: 'utf8', stdio: 'pipe' });
  const report = JSON.parse(run(masterPath));
  run(otherPath);
  const masterBytes = await readFile(masterPath, 'utf8');
  assert.equal(masterBytes, await readFile(otherPath, 'utf8'));
  assert.deepEqual(indices(JSON.parse(masterBytes)), [1, 0, 1, 2]);
  assert.equal(report.width, 2);
  assert.equal(report.height, 2);
  assert.equal(report.levels, 1);
  execFileSync(process.execPath, [lodTool, masterPath, productPath], { stdio: 'pipe' });
  assert.equal(readSpriteLodAsset(JSON.parse(await readFile(productPath, 'utf8'))).levels.length, 2);
  assert.throws(() => run(sourcePath), /overwrite source/);
  assert.throws(() => run(recipePath), /overwrite source/);
  assert.throws(() => run(masterPath), /EEXIST/);
  assert.deepEqual(await readFile(sourcePath), png);
  assert.equal(await readFile(masterPath, 'utf8'), masterBytes);
  const broken = Buffer.from(png);
  broken[29] ^= 1;
  await writeFile(sourcePath, broken);
  const brokenPath = join(directory, 'broken.json');
  assert.throws(() => run(brokenPath));
  await assert.rejects(readFile(brokenPath), { code: 'ENOENT' });
  const oversized = Buffer.from(png);
  oversized.writeUInt32BE(16777217, 16);
  await writeFile(sourcePath, oversized);
  assert.throws(() => run(join(directory, 'oversized.json')), /at most 16777216/);
  const animation = Buffer.alloc(20);
  animation.writeUInt32BE(8, 0);
  animation.write('acTL', 4);
  await writeFile(sourcePath, Buffer.concat([png.subarray(0, 33), animation, png.subarray(33)]));
  assert.throws(() => run(join(directory, 'animated.json')), /animated PNG/);
  await writeFile(sourcePath, Buffer.from('not a PNG'));
  assert.throws(() => run(join(directory, 'invalid.json')), /signature/);
});
