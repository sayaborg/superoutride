import assert from 'node:assert/strict';
import test from 'node:test';

import { compileRasterCourse, rasterCourseToWorld } from '../dist/core/course.js';
import { createM1DebugGuide } from '../dist/dev/debug-course.js';
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

test('wrapSigned remains available to topology/gameplay consumers', () => {
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

test('circular-authoring metadata applies to interior Guide corners only', () => {
  const guide = createM1DebugGuide();
  const corner = guide.corners[1];
  near(corner.radius, 100 * Math.cos(deg(5)), 1e-10);
  assert.ok(corner.radius > corner.rMin);

  assert.equal(guide.corners[0].trim, 0);
  assert.equal(guide.corners.at(-1).trim, 0);
  near(sampleGuideCurve(guide, 0).heading, guide.raster.segments[0].heading, 1e-10);
});

test('Guide segments are G1 at every compiled interior boundary without a synthetic seam', () => {
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

  near(guide.segments[0].sStart, 0);
  near(guide.segments.at(-1).sEnd, guide.length);
  assert.notDeepEqual(
    sampleGuideCurve(guide, 0),
    sampleGuideCurve(guide, guide.length),
    'open Guide endpoints must not be treated as one cyclic seam',
  );
});

test('world to Guide coordinate recovers signed lateral position', () => {
  const guide = createM1DebugGuide();
  const world = guideCourseToWorld(guide, 42, 6.5);
  const global = locateWorldOnGuideGlobal(guide, world);
  near(global.s - 42, 0, 1e-7);
  near(global.l, 6.5, 1e-7);

  const local = locateWorldOnGuideLocal(guide, world, world.segmentIndex, 2);
  near(local.s - 42, 0, 1e-7);
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
  };
  const projected = pseudoProject({ x: l, y: 0, z: d, s: d }, camera);
  const expected = straightRoadScreenX(160, f, d, theta, l, lCam);
  near(projected.x, expected, 1e-10);
});

test('raster compiler rejects an interior turn sharper than the Core 10-degree hard limit', () => {
  assert.throws(() => compileRasterCourse([
    { x: 0, z: 0 },
    { x: 0, z: 20 },
    { x: 10, z: 30 },
    { x: 20, z: 0 },
  ]), /10deg limit/);
});

test('raster fixed-l strip edges converge to the same miter point from both sides of every interior vertex', () => {
  const course = createM1DebugGuide().raster;
  const epsilonS = 1e-7;
  for (let i = 1; i < course.vertices.length - 1; i += 1) {
    const sVertex = course.vertexS[i];
    for (const l of [-12, -4.5, 0, 4.5, 12]) {
      const before = rasterCourseToWorld(course, sVertex - epsilonS, l);
      const at = rasterCourseToWorld(course, sVertex, l);
      const after = rasterCourseToWorld(course, sVertex + epsilonS, l);
      assert.ok(Math.hypot(before.x - at.x, before.z - at.z) < 2e-6);
      assert.ok(Math.hypot(after.x - at.x, after.z - at.z) < 2e-6);
    }
  }
});

test('raster interior miter is exact while endpoint bases are adjacent-segment normals', () => {
  const course = createM1DebugGuide().raster;
  const maxMiterScale = 1 / Math.cos(deg(5));
  for (let i = 1; i < course.vertices.length - 1; i += 1) {
    const incoming = course.segments[i - 1].heading;
    const outgoing = course.segments[i].heading;
    const nIn = normalFromHeading(incoming);
    const nOut = normalFromHeading(outgoing);
    const m = course.vertexMiters[i];
    near(m.x * nIn.x + m.z * nIn.z, 1, 1e-12);
    near(m.x * nOut.x + m.z * nOut.z, 1, 1e-12);
    assert.ok(Math.hypot(m.x, m.z) <= maxMiterScale + 1e-12);
  }

  assert.deepEqual(course.vertexMiters[0], normalFromHeading(course.segments[0].heading));
  assert.deepEqual(course.vertexMiters.at(-1), normalFromHeading(course.segments.at(-1).heading));
});

test('Guide world-coordinate round trip remains continuous across the whole open path', () => {
  const guide = createM1DebugGuide();
  const laterals = [-12, -6, 0, 6, 12];
  for (let s = 0; s < guide.length; s += 5) {
    for (const l of laterals) {
      const world = guideCourseToWorld(guide, s, l);
      const local = locateWorldOnGuideLocal(guide, world, world.segmentIndex, 2);
      near(local.s - s, 0, 2e-6);
      near(local.l, l, 2e-6);
    }
  }
});
