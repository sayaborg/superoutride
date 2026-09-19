import assert from 'node:assert/strict';
import test from 'node:test';

import { createStadiumEnvironment } from '../../dist/dev/fixtures/stadium-environment.js';
import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';
import { createSpriteAsset } from '../../dist/graphics/sprite.js';

import { SurfaceMap } from '../../dist/physics/surface-map.js';

const guide = createStadiumGuide();
const compiled = createStadiumEnvironment(guide.length);

test('fixture attributes retain independent authored change points', () => {
  assert.deepEqual(
    compiled.visualSections.map((section) => section.sStart),
    [0, 455, 625],
  );
  assert.deepEqual(
    compiled.surfaceSections.map((section) => section.sStart),
    [0, 280, 360, 455, 625],
  );
});

test('compiled SurfaceMap preserves sand, cliff verge and implicit VOID semantics', () => {
  const map = new SurfaceMap(guide.length, compiled.surfaceSections);
  assert.equal(map.sample(300, 7).type, 'SAND');
  assert.equal(map.sample(500, -6).type, 'DIRT');
  assert.equal(map.sample(500, -8).type, 'VOID');
  assert.equal(map.sample(500, 7).type, 'GRASS');
});

test('physical profile rejects overlapping bands', () => {
  const bad = [
    {
      ...compiled.surfaceSections[0],
      bands: [
        { lMin: -5, lMax: 1, type: 'ASPHALT' },
        { lMin: 0, lMax: 5, type: 'GRASS' },
      ],
    },
  ];
  assert.throws(() => new SurfaceMap(guide.length, bad), /must not overlap/);
});

test('sprite assets require positive physical width and have only physical scale authority', () => {
  const pixels = new Uint32Array(80 * 56);
  const asset = createSpriteAsset('CAR_REAR', 80, 56, pixels, undefined, undefined, 2);
  assert.equal(asset.worldWidthMeters, 2);
  assert.equal('visualScale' in asset, false);
  assert.ok(Object.isFrozen(asset));
  for (const width of [undefined, 0, -1, NaN, Infinity]) {
    assert.throws(() => createSpriteAsset('BAD', 80, 56, pixels, undefined, undefined, width), /worldWidthMeters/);
  }
  assert.throws(() => {
    asset.visualScale = 0.5;
  }, TypeError);
});
