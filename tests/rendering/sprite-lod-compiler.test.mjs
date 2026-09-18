import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { compileSpriteLodWithAuthoredPalette } from '../../dist/graphics/sprite-lod-compiler.js';
import { readSpriteLodAsset } from '../../dist/graphics/sprite.js';

const encoded = { colorSpace: 'encoded-srgb', coverageThreshold: 0.5 };
const master = (width, height, paletteRgb555, indices) => ({
  format: 'superoutride.sprite-lod',
  version: 1,
  name: 'FILTER_PROBE',
  width,
  height,
  anchorX: (width - 1) / 2,
  anchorY: height - 1,
  levels: [{ paletteRgb555, indices }],
});

test('explicit encoded/linear recipes produce distinct independently expected gray averages', () => {
  // Authored black/white pixels, with two available intermediate palette colors.
  const source = master(2, 2, [0, 0x7fff, 0x4210, 0x5ef7], [1, 2, 2, 1]);
  const byteAverage = compileSpriteLodWithAuthoredPalette(source, encoded);
  const lightAverage = compileSpriteLodWithAuthoredPalette(source, { ...encoded, colorSpace: 'linear-srgb' });
  assert.deepEqual(byteAverage.levels[1].indices, [3]);
  assert.deepEqual(lightAverage.levels[1].indices, [4]);
  assert.deepEqual(byteAverage.levels[0], source.levels[0]);
  assert.deepEqual(lightAverage.levels[0], source.levels[0]);
});

test('transparent cells contribute coverage separately, never a dark halo to opaque color', () => {
  const source = master(2, 2, [0x7c00, 0x4000], [1, 0, 0, 0]);
  assert.deepEqual(compileSpriteLodWithAuthoredPalette(source, encoded).levels[1].indices, [0]);
  assert.deepEqual(
    compileSpriteLodWithAuthoredPalette(source, { ...encoded, coverageThreshold: 0.25 }).levels[1].indices,
    [1],
  );
  const transparent = master(1, 3, [], [0, 0, 0]);
  assert.ok(
    compileSpriteLodWithAuthoredPalette(transparent, encoded).levels.every((level) =>
      level.indices.every((index) => index === 0),
    ),
  );
});

test('odd/thin edge cells average their logical area and never count storage padding as transparent', () => {
  for (const [width, height] of [
    [3, 3],
    [1, 65],
    [65, 1],
  ]) {
    const source = master(width, height, [0x7fff], Array(width * height).fill(1));
    const output = compileSpriteLodWithAuthoredPalette(source, { ...encoded, coverageThreshold: 1 });
    assert.ok(output.levels.every((level) => level.indices.every((index) => index === 1)));
    assert.equal(readSpriteLodAsset(output).worldWidthMeters, width / 40);
    assert.equal(output.anchorX, source.anchorX);
    assert.equal(output.anchorY, source.anchorY);
    assert.equal(output.levels.at(-1).indices.length, 1);
  }
});

test('every level integrates the master directly instead of accumulating previous quantization error', () => {
  const source = master(4, 4, [0, 0x4210, 0x7fff], [3, 1, 3, 1, 1, 1, 1, 1, 3, 3, 3, 3, 1, 1, 3, 1]);
  const result = compileSpriteLodWithAuthoredPalette(source, encoded);
  assert.deepEqual(result.levels[1].indices, [1, 1, 2, 2]);
  // Seven white texels out of sixteen average to 7/16, nearest the authored middle gray.
  // Filtering quantized L1 would instead average to half that middle gray and choose black.
  assert.deepEqual(result.levels[2].indices, [2]);
});

test('equal color errors choose the lower RGB555 value independently of authored palette order', () => {
  const a = master(2, 1, [0, 0x7fff], [1, 2]);
  const b = master(2, 1, [0x7fff, 0], [2, 1]);
  const left = compileSpriteLodWithAuthoredPalette(a, encoded),
    right = compileSpriteLodWithAuthoredPalette(b, encoded);
  assert.equal(left.levels[1].paletteRgb555[left.levels[1].indices[0] - 1], 0);
  assert.equal(right.levels[1].paletteRgb555[right.levels[1].indices[0] - 1], 0);
});

test('compiler requires an explicit valid recipe and one normalized master, without mutating inputs', () => {
  const source = master(3, 2, [0x7fff], [1, 0, 1, 1, 1, 0]),
    snapshot = structuredClone(source);
  const result = compileSpriteLodWithAuthoredPalette(source, encoded);
  assert.deepEqual(source, snapshot);
  assert.equal(JSON.stringify(result), JSON.stringify(compileSpriteLodWithAuthoredPalette(source, encoded)));
  assert.throws(() => compileSpriteLodWithAuthoredPalette(result, encoded), /exactly one/);
  for (const recipe of [
    undefined,
    null,
    {},
    { ...encoded, colorSpace: 'default' },
    { ...encoded, coverageThreshold: 0 },
    { ...encoded, coverageThreshold: NaN },
    { ...encoded, coverageThreshold: 1.1 },
    { ...encoded, dither: true },
  ]) {
    assert.throws(() => compileSpriteLodWithAuthoredPalette(source, recipe), RangeError);
  }
  result.levels[0].indices[0] = 0;
  assert.equal(source.levels[0].indices[0], 1);
});

test('declared CLI produces deterministic loadable LOD data and preserves source/output files on failure', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'outride-sprite-compile-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, 'master.json'),
    recipePath = join(directory, 'recipe.json'),
    output = join(directory, 'output.json'),
    other = join(directory, 'other.json');
  const source = master(3, 3, [0, 0x7fff], [1, 2, 1, 2, 1, 2, 1, 2, 1]);
  await writeFile(sourcePath, JSON.stringify(source));
  await writeFile(recipePath, JSON.stringify(encoded));
  const script = new URL('../../tools/build/build-sprite-lod.mjs', import.meta.url);
  const run = (path) =>
    execFileSync(process.execPath, [script.pathname, sourcePath, recipePath, path], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
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
