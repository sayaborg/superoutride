import { deg, near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { countOpaqueSpriteColors } from '../dist/graphics/sprite.js';

import {
  createSpriteAssets,
  selectBankVariant,
  selectVehicleSprite,
  selectYawVariant,
} from '../dist/visual/sprite-assets.js';

describe('sprite presentation', () => {
  const assets = createSpriteAssets();

  test('programmer-art sprite assets obey <=15 opaque colors plus transparent', () => {
    const all = [assets.tree, assets.sign, assets.guardrail, assets.building];
    for (const yawRow of assets.car.assets) all.push(...yawRow);
    for (const yawRow of assets.bike.assets) all.push(...yawRow);
    for (const asset of all) {
      assert.ok(countOpaqueSpriteColors(asset) <= 15, `${asset.name} exceeds 15 opaque colors`);
      assert.ok(
        [...asset.pixels].some((pixel) => pixel === 0),
        `${asset.name} has no transparent texel`,
      );
    }
  });

  test('vehicle yaw/bank variants keep a consistent bitmap anchor semantic', () => {
    for (const set of [assets.car, assets.bike]) {
      const first = set.assets[0][0];
      for (const row of set.assets) {
        for (const asset of row) {
          assert.equal(asset.width, first.width);
          assert.equal(asset.height, first.height);
          near(asset.anchorX, first.anchorX, 1e-7);
          near(asset.anchorY, first.anchorY, 1e-7);
        }
      }
    }
  });

  test('yaw and bank selectors cover wrapped yaw and discrete bike bank variants', () => {
    assert.equal(selectYawVariant(0, 24), 0);
    assert.equal(selectYawVariant(Math.PI, 24), 12);
    assert.equal(selectYawVariant(-Math.PI, 24), 12);
    assert.equal(selectBankVariant(-1, 5), 0);
    assert.equal(selectBankVariant(0, 5), 2);
    assert.equal(selectBankVariant(1, 5), 4);
    assert.equal(selectVehicleSprite(assets.bike, 0, 1).bankIndex, 4);
    assert.equal(selectVehicleSprite(assets.car, deg(20), 1).bankIndex, 0);
  });

  test('bike player path selects yaw x bank variant without runtime bitmap rotation', () => {
    const selectedLeft = selectVehicleSprite(assets.bike, deg(-18), -1);
    const selectedCenter = selectVehicleSprite(assets.bike, 0, 0);
    const selectedRight = selectVehicleSprite(assets.bike, deg(18), 1);
    assert.notEqual(selectedLeft.asset.name, selectedCenter.asset.name);
    assert.notEqual(selectedCenter.asset.name, selectedRight.asset.name);
    assert.equal(assets.bike.assets.length, 24);
    assert.ok(assets.bike.assets.every((row) => row.length === 5));
  });
});
