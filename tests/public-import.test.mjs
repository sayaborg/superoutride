import assert from 'node:assert/strict';
import test from 'node:test';
import { rgba } from '../src/image/rgb555.ts';
import { readSpriteLodAsset } from '../src/image/sprite.ts';
import { spriteIdentityMixtures } from '../tools/graphics/sprite-source-compiler.ts';
import { samplePublicSource, optimizePublicPalette, quantizePublicPicture } from '../tools/public-pictures/quantize.ts';
import { registerPublicSource } from '../tools/public-pictures/register.ts';
import { importPublicPicture } from '../tools/public-pictures/import.ts';

test('public reduction integrates linear light and admits exactly half coverage', () => {
  const source = { width: 2, height: 1, pixels: Uint32Array.from([rgba(255, 255, 255), 0]) };
  const samples = samplePublicSource(source, 1, 1, { scale: 0.5, x: 0, y: 0 });
  assert.equal(samples[0].coverage, 0.25, 'transparent padding in the fractional final row counts');
  const half = samplePublicSource(
    { ...source, height: 2, pixels: Uint32Array.from([rgba(255, 255, 255), 0, rgba(255, 255, 255), 0]) },
    1,
    1,
    { scale: 0.5, x: 0, y: 0 },
  );
  assert.equal(half[0].coverage, 0.5);
  assert.equal(half[0].red, 1);
  assert.ok(quantizePublicPicture(half, 1, [0, ...Array(15).fill(32767)], 'none')[0] > 0);
});

test('undithered palette refinement never increases measured reconstruction error and all modes use fifteen slots', () => {
  const samples = Array.from({ length: 192 }, (_, i) => ({
    coverage: i % 17 ? 1 : 0,
    red: (i / 191) ** 2,
    green: (i % 32) / 31,
    blue: (i % 13) / 12,
  }));
  const result = optimizePublicPalette(samples, 24, 8);
  assert.ok(result.error <= result.baselineError);
  assert.ok(result.error < result.baselineError * 0.99);
  assert.deepEqual(optimizePublicPalette(samples, 24, 8), result);
  for (const mode of ['none', 'ordered', 'diffusion']) {
    const indices = quantizePublicPicture(samples, 24, result.palette, mode);
    assert.ok(indices.every((slot, i) => (samples[i].coverage ? slot >= 1 && slot <= 15 : slot === 0)));
  }
});

test('registration recovers uniform scale and translation and measures the unclipped silhouette', () => {
  const reference = {
    width: 12,
    height: 12,
    anchorX: 5.5,
    anchorY: 11.5,
    indices: Array.from({ length: 144 }, (_, i) =>
      i % 12 >= 3 && i % 12 < 9 && Math.floor(i / 12) >= 2 && Math.floor(i / 12) < 10 ? 1 : 0,
    ),
  };
  const image = {
    width: 32,
    height: 32,
    pixels: Uint32Array.from({ length: 1024 }, (_, i) =>
      i % 32 >= 10 && i % 32 < 22 && Math.floor(i / 32) >= 6 && Math.floor(i / 32) < 22 ? rgba(120, 180, 40) : 0,
    ),
  };
  const result = registerPublicSource(image, reference);
  assert.ok(result.diagnostics.iou > 0.99);
  assert.equal(result.diagnostics.passed, true);
  assert.equal(result.transform.scale, 0.5);
  const wrong = {
    ...image,
    pixels: Uint32Array.from({ length: 1024 }, (_, i) =>
      ((i % 32) - 16) ** 2 + (Math.floor(i / 32) - 16) ** 2 < 144 ? rgba(120, 180, 40) : 0,
    ),
  };
  const failed = registerPublicSource(wrong, reference);
  assert.equal(failed.diagnostics.passed, false);
  assert.ok(failed.samples.some((s) => s.coverage === 0));
});

test('replacement palette follows corresponding original slots, including black-channel fallback', () => {
  const palette = [0, ...Array(15).fill(0x03e0)];
  const asset = readSpriteLodAsset({
    format: 'superoutride.sprite-lod',
    version: 7,
    name: 'enduror-10456',
    width: 4,
    height: 4,
    anchorX: 1.5,
    defaultPalette: 'p028',
    palettes: { p028: { colors: palette }, p086: { colors: [0, ...Array(15).fill(0x001f)] } },
    levels: [{ paletteRgb555: palette, indices: Array(16).fill(1), mixtures: spriteIdentityMixtures() }],
  });
  const settings = {
    name: 'public-enduror-10456',
    description: 'rock',
    reason: 'test',
    height: null,
    collisionWidth: null,
    anchor: null,
    anchorHeight: null,
    shadow: null,
    dither: null,
  };
  const result = importPublicPicture(
    asset,
    settings,
    { width: 8, height: 8, pixels: Uint32Array.from({ length: 64 }, () => rgba(0, 200, 0)) },
    false,
    'none',
  );
  assert.ok(result.diagnostics.passed);
  assert.equal(result.master.palettes.p086.colors[result.master.levels[0].indices[0]], 0x001f);
});

test('generation provenance preserves the exact prepared prompt and rejects incomplete records', async () => {
  const { generationPrompt, readGenerationRecord } = await import('../tools/public-pictures/generation.ts');
  const prompt = generationPrompt('tree');
  const record = {
    format: 'superoutride.public-picture-generation',
    version: 1,
    picture: 'enduror-1064a',
    complete: true,
    attempts: [
      {
        attempt: 1,
        savedAt: '2026-10-28T00:00:00Z',
        prompt,
        inputDigest: 'a'.repeat(64),
        bodyDigest: 'b'.repeat(64),
        generatedDigest: 'c'.repeat(64),
        model: null,
        modelVersion: null,
        reportedUsage: null,
        calls: 1,
      },
    ],
  };
  assert.equal(readGenerationRecord(record).attempts[0].prompt, prompt);
  assert.throws(() => readGenerationRecord({ ...record, complete: false }));
  assert.throws(() => readGenerationRecord({ ...record, attempts: [{ ...record.attempts[0], attempt: 2 }] }));
});
