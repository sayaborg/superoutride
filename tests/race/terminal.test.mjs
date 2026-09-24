import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadCourse } from '../../tools/course/authoring-io.ts';
import { createCourseRoute } from '../../src/course/course-route.js';
import { createCourseRouteReaders } from '../../src/course/course-route-readers.js';
import {
  createPlanCoordinateSample,
  createPlanProjectionWorkspace,
} from '../../src/course/geometry/plan-coordinate.js';
import { resolveCourseSession } from '../../src/race/course-session.js';
import { VEHICLE_CATALOG } from '../../src/vehicle/vehicle-catalog.js';
import { browserSessionVehicle } from '../../src/shell/session-vehicle.js';

const load = async (stem) =>
  (await loadCourse(new URL(`../../content/courses/${stem}.course.json`, import.meta.url).pathname)).course;

test('outside projection follows previous chainage across clamped and tangent-ray candidates', async () => {
  const course = await load('ribbon-coast');
  const route = createCourseRoute(course.entry);
  const readers = createCourseRouteReaders(route);
  const workspace = createPlanProjectionWorkspace();
  const world = createPlanCoordinateSample();
  const out = { s: 0, l: 0, inDomain: false };
  // Exit-clamped primitive competes with the closer world-space tangent-ray foot.
  for (let beyond = 1; beyond <= 40; beyond++) {
    readers.coordinates.toWorld(route.end + beyond, 30, world);
    readers.coordinates.locateLocal(world, route.end, out, workspace);
    assert.equal(out.s, route.end);
    assert.equal(out.inDomain, false);
  }
  // When previous s is already on the ray, that foot wins the chainage comparison.
  readers.coordinates.locateLocal(world, route.end + 39, out, workspace);
  assert.ok(Math.abs(out.s - (route.end + 40)) < 1e-8);
  // A genuine in-domain foot still wins over an endpoint nearer previous s.
  for (const coordinates of [course.entry.coordinates, readers.coordinates]) {
    coordinates.toWorld(400, 0, world);
    coordinates.locateLocal(world, 390, out, workspace);
    assert.ok(out.inDomain);
    assert.ok(Math.abs(out.s - 400) < 1e-8);
    coordinates.toWorld(400, 100, world);
    coordinates.locateLocal(world, 390, out, workspace);
    assert.equal(out.inDomain, false);
    assert.ok(Math.abs(out.s - 390) < 1e-8);
  }
});

test('Session rejects short terminal runout, including solo play; forks and loops are not terminals', async () => {
  const course = await load('ribbon-coast');
  const vehicle = browserSessionVehicle(VEHICLE_CATALOG.find((v) => v.profile.id === 'TESTAROSSA'));
  const { envelope } = JSON.parse(
    await readFile(new URL('../../dist/content/envelopes/TESTAROSSA.json', import.meta.url)),
  );
  const configuration = { mode: 'CUSTOM', rivalCount: 0, lapCount: 1, countdown: false };
  assert.doesNotThrow(() => resolveCourseSession(course, configuration, vehicle, envelope));
  const short = {
    ...course,
    gates: {
      ...course.gates,
      intervals: course.gates.intervals.map((interval) => ({
        ...interval,
        finish: {
          ...interval.finish,
          at: { ...interval.finish.at, s: interval.section.coordinates.domain.end - 1 },
        },
      })),
    },
  };
  assert.throws(
    () => resolveCourseSession(short, configuration, vehicle, envelope),
    /FINISH .*TESTAROSSA requires .* m to stop/,
  );
  const fork = createCourseRoute((await load('ribbon-fork')).entry);
  assert.equal(fork.terminal, null);
  const ringCourse = await load('ribbon-ring');
  const ring = createCourseRoute(ringCourse.entry);
  ring.extendThrough(ring.end + 1);
  assert.equal(ring.terminal, null);
  assert.doesNotThrow(() => resolveCourseSession(ringCourse, configuration, vehicle, envelope));
});
