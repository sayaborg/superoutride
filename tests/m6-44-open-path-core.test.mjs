import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileRasterPath,
  rasterPathToWorld,
  sampleRasterPath,
} from '../dist/core/course.js';
import {
  compileGuidePath,
  guidePathToWorld,
  locateWorldOnGuideLocal,
  sampleGuidePath,
} from '../dist/core/guide-curve.js';
import { pseudoDepth, pseudoProject } from '../dist/core/projection.js';
import { computeForwardVisibleInterval } from '../dist/road/terrain-line.js';

const near = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

function createOpenFixture() {
  const five = 5 * Math.PI / 180;
  const raster = compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: 30 },
    { x: Math.sin(five) * 30, z: 30 + Math.cos(five) * 30 },
    { x: Math.sin(five) * 60, z: 30 + Math.cos(five) * 60 },
  ]);
  const guide = compileGuidePath(raster, { lMax: 12, mMin: 0.25, dCam: 5 });
  return { raster, guide };
}

test('M6.44 RasterPath does not create a last-to-first segment', () => {
  const { raster } = createOpenFixture();
  assert.equal(raster.vertices.length, 4);
  assert.equal(raster.segments.length, 3);
  assert.deepEqual(
    raster.segments.map((segment) => [segment.startVertexIndex, segment.endVertexIndex]),
    [[0, 1], [1, 2], [2, 3]],
  );
  near(raster.vertexS.at(-1), raster.length);
});

test('M6.44 RasterPath endpoints have no synthetic closure turn or miter', () => {
  const { raster } = createOpenFixture();
  assert.equal(raster.vertexTurns[0], 0);
  assert.equal(raster.vertexTurns.at(-1), 0);
  assert.equal(raster.vertexTurns[1] > 0, true);

  const start = rasterPathToWorld(raster, 0, 3);
  const end = rasterPathToWorld(raster, raster.length, 3);
  assert.notDeepEqual({ x: start.x, z: start.z }, { x: end.x, z: end.z });
});

test('M6.44 open RasterPath sampling never wraps out-of-range chainage', () => {
  const { raster } = createOpenFixture();
  near(sampleRasterPath(raster, 0).s, 0);
  near(sampleRasterPath(raster, raster.length).s, raster.length);
  assert.throws(() => sampleRasterPath(raster, -1), /outside/);
  assert.throws(() => sampleRasterPath(raster, raster.length + 1), /outside/);
});

test('M6.44 GuidePath has no endpoint wrap fillet and does not sample cyclically', () => {
  const { guide } = createOpenFixture();
  assert.equal(guide.corners[0].trim, 0);
  assert.equal(guide.corners.at(-1).trim, 0);
  near(sampleGuidePath(guide, 0).s, 0);
  near(sampleGuidePath(guide, guide.length).s, guide.length);
  assert.throws(() => sampleGuidePath(guide, -1), /outside/);
  assert.throws(() => sampleGuidePath(guide, guide.length + 1), /outside/);
});

test('M6.44 local world-to-Guide search clips indices instead of wrapping endpoints', () => {
  const { guide } = createOpenFixture();
  const target = guidePathToWorld(guide, guide.length - 2, 0);
  const fromStartWindow = locateWorldOnGuideLocal(guide, target, 0, 1);
  assert.ok(fromStartWindow.segmentIndex <= 1, 'start-local search must not wrap to final Guide segments');
});

test('M6.44 renderer pseudo-depth is render-chainage difference only', () => {
  assert.equal(pseudoDepth(25, 10), 15);
  assert.equal(pseudoDepth(2, 9), -7);
  // Legacy DEV arguments are ignored and cannot change renderer depth authority.
  assert.equal(pseudoDepth(2, 9, 10_000), -7);
});

test('M6.44 pseudo projection preserves same-depth scale without topology input', () => {
  const camera = {
    x: 0,
    y: 2,
    z: 0,
    yaw: 0,
    pitch: 0,
    s: 10,
    focalLength: 200,
    centerX: 160,
    centerY: 120,
  };
  const a = pseudoProject({ x: -3, y: 0, z: 0, s: 15 }, camera);
  const b = pseudoProject({ x: 8, y: 0, z: 0, s: 15 }, camera);
  assert.equal(a.depth, 5);
  assert.equal(b.depth, 5);
  assert.equal(a.scale, b.scale);
});

test('M6.44 forward terrain interval clips at the open path endpoint instead of wrapping', () => {
  const { guide } = createOpenFixture();
  const cameraS = guide.length - 20;
  const interval = computeForwardVisibleInterval(guide, sampleGuidePath(guide, cameraS).heading, cameraS, 2.5, 150);
  assert.ok(interval);
  near(interval.dStart, 2.5);
  near(interval.dEnd, 20, 1e-7);
});
