import assert from 'node:assert/strict';
import test from 'node:test';
import { HeightProfile } from '../dist/core/height-profile.js';
import { GroundMapLogicalProfile } from '../dist/groundmap/logical-profile.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

const visualSection = () => ({
  sStart: 0,
  name: 'ground',
  groundBaseLeft: { kind: 'color', color: 0x123456ff },
  groundBaseRight: { kind: 'transparent' },
});
const logicalSection = () => ({ sStart: 0, name: 'ground', left: 'ROCK', right: 'GRASS' });
const surfaceSection = () => ({
  sStart: 0,
  name: 'road',
  bands: [{ lMin: -4, lMax: 4, type: 'ASPHALT' }],
});

test('nonfinite endpoint authoring is rejected before normalization can hide it', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(
      () =>
        new HeightProfile(100, [
          { s: value, y: 0 },
          { s: 100, y: 0 },
        ]),
    );
    assert.throws(
      () =>
        new HeightProfile(100, [
          { s: 0, y: 0 },
          { s: value, y: 0 },
        ]),
    );
    assert.throws(() => new VisualProfile(100, [{ ...visualSection(), sStart: value }]));
    assert.throws(() => new GroundMapLogicalProfile(100, [{ ...logicalSection(), sStart: value }]));
    assert.throws(() => new SurfaceMap(100, [{ ...surfaceSection(), sStart: value }]));
  }
});

test('nonfinite surface extents and coordinates cannot silently turn into VOID', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => new SurfaceMap(value, [surfaceSection()]));
    for (const edge of ['lMin', 'lMax']) {
      const section = surfaceSection();
      section.bands[0][edge] = value;
      assert.throws(() => new SurfaceMap(100, [section]));
    }
    const surface = new SurfaceMap(100, [surfaceSection()]);
    assert.throws(() => surface.sample(50, value), RangeError);
  }
  const surface = new SurfaceMap(100, [surfaceSection()]);
  assert.equal(surface.sample(50, 5).type, 'VOID');
  assert.equal(surface.sample(50, 0).type, 'ASPHALT');
});

test('source profiles own immutable geometry, paint and material copies', () => {
  const nodes = [
    { s: 0, y: 0 },
    { s: 100, y: 10 },
  ];
  const height = new HeightProfile(100, nodes);
  const visualInput = visualSection();
  const visual = new VisualProfile(100, [visualInput]);
  const logicalInput = logicalSection();
  const logical = new GroundMapLogicalProfile(100, [logicalInput]);
  const surfaceInput = surfaceSection();
  const surface = new SurfaceMap(100, [surfaceInput]);
  nodes[1].y = 999;
  visualInput.groundBaseLeft.color = 0;
  logicalInput.left = 'GRASS';
  surfaceInput.bands[0].lMax = -3;
  assert.equal(height.sampleRender(100).y, 10);
  assert.equal(visual.sample(50).groundBaseLeft.color, 0x123456ff);
  assert.equal(logical.sample(50).left, 'ROCK');
  assert.equal(surface.sample(50, 0).type, 'ASPHALT');
  assert.throws(() => {
    height.nodes[1].y = 999;
  }, TypeError);
  assert.throws(() => {
    visual.sample(50).groundBaseLeft.color = 0;
  }, TypeError);
  assert.throws(() => {
    logical.sample(50).left = 'GRASS';
  }, TypeError);
  assert.throws(() => {
    surface.sectionAt(50).bands[0].lMax = -3;
  }, TypeError);
  assert.throws(() => {
    surface.sample(50, 0).material.gripFactor = 999;
  }, TypeError);
});

test('normalizing an authored start within tolerance leaves no gap at s=0', () => {
  const surface = new SurfaceMap(100, [
    { ...surfaceSection(), sStart: 5e-10 },
    { sStart: 50, name: 'sand', bands: [{ lMin: -4, lMax: 4, type: 'SAND' }] },
  ]);
  assert.equal(surface.sample(0, 0).type, 'ASPHALT');
  assert.equal(surface.sectionAt(0).sStart, 0);
  assert.equal(surface.sample(50, 0).type, 'SAND');
});
