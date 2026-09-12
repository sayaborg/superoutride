import { deg, near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  filletMetric,
  guidePathToWorld,
  locateWorldOnGuideGlobal,
  locateWorldOnGuideLocal,
  minimumGuideRadius,
  sampleGuidePath,
  sampleGuideSegment,
} from '../dist/core/guide-curve.js';

import { compileRasterPath } from '../dist/core/raster-path.js';
import { createCircularArcGuide, createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';

describe('open coordinate geometry', () => {
  test('Guide fallback math reproduces the Core 10-degree reference scale', () => {
    const mu = filletMetric(deg(10));
    near(mu, 0.9974602317917259, 1e-12);
    const rMin = minimumGuideRadius(12, 0.25, mu);
    near(rMin, 16.013591455974513, 1e-9);
  });

  test('circular-authoring metadata applies to interior Guide corners only', () => {
    const guide = createCircularArcGuide();
    const corner = guide.corners[1];
    near(corner.radius, 100 * Math.cos(deg(5)), 1e-10);
    assert.ok(corner.radius > corner.rMin);

    assert.equal(guide.corners[0].trim, 0);
    assert.equal(guide.corners.at(-1).trim, 0);
    near(sampleGuidePath(guide, 0).heading, guide.raster.segments[0].heading, 1e-10);
  });

  test('Guide segments are G1 at every compiled interior boundary without a synthetic seam', () => {
    const guide = createCircularArcGuide();
    for (let i = 0; i < guide.segments.length - 1; i += 1) {
      const a = guide.segments[i];
      const b = guide.segments[i + 1];
      near(a.sEnd, b.sStart, 1e-8);
      const left = sampleGuideSegment(guide, a, a.sEnd);
      const right = sampleGuideSegment(guide, b, b.sStart);
      near(left.x, right.x, 1e-7);
      near(left.z, right.z, 1e-7);
      near(Math.sin(left.heading), Math.sin(right.heading), 1e-8);
      near(Math.cos(left.heading), Math.cos(right.heading), 1e-8);
    }

    near(guide.segments[0].sStart, 0, 1e-8);
    near(guide.segments.at(-1).sEnd, guide.length, 1e-8);
    assert.notDeepEqual(
      sampleGuidePath(guide, 0),
      sampleGuidePath(guide, guide.length),
      'open Guide endpoints must not be treated as one cyclic seam',
    );
  });

  test('world to Guide coordinate recovers signed lateral position', () => {
    const guide = createCircularArcGuide();
    const world = guidePathToWorld(guide, 42, 6.5);
    const global = locateWorldOnGuideGlobal(guide, world);
    near(global.s - 42, 0, 1e-7);
    near(global.l, 6.5, 1e-7);

    const local = locateWorldOnGuideLocal(guide, world, world.segmentIndex, 2);
    near(local.s - 42, 0, 1e-7);
    near(local.l, 6.5, 1e-7);
  });

  test('local Guide search requires explicit initialization instead of silently going global', () => {
    const guide = createCircularArcGuide();
    assert.throws(
      () => locateWorldOnGuideLocal(guide, { x: 0, z: 0 }, -1),
      /previousSegmentIndex must identify a segment/,
    );
  });

  test('Guide world-coordinate round trip remains continuous across the whole open path', () => {
    const guide = createCircularArcGuide();
    const laterals = [-12, -6, 0, 6, 12];
    for (let s = 0; s < guide.length; s += 5) {
      for (const l of laterals) {
        const world = guidePathToWorld(guide, s, l);
        const local = locateWorldOnGuideLocal(guide, world, world.segmentIndex, 2);
        near(local.s - s, 0, 2e-6);
        near(local.l, l, 2e-6);
      }
    }
  });
});

describe('flat stadium geometry', () => {
  test('free world motion on the long straight produces simultaneous s and l change', () => {
    const guide = createStadiumGuide();
    const start = guidePathToWorld(guide, 60, 0);
    const yaw = start.heading + deg(20);
    const travel = 10;
    const moved = {
      x: start.x + Math.sin(yaw) * travel,
      z: start.z + Math.cos(yaw) * travel,
    };
    const located = locateWorldOnGuideLocal(guide, moved, start.segmentIndex, 3);

    near(located.s - 60, Math.cos(deg(20)) * travel, 0.02);
    near(located.l, Math.sin(deg(20)) * travel, 0.02);
    assert.ok(located.l > 0);
  });
});

describe('authored boundary regressions', () => {
  // Regression: compilation discarded a 50 nm straight using its 100 nm tolerance,
  // then the reader rejected the accepted gap using its 10 nm sampling tolerance.
  test('compiled Guide coverage is sampleable across sub-compilation-tolerance joins', async () => {
    const { compileGuidePath, minimumGuideRadius, filletMetric, sampleGuidePath } =
      await import('../dist/core/guide-curve.js');
    const turn = (5 * Math.PI) / 180;
    const trim = minimumGuideRadius(1, 0.25, filletMetric(turn)) * Math.tan(turn / 2);
    for (const gap of [5e-8, 5e-9]) {
      const length = 2 * trim + gap;
      const v = [
        { x: 0, z: 0 },
        { x: 0, z: 10 },
      ];
      v.push({ x: Math.sin(turn) * length, z: 10 + Math.cos(turn) * length });
      v.push({ x: v[2].x + Math.sin(2 * turn) * 10, z: v[2].z + Math.cos(2 * turn) * 10 });
      const guide = compileGuidePath(compileRasterPath(v), { lMax: 1, mMin: 0.25 });
      for (const fraction of [0, 0.1, 0.5, 0.9, 1]) {
        const sample = sampleGuidePath(guide, 10 + trim + fraction * gap);
        assert.ok([sample.x, sample.z, sample.s, sample.heading].every(Number.isFinite));
        assert.ok(Math.abs(sample.heading - turn) < 1e-8);
      }
    }
  });
});
