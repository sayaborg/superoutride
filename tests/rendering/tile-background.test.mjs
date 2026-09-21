import assert from 'node:assert/strict';
import test from 'node:test';
import { TileBackgroundImage } from '../../dist/graphics/tile-background-image.js';
import { drawTileBackground } from '../../dist/visual/tile-background.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { backgroundDocument, palette16 } from '../helpers/indexed-images.mjs';
import { createTestSpriteAssets } from '../helpers/sprite-assets.mjs';
import { createVehiclePaletteVariant } from '../../dist/visual/sprite-assets.js';
import { drawScaledSprite } from '../../dist/graphics/sprite.js';

test('tile raster shares packed patterns while preserving per-tile palettes, transparent zero and infinite yaw wrap', () => {
  const source = backgroundDocument(0);
  source.palettes[0][0] = 0x03e0; // unused slot is never read as green
  source.palettes.push(palette16([0x7c00]));
  source.patterns[0].indices[0] = 0;
  source.tiles[1] = [0, 1];
  const image = new TileBackgroundImage(source);
  const prior = rgb555ToRgba(0x001f),
    target = new Uint32Array(40).fill(prior);
  image.paintRow(target, 0, 1272, 0, 40);
  assert.equal(target[8], prior);
  assert.equal(target[9], rgb555ToRgba(0), 'opaque black is not transparent');
  assert.equal(target[24], prior);
  assert.equal(target[25], rgb555ToRgba(0x7c00), 'same pattern uses the next tile palette');
  source.patterns[0].indices.fill(15);
  source.palettes[1][1] = 0;
  const again = new Uint32Array(40).fill(prior);
  image.paintRow(again, 0, 1272, 0, 40);
  assert.deepEqual(again, target, 'reader owns nested pattern and palette bytes');
  const camera = { x: 0, y: 3, z: 0, s: 0, yaw: 0, pitch: 0, centerY: 120, focalLength: 200 };
  const a = new SoftwareSurface(320, 240),
    b = new SoftwareSurface(320, 240);
  const bg = { image, sourceHorizonY: 320, yawOriginRadians: 0 };
  drawTileBackground(a, bg, camera);
  drawTileBackground(b, bg, { ...camera, x: 10000, z: 10000, yaw: 2 * Math.PI });
  assert.deepEqual(a.pixels, b.pixels, 'translation has no parallax and full yaw loops');
  for (const alter of [
    (d) => d.tiles.pop(),
    (d) => (d.patterns[0].indices[0] = 16),
    (d) => d.palettes[0].pop(),
    (d) => (d.tiles[0][1] = 99),
  ]) {
    const malformed = backgroundDocument();
    alter(malformed);
    assert.throws(() => new TileBackgroundImage(malformed), RangeError);
  }
});

test('shipped car palette choices share every completed pattern and produce independent near and distant brake images', () => {
  const normal = createTestSpriteAssets().car;
  const replacement = [...normal.assets[0][0].paletteChoices[1]];
  const braking = createVehiclePaletteVariant(normal, replacement);
  replacement[1] ^= 31; // caller mutation cannot recolor a bound instance
  const original = normal.assets[0][0],
    variant = braking.assets[0][0];
  assert.equal(original.levels.length, variant.levels.length);
  assert.ok(original.levels.length > 1);
  original.levels.forEach((level, k) => assert.equal(level.pattern, variant.levels[k].pattern));
  for (const ppm of [40, 5]) {
    const a = new SoftwareSurface(320, 240),
      b = new SoftwareSurface(320, 240);
    drawScaledSprite(a, original, 160, 200, ppm);
    drawScaledSprite(b, variant, 160, 200, ppm);
    assert.notDeepEqual(a.pixels, b.pixels, `lamp survives the shipped level at ${ppm} px/m`);
    assert.equal(a.pixels.filter((v) => v !== 0).length, b.pixels.filter((v) => v !== 0).length);
  }
});
