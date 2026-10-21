import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createCourseRoute } from '../../src/course/course-route.js';
import { createCourseRouteReaders } from '../../src/course/course-route-readers.js';
import {
  createPlanCoordinateSample,
  createPlanProjectionWorkspace,
} from '../../src/course/geometry/plan-coordinate.js';
import { resolveRunSetup } from '../../src/race/run-setup.js';
import { compileRunConfiguration } from '../../src/race/run-configuration.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';

const definitionContent = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(definitionContent, await loadEngineSounds(definitionContent));
const catalog = { vehicles: definitions.vehicles, freePlay: await loadFreePlayRules(definitionContent) };

const materials = await loadSurfaceMaterials(definitionContent);
const load = (stem) => loadDeliveredCourse(definitionContent, stem, materials);

test('outside projection follows previous chainage across clamped and tangent-ray candidates', async () => {
  const course = await load('super-hang-on-africa');
  // The linear chain loaded through its terminal Section.
  const chain = createCourseRoute(course.entry);
  chain.extendThrough(Infinity);
  const { route } = chain;
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
  // A genuine in-domain foot still wins over an endpoint nearer previous s: 10 m into the entry Section's first arc.
  const arc = course.entry.segments.find((segment) => segment.curvature !== 0).sStart;
  for (const coordinates of [course.entry.coordinates, readers.coordinates]) {
    coordinates.toWorld(arc + 10, 0, world);
    coordinates.locateLocal(world, arc, out, workspace);
    assert.ok(out.inDomain);
    assert.ok(Math.abs(out.s - (arc + 10)) < 1e-8);
    coordinates.toWorld(arc + 10, 100, world);
    coordinates.locateLocal(world, arc, out, workspace);
    assert.equal(out.inDomain, false);
    assert.ok(Math.abs(out.s - arc) < 1e-8);
  }
});

test('Run rejects short terminal runout, including solo play; a loop is not a terminal', async () => {
  const course = await load('super-hang-on-africa');
  const vehicle = createRunVehicle(
    definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'),
    definitions.driving,
  );
  const request = {
    mode: 'FREE_PLAY',
    vehicleId: 'TESTAROSSA',
    color: null,
    lapCount: 1,
    rivalCount: 0,
    rivalPool: 'CARS',
    traffic: 'OFF',
  };
  const configuration = compileRunConfiguration(request, course, null, catalog);
  assert.doesNotThrow(() => resolveRunSetup(course, null, configuration, 0, vehicle));
  const short = {
    ...course,
    gates: {
      ...course.gates,
      intervals: course.gates.intervals.map((interval) => ({
        ...interval,
        finish: interval.finish && {
          ...interval.finish,
          at: { ...interval.finish.at, s: interval.section.coordinates.domain.end - 1 },
        },
      })),
    },
  };
  assert.throws(
    () => resolveRunSetup(short, null, configuration, 0, vehicle),
    /FINISH .*TESTAROSSA requires .* m to stop/,
  );
  const ringCourse = await load('tsukuba');
  const ring = createCourseRoute(ringCourse.entry);
  ring.extendThrough(ring.route.end + 1);
  assert.equal(ring.route.terminal, null);
  assert.doesNotThrow(() =>
    resolveRunSetup(ringCourse, null, compileRunConfiguration(request, ringCourse, null, catalog), 0, vehicle),
  );
});
