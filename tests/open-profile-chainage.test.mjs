import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileGuidePath, sampleGuidePath } from '../dist/core/guide-curve.js';
import { HeightProfile } from '../dist/core/height-profile.js';
import { openProfileChainage } from '../dist/core/open-profile.js';
import { compileRasterPath, sampleRasterPath } from '../dist/core/raster-path.js';
import { GroundMapLogicalProfile } from '../dist/groundmap/logical-profile.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

test('open profile normalization retains exact two-sided snapping, interior values and error text', () => {
  for (const s of [-1e-9, -5e-10, -0, 0, 5e-10, 1e-9]) assert.equal(openProfileChainage(s, 1, 'probe'), 0);
  for (const s of [1 - 5e-10, 1, 1 + 5e-10]) assert.equal(openProfileChainage(s, 1, 'probe'), 1);
  for (const s of [2e-9, 0.5, 1 - 2e-9]) assert.equal(openProfileChainage(s, 1, 'probe'), s);
  for (const s of [-2e-9, 1 + 2e-9])
    assert.throws(() => openProfileChainage(s, 1, 'probe'), {
      name: 'RangeError',
      message: 'probe chainage is outside [0, courseLength]',
    });
  for (const s of [NaN, Infinity, -Infinity])
    assert.throws(() => openProfileChainage(s, 1, 'probe'), {
      name: 'RangeError',
      message: 'probe chainage must be finite',
    });
});

test('profile consumers share snapping including physical surfaces while retaining interior geometry semantics', () => {
  const height = new HeightProfile(1, [
    { s: 0, y: 2 },
    { s: 1, y: 4 },
  ]);
  assert.equal(height.sampleRender(5e-10).y, 2);
  assert.equal(height.sampleRender(1 - 5e-10).y, 4);
  const visual = new VisualProfile(
    1,
    [0, 4e-10].map((sStart, i) => ({
      sStart,
      name: String(i),
      groundBaseLeft: { kind: 'transparent' },
      groundBaseRight: { kind: 'transparent' },
    })),
  );
  const ground = new GroundMapLogicalProfile(
    1,
    [0, 4e-10].map((sStart, i) => ({
      sStart,
      name: String(i),
      left: 'GRASS',
      right: 'GRASS',
    })),
  );
  assert.equal(visual.sample(5e-10).name, '0');
  assert.equal(ground.sample(5e-10).name, '0');
  assert.equal(visual.sample(2e-9).name, '1');
  assert.equal(ground.sample(2e-9).name, '1');
  const surface = new SurfaceMap(1, [{ sStart: 0, name: 'strict', bands: [] }]);
  assert.deepEqual(surface.sample(-5e-10, 0), surface.sample(0, 0));
  assert.throws(() => surface.sample(-2e-9, 0), RangeError);
  const raster = compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: 1 },
  ]);
  const guide = compileGuidePath(raster, { lMax: 10, mMin: 0.25, dCam: 5 });
  assert.equal(sampleRasterPath(raster, 5e-10).s, 5e-10);
  assert.equal(sampleGuidePath(guide, 5e-10).s, 5e-10);
});

test('all four equivalent source validators share one helper without alternate cyclic implementations', async () => {
  for (const file of [
    'core/height-profile',
    'visual/visual-profile',
    'groundmap/baked-ground-map',
    'groundmap/logical-profile',
  ]) {
    const source = await readFile(new URL(`../src/${file}.ts`, import.meta.url), 'utf8');
    assert.match(source, /import\s*\{[^}]*\bopenProfileChainage\b/);
    assert.doesNotMatch(source, /function openChainage/);
    assert.doesNotMatch(source, /class Cyclic/);
  }
});
