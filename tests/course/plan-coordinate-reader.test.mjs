import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileRasterPath } from '../../src/course/geometry/raster-path.js';
import { compileGuidePath } from '../../src/course/geometry/guide-curve.js';
import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import {
  createPlanCoordinateSample,
  createPlanProjectionWorkspace,
} from '../../src/course/geometry/plan-coordinate.js';
import { compilePhysicalRaceGate } from '../../src/race/physical-race-gate.js';
import { compileOrderedRaceCourseRules } from '../../src/race/ordered-race-progress.js';
import { createCourseGeometryView } from '../../src/course/course-geometry-view.js';
import { createCourseDrivingReaders } from '../../src/course/course-driving-readers.js';
import { compileCoursePhysicalDomains } from '../../src/course/compiler/course-physical-overlap.js';
import { createCourseDrivingGraph } from '../../src/race/course-driving-session.js';
import { COURSE_DRIVING_POLICY } from '../../src/race/course-driving-policy.js';
import { loadCourse } from '../../tools/course/authoring-io.ts';

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const projection = () => ({ s: 0, l: 0, seed: -1, distanceSquared: 0 });
const metrics = () => ({ curvature: 0, metric: 1, offsetMetric: 1 });

function physicalProduct(links) {
  const { pose, step, contact } = COURSE_DRIVING_POLICY.guard;
  const zero = { behind: 0, ahead: 0, left: 0, right: 0 };
  const result = compileCoursePhysicalDomains(links, {
    pose,
    step,
    consumers: { contact, driverLookahead: zero, reverseRecovery: zero },
  });
  assert.ok(result.ok, JSON.stringify(result.ok ? null : result));
  return result.value;
}

test('native plan reader supplies varying bounds, metric and unclamped seeded projection', () => {
  const turn = Math.PI / 36;
  const raster = compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: 100 },
    { x: 100 * Math.sin(turn), z: 100 + 100 * Math.cos(turn) },
  ]);
  const reader = createPlanCoordinateReader(
    compileGuidePath(raster, {
      envelope: [
        { s: 0, lMax: 4 },
        { s: raster.length, lMax: 6 },
      ],
      mMin: 0.5,
    }),
  );
  assert.ok(Object.isFrozen(reader));
  assert.ok(Object.isFrozen(reader.domain));
  assert.equal(reader.domain.start, 0);
  assert.equal(reader.domain.end, raster.length);
  const bounds = { left: 0, right: 0 };
  assert.equal(reader.domain.lateralAt(50, bounds), bounds);
  assert.deepEqual(bounds, { left: -4.5, right: 4.5 });
  const point = createPlanCoordinateSample();
  const workspace = createPlanProjectionWorkspace();
  const observed = projection();
  const candidates = reader.projectionCandidates(25, 175);
  assert.ok(Object.isFrozen(candidates));
  assert.equal(candidates.length, reader.seedCount);
  assert.equal(candidates[0].start, 25);
  assert.equal(candidates[0].extent.start, 0);
  assert.equal(candidates.at(-1).end, 175);
  assert.equal(candidates.at(-1).extent.end, reader.domain.end);
  for (const candidate of candidates) {
    assert.ok(Object.isFrozen(candidate) && Object.isFrozen(candidate.extent) && Object.isFrozen(candidate.bounds));
    const s = (candidate.start + candidate.end) / 2;
    reader.toWorld(s, 2, point);
    assert.equal(candidate.project(point, observed, workspace), observed);
    near(observed.s, s);
    near(observed.l, 2);
    assert.equal(observed.seed, candidate.seed);
  }
  for (const s of [0, 50, 100, 150, reader.domain.end]) {
    assert.equal(reader.toWorld(s, 2, point), point);
    assert.equal(reader.locateLocal(point, point.seed, 0, observed, workspace), observed);
    near(observed.s, s);
    near(observed.l, 2);
    assert.equal(observed.seed, point.seed);
    const differential = reader.metricsAt(s, 2, point.seed, metrics());
    assert.ok(differential.metric > 0);
    assert.equal(differential.offsetMetric, 1 - differential.curvature * 2);
    if (s === 100) assert.ok(differential.curvature > 0);
  }
  reader.toWorld(50, 9, point);
  reader.locateLocal(point, point.seed, 0, observed, workspace);
  assert.equal(observed.l, 9, 'projection does not clamp to the coordinate envelope');
  assert.equal(observed.distanceSquared, 81);
  assert.throws(() => reader.locateLocal(point, -1, 0, observed, workspace), RangeError);
  assert.throws(() => reader.locateLocal(point, point.seed, -1, observed, workspace), RangeError);
  assert.throws(() => reader.toWorld(-1, 0, point), RangeError);
  assert.throws(() => reader.domain.lateralAt(reader.domain.end + 1, bounds), RangeError);
});

