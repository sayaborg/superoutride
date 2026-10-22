import assert from 'node:assert/strict';
import test from 'node:test';
import { createProceduralVehicleSolid } from '../../tools/graphics/procedural-vehicle-solid.js';
import { drawVehicleSpriteSet } from '../../tools/graphics/vehicle-pictures.js';
import { readVehicleSpriteSet } from '../../src/vehicle/vehicle-sprite-library.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';

test('procedural banks keep ground contact and bake into the common direction, shadow and six-size contract', () => {
  const shape = createProceduralVehicleSolid();
  shape.box([0, 0.6, 0], [0.5, 0.4, 0.8], [220, 30, 20]);
  shape.ellipsoid([0, 0.7, 0.1], [0.13, 0.15, 0.12], [240, 240, 240]);
  shape.cylinder([0, 0.2, 0.25], [0, 0.5, 0.3], 0.03, [120, 120, 120]);
  for (const z of [-0.3, 0.3]) shape.wheel([0, 0.15, z], 0.15, 0.08, [230, 230, 230], 3);
  const banks = [-30, 0, 30].map((degrees) => shape.finish((degrees * Math.PI) / 180));
  for (const solid of banks) {
    let bottom = Infinity;
    for (let i = 1; i < solid.positions.length; i += 3) bottom = Math.min(bottom, solid.positions[i]);
    assert.equal(bottom, 0);
    assert.ok(solid.height > 0.5 && solid.footprint.length > 0);
    assert.ok(solid.lamp.every((value) => value === 0));
    assert.ok(solid.positions.every(Number.isFinite));
  }
  const palette = [
    [16, 16, 18],
    [60, 60, 64],
    [120, 120, 124],
    [180, 180, 184],
    [245, 245, 245],
    [20, 30, 40],
    [80, 100, 120],
    [220, 30, 20],
    [130, 20, 15],
    [20, 40, 150],
    [240, 200, 20],
    [160, 110, 40],
    [20, 120, 40],
    [210, 150, 100],
  ];
  const style = {
    yawVariants: 4,
    slots: { body: 0, neutral: 5, glass: 2, accent: 7 },
    bodyKeys: [],
    palettes: { race: palette, second: palette, third: palette, fourth: palette },
    paint: { exposure: 1 },
    glass: { glint: 240 },
    brakeLamp: { off: [0, 0, 0], on: [0, 0, 0] },
  };
  const baked = drawVehicleSpriteSet(banks, style, CAMERA_DEFINITION, undefined, 30);
  const admitted = readVehicleSpriteSet(baked, 'provisional');
  assert.equal(admitted.yawVariants, 4);
  assert.equal(admitted.bankVariants, 3);
  assert.equal(admitted.bankDegrees, 30);
  assert.equal(baked.pictures.length, 12);
  for (const picture of baked.pictures) {
    assert.equal(picture.sizes.length, 6);
    for (const size of picture.sizes) {
      assert.ok(size.rows.join('').match(/[1-9a-e]/));
      assert.ok(!size.rows.join('').includes('f'));
      assert.ok(size.shadow.rows.join('').includes('1'));
    }
  }
  assert.notDeepEqual(baked.pictures[0], baked.pictures[2]);
  assert.notDeepEqual(baked.pictures[1], baked.pictures[4]);
  assert.deepEqual(
    drawVehicleSpriteSet(banks[1], style, CAMERA_DEFINITION),
    drawVehicleSpriteSet([banks[1]], style, CAMERA_DEFINITION),
  );
});
