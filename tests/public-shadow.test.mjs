import assert from 'node:assert/strict';
import test from 'node:test';
import { publicPictureShadow } from '../tools/public-pictures/shadow.ts';
import { spriteIdentityMixtures } from '../tools/graphics/sprite-source-compiler.ts';
import { compileSpriteLod } from '../tools/graphics/sprite-lod-compiler.ts';

const palette = [0, ...Array(15).fill(32767)];
const board = (height = 40) => ({
  format: 'superoutride.sprite-lod',
  version: 7,
  name: 'test-board',
  width: 40,
  height,
  anchorX: 19.5,
  anchorY: 39.5,
  defaultPalette: 'original',
  palettes: { original: { colors: palette } },
  levels: [{ paletteRgb555: palette, indices: Array(40 * height).fill(1), mixtures: spriteIdentityMixtures() }],
});

test('public shadow projects texel areas behind and right of the board and excludes painted ground', () => {
  const source = board();
  const shadow = publicPictureShadow(source);
  assert.deepEqual(publicPictureShadow(board(65)), shadow);
  assert.equal(source.anchorX - shadow.anchorX, Math.trunc(source.anchorX - shadow.anchorX));
  assert.equal(source.anchorY - shadow.anchorY, Math.trunc(source.anchorY - shadow.anchorY));
  const xy = shadow.levels[0].indices.flatMap((v, i) =>
    v ? [[(i % shadow.width) - shadow.anchorX, Math.floor(i / shadow.width) - shadow.anchorY]] : [],
  );
  assert.ok(xy.length > 40, 'the projected areas cover a surface, not a sampled line');
  assert.ok(Math.max(...xy.map((p) => p[0])) > 20, 'light from the left casts right');
  assert.ok(Math.min(...xy.map((p) => p[1])) < -4, 'light from the front casts behind');
  assert.ok(Math.max(...xy.map((p) => p[1])) <= 0.5);
  assert.notDeepEqual(publicPictureShadow(source, { elevation: 30, azimuth: 45 }), shadow);
  assert.deepEqual(source, board(), 'changing light leaves the input body unchanged');
});

test('public shadow uses existing binary LOD and vertical light casts no area from a zero-thickness board', () => {
  const source = board();
  const vertical = publicPictureShadow(source, { elevation: 90, azimuth: 0 });
  assert.ok(vertical.levels[0].indices.every((v) => v === 0));
  const shadow = publicPictureShadow(source);
  const full = compileSpriteLod({ ...source, shadow });
  assert.equal(full.shadow.levels.length, full.levels.length);
  assert.ok(full.shadow.levels.every((level) => level.indices.some((v) => v === 1)));
  assert.throws(() => publicPictureShadow(source, { elevation: 0, azimuth: 45 }));
});