test('race gates consume asymmetric Reader domains without compiled-path structure', () => {
  let boundsReads = 0;
  const reader = Object.freeze({
    domain: Object.freeze({
      start: 0,
      end: 100,
      lateralAt(s, out) {
        boundsReads += 1;
        return Object.assign(out, { left: -2 - s / 10, right: 4 + s / 10 });
      },
    }),
    toWorld(s, l, out) {
      return Object.assign(out, { x: l, z: s, s, l, heading: 0, seed: 0 });
    },
    metricsAt(_s, _l, _seed, out) {
      return Object.assign(out, metrics());
    },
    locateLocal(world, seed, _radius, out) {
      return Object.assign(out, { s: world.z, l: world.x, seed, distanceSquared: world.x ** 2 });
    },
  });
  const gate = compilePhysicalRaceGate(reader, 0, 'checkpoint', 'A', 20);
  assert.equal(gate.center.x, 1);
  assert.equal(gate.center.z, 20);
  assert.equal(gate.halfWidth, 5);
  const rules = compileOrderedRaceCourseRules(reader, [
    { kind: 'checkpoint', name: 'A', s: 20 },
    { kind: 'finish', name: 'F', s: 80 },
  ]);
  assert.equal(rules.coordinates, reader);
  assert.equal(rules.gates[1].halfWidth, 11);
  assert.equal(boundsReads, 3);
  const explicit = compilePhysicalRaceGate(reader, 0, 'finish', 'B', 30, { left: -3, right: 1 });
  assert.equal(explicit.center.x, -1);
  assert.equal(explicit.halfWidth, 2);
  assert.equal(boundsReads, 3, 'carriageway gate bounds remain distinct from the coordinate domain');
});

test('occurrence plan reader maps domains, poses, metrics and projection seeds through the same contract', async () => {
  const { course } = await loadCourse(
    fileURLToPath(new URL('../../content/courses/ribbon-fork.course.json', import.meta.url)),
  );
  const readers = createCourseDrivingReaders(physicalProduct(course.links));
  const session = createCourseDrivingGraph(course.entry, readers).createSession();
  session.prepareChoice(course.entry.outgoing[0]).commit();
  const view = session.view;
  const reader = view.world.coordinates;
  const workspace = createPlanProjectionWorkspace();
  const point = createPlanCoordinateSample();
  const native = createPlanCoordinateSample();
  let shifted = 0;
  for (const span of view.mapping.mapped) {
    const s = (span.frameStart + span.frameEnd) / 2;
    if (s < view.range.start || s > view.range.end) continue;
    const owner = view.mapping.mappingAt(s);
    const sectionReader = owner.occurrence.section.coordinates;
    const nativeS = owner.sourceChainageInFrame(s);
    const origin = owner.sourceLateralOrigin;
    const nativeBounds = sectionReader.domain.lateralAt(nativeS, { left: 0, right: 0 });
    assert.deepEqual(reader.domain.lateralAt(s, { left: 0, right: 0 }), {
      left: nativeBounds.left - origin,
      right: nativeBounds.right - origin,
    });
    if (origin !== 0) shifted += 1;
    reader.toWorld(s, 1, point);
    sectionReader.toWorld(nativeS, 1 + origin, native);
    const transform = owner.viewFromSource;
    assert.equal(point.x, transform.cosine * native.x + transform.sine * native.z + transform.translation.x);
    assert.equal(point.z, -transform.sine * native.x + transform.cosine * native.z + transform.translation.z);
    assert.deepEqual(
      reader.metricsAt(s, 1, point.seed, metrics()),
      sectionReader.metricsAt(nativeS, 1 + origin, native.seed, metrics()),
    );
    const observed = reader.locateLocal(point, point.seed, 0, projection(), workspace);
    near(observed.s, s);
    near(observed.l, 1);
    assert.equal(observed.seed, point.seed);
    const beyond = nativeBounds.right + 3 - origin;
    reader.toWorld(s, beyond, point);
    near(reader.locateLocal(point, point.seed, 0, projection(), workspace).l, beyond);
  }
  assert.ok(shifted > 0, 'fixture covers a nonzero lateral origin and an asymmetric mapped domain');
  assert.throws(() => reader.locateLocal(point, -1, 0, projection(), workspace), RangeError);
  const zero = { behind: 0, ahead: 0 };
  const geometry = createCourseGeometryView(session.history, {
    pose: { minS: 50, maxS: 100, maxAdvance: 0 },
    consumers: { cameraRender: zero, contact: zero, driverLookahead: zero, reverseRecovery: zero },
  });
  assert.ok(geometry.ok, JSON.stringify(geometry.ok ? null : geometry));
  const bounded = readers.createView(geometry.value);
  assert.ok(bounded.ok, JSON.stringify(bounded.ok ? null : bounded));
  const restricted = bounded.value.world.coordinates;
  assert.equal(restricted.domain.start, 50);
  assert.equal(restricted.domain.end, 100);
  const retainedSeed = reader.toWorld(75, 1, point).seed;
  assert.equal(restricted.toWorld(75, 1, native).seed, retainedSeed);
  assert.deepEqual(
    restricted.metricsAt(75, 1, retainedSeed, metrics()),
    reader.metricsAt(75, 1, retainedSeed, metrics()),
  );
  assert.throws(() => restricted.toWorld(49, 0, point), RangeError);
  assert.throws(() => restricted.domain.lateralAt(101, { left: 0, right: 0 }), RangeError);
});
