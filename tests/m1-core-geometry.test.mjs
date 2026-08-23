import assert from 'node:assert/strict';
import test from 'node:test';

import { compileRasterCourse, rasterCourseToWorld } from '../dist/core/course.js';
import { createM1DebugGuide } from '../dist/core/debug-course.js';
import {
  filletMetric,
  guideCourseToWorld,
  locateWorldOnGuideGlobal,
  locateWorldOnGuideLocal,
  minimumGuideRadius,
  sampleGuideCurve,
  sampleGuideSegment,
} from '../dist/core/guide-curve.js';
import {
  normalFromHeading,
  tangentFromHeading,
  wrapSigned,
} from '../dist/core/math.js';
import {
  pseudoProject,
  straightRoadScreenX,
} from '../dist/core/projection.js';

const deg = (value) => value * Math.PI / 180;
const near = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

test('wrapSigned follows Core interval (-L/2, +L/2]', () => {
  assert.equal(wrapSigned(0, 100), 0);
  assert.equal(wrapSigned(50, 100), 50);
  assert.equal(wrapSigned(-50, 100), 50);
  assert.equal(wrapSigned(51, 100), -49);
  assert.equal(wrapSigned(-51, 100), 49);
});

test('heading basis matches +Z forward and +X right', () => {
  assert.deepEqual(tangentFromHeading(0), { x: 0, z: 1 });
  assert.deepEqual(normalFromHeading(0), { x: 1, z: -0 });

  const t90 = tangentFromHeading(Math.PI / 2);
  near(t90.x, 1);
  near(t90.z, 0);
});

test('Guide fallback math reproduces the Core 10-degree reference scale', () => {
  const mu = filletMetric(deg(10));
  near(mu, 0.9974602317917259, 1e-12);
  const rMin = minimumGuideRadius(12, 0.25, mu);
  near(rMin, 16.013591455974513, 1e-9);
});

test('circular-authoring metadata produces the maximum fitting Guide radius', () => {
  const guide = createM1DebugGuide();
  const corner = guide.corners[0];
  near(corner.radius, 100 * Math.cos(deg(5)), 1e-10);
  assert.ok(corner.radius > corner.rMin);

  const atStart = sampleGuideCurve(guide, 0);
  near(atStart.heading, 0, 1e-10);
});

test('Guide segments are G1 at every compiled boundary', () => {
  const guide = createM1DebugGuide();
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

  const last = guide.segments.at(-1);
  const first = guide.segments[0];
  const cyclicLeft = sampleGuideSegment(guide, last, guide.length);
  const cyclicRight = sampleGuideSegment(guide, first, 0);
  near(cyclicLeft.x, cyclicRight.x, 1e-7);
  near(cyclicLeft.z, cyclicRight.z, 1e-7);
  near(Math.sin(cyclicLeft.heading), Math.sin(cyclicRight.heading), 1e-8);
  near(Math.cos(cyclicLeft.heading), Math.cos(cyclicRight.heading), 1e-8);
});

test('world to Guide coordinate recovers signed lateral position', () => {
  const guide = createM1DebugGuide();
  const world = guideCourseToWorld(guide, 42, 6.5);
  const global = locateWorldOnGuideGlobal(guide, world);
  near(wrapSigned(global.s - 42, guide.length), 0, 1e-7);
  near(global.l, 6.5, 1e-7);

  const local = locateWorldOnGuideLocal(guide, world, world.segmentIndex, 2);
  near(wrapSigned(local.s - 42, guide.length), 0, 1e-7);
  near(local.l, 6.5, 1e-7);
});

test('local Guide search requires explicit initialization instead of silently going global', () => {
  const guide = createM1DebugGuide();
  assert.throws(
    () => locateWorldOnGuideLocal(guide, { x: 0, z: 0 }, -1),
    /explicit global initialization/,
  );
});

test('pseudo projection keeps same-s same-height anchors at identical depth, scale and Y', () => {
  const guide = createM1DebugGuide();
  const camPlan = guideCourseToWorld(guide, 0, 0);
  const camera = {
    x: camPlan.x,
    y: 2,
    z: camPlan.z,
    yaw: camPlan.heading,
    pitch: deg(8),
    s: 0,
    focalLength: 200,
    centerX: 160,
    centerY: 120,
    courseLength: guide.length,
  };

  const leftPlan = rasterCourseToWorld(guide.raster, 40, -10);
  const rightPlan = rasterCourseToWorld(guide.raster, 40, 10);
  const left = pseudoProject({ ...leftPlan, y: 0 }, camera);
  const right = pseudoProject({ ...rightPlan, y: 0 }, camera);

  near(left.depth, right.depth);
  near(left.scale, right.scale);
  near(left.y, right.y);
  assert.notEqual(left.x, right.x);
});

test('general pseudo projection reduces to Core straight-road yaw equation', () => {
  const theta = deg(18);
  const f = 200;
  const d = 50;
  const l = 7;
  const lCam = -2;
  const camera = {
    x: lCam,
    y: 2,
    z: 0,
    yaw: theta,
    pitch: 0,
    s: 0,
    focalLength: f,
    centerX: 160,
    centerY: 120,
    courseLength: 1000,
  };
  const projected = pseudoProject({ x: l, y: 0, z: d, s: d }, camera);
  const expected = straightRoadScreenX(160, f, d, theta, l, lCam);
  near(projected.x, expected, 1e-10);
});

test('raster compiler rejects a turn sharper than the Core 10-degree hard limit', () => {
  assert.throws(() => compileRasterCourse([
    { x: 0, z: 0 },
    { x: 0, z: 20 },
    { x: 10, z: 30 },
    { x: 20, z: 0 },
  ]), /10deg limit/);
});

test('Guide world-coordinate round trip remains continuous across the whole closed course', () => {
  const guide = createM1DebugGuide();
  const laterals = [-12, -6, 0, 6, 12];
  for (let s = 0; s < guide.length; s += 5) {
    for (const l of laterals) {
      const world = guideCourseToWorld(guide, s, l);
      const local = locateWorldOnGuideLocal(guide, world, world.segmentIndex, 2);
      near(wrapSigned(local.s - s, guide.length), 0, 2e-6);
      near(local.l, l, 2e-6);
    }
  }
});
