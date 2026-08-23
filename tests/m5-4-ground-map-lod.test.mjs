import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveGroundMapDensity,
  diagnosticLateralLevel,
  estimateUniqueBaseTexels,
  groundMapFootprintAtLevel,
  requiredChainageLevel,
  requiredPyramidMaxLevel,
  selectGroundMapLevel,
} from '../dist/compiler/ground-map-lod.js';
import {
  buildGroundMapAnisotropicPyramid,
  downsampleGroundMap2x4,
} from '../dist/compiler/ground-map-prefilter.js';
import { rgba } from '../dist/render/software-surface.js';

const current = deriveGroundMapDensity({
  d0: 5,
  focalLength: 200,
  cameraHeight: 2.469902425419539,
  pitchRadians: 8 * Math.PI / 180,
});

const near = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

test('M5.4 current GroundMap base density is derived from d0=D_cam=5m', () => {
  near(current.qL, 0.025);
  near(current.qS, 0.051106653147800385);
  near(current.rhoL, 40);
  near(current.rhoS, 19.566924038402615);
});

test('current camera height raises the 24m x 3000m unique base estimate above the old h=2m example', () => {
  const texels = estimateUniqueBaseTexels(24, 3000, current);
  near(texels, 56352741.23059952, 1e-5);
  assert.ok(texels > 45_700_000);
});

test('anisotropic pyramid footprint grows x2 laterally and x4 in chainage per level', () => {
  const level0 = groundMapFootprintAtLevel(current, 0);
  const level3 = groundMapFootprintAtLevel(current, 3);
  near(level3.qL / level0.qL, 8);
  near(level3.qS / level0.qS, 64);
});

test('runtime level authority is chainage footprint while lateral level remains diagnostic only', () => {
  assert.equal(requiredChainageLevel(current.qS, current.qS), 0);
  assert.equal(requiredChainageLevel(current.qS * 4, current.qS), 1);
  assert.equal(requiredChainageLevel(current.qS * 4.01, current.qS), 2);
  assert.equal(diagnosticLateralLevel(current.qL * 64, current.qL), 6);
  assert.equal(selectGroundMapLevel(current.qS * 4, current.qS, 8), 1);
});

test('required pyramid depth comes only from maximum effective chainage footprint', () => {
  assert.equal(requiredPyramidMaxLevel(current.qS * 64, current.qS), 3);
  assert.equal(selectGroundMapLevel(current.qS * 4096, current.qS, 4), 4);
});

test('2x4 compiler prefilter preserves solid lateral materials and reduces dimensions exactly', () => {
  const red = rgba(200, 20, 10);
  const blue = rgba(20, 30, 220);
  const pixels = new Uint32Array(4 * 4);
  for (let s = 0; s < 4; s += 1) {
    const row = s * 4;
    pixels[row] = red;
    pixels[row + 1] = red;
    pixels[row + 2] = blue;
    pixels[row + 3] = blue;
  }
  const level = downsampleGroundMap2x4({ lateralTexels: 4, chainageTexels: 4, pixels });
  assert.equal(level.lateralTexels, 2);
  assert.equal(level.chainageTexels, 1);
  assert.deepEqual([...level.pixels], [red, blue]);
});

test('pyramid builder enforces exact compiler padding for requested anisotropic levels', () => {
  const color = rgba(90, 100, 110);
  const good = buildGroundMapAnisotropicPyramid({
    lateralTexels: 8,
    chainageTexels: 16,
    pixels: new Uint32Array(8 * 16).fill(color),
  }, 2);
  assert.deepEqual(good.map((level) => [level.lateralTexels, level.chainageTexels]), [[8, 16], [4, 4], [2, 1]]);

  assert.throws(() => buildGroundMapAnisotropicPyramid({
    lateralTexels: 6,
    chainageTexels: 16,
    pixels: new Uint32Array(6 * 16).fill(color),
  }, 2), /divisible/);
});
