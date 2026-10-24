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
import { createRunMechanics } from '../../src/race/run-setup.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { formPool } from '../../src/race/free-play-field.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { supportedTargetSurface, publishVehicleRenderY } from '../../src/vehicle/physics/vehicle-physics.js';
import { initializePlanCoordinateObservation } from '../../src/vehicle/physics/vehicle-state.js';

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

test('Run accepts a short terminal runout, including solo play; a loop is not a terminal', async () => {
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
  assert.doesNotThrow(() => resolveRunSetup(short, null, configuration, 0, vehicle));
  const ringCourse = await load('tsukuba');
  const ring = createCourseRoute(ringCourse.entry);
  ring.extendThrough(ring.route.end + 1);
  assert.equal(ring.route.terminal, null);
  assert.doesNotThrow(() =>
    resolveRunSetup(ringCourse, null, compileRunConfiguration(request, ringCourse, null, catalog), 0, vehicle),
  );
});

test('the fastest vehicle over the end of the road at its top speed recovers at rest before it, once', async () => {
  const course = await load('super-hang-on-africa');
  // The catalog's fastest vehicle by its speed cap.
  const fastest = definitions.vehicles
    .map((v) => ({ v, cap: createRunMechanics(createRunVehicle(v, definitions.driving)).speedCap }))
    .reduce((a, b) => (b.cap > a.cap ? b : a));
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const prepared = await prepareRun(
    definitionContent,
    { vehicles: definitions.vehicles, driving: definitions.driving, materials, freePlay: catalog.freePlay },
    course,
    null,
    {
      mode: 'FREE_PLAY',
      vehicleId: fastest.v.compiledVehicle.id,
      color: null,
      lapCount: 1,
      rivalCount: 0,
      rivalPool: formPool(catalog.freePlay, fastest.v).id,
      traffic: 'OFF',
    },
  );
  const race = createCourseRace({ setup: prepared.resolve(0), runtime: scene.runtime });
  const idle = { steering: 0, throttle: false, brake: false };
  race.start();
  while (race.outcome.status === 'READY') race.advance(idle);
  // The road's end loaded; the vehicle 60 m before it on P at its speed cap, full throttle.
  scene.runtime.refresh(0, Infinity);
  const end = scene.runtime.route.end;
  const { vehicle, model } = race.player.actor;
  const s = end - 60;
  scene.runtime.refresh(s, s);
  const surface = supportedTargetSurface(scene.world, s, 0);
  const height = model.compiledVehicle.desiredCgHeight;
  Object.assign(vehicle, {
    x: surface.point.x + surface.normal.x * height,
    y: surface.point.y + surface.normal.y * height,
    z: surface.point.z + surface.normal.z * height,
    yaw: Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z),
    pitch: surface.gradeAngle,
    yawRate: 0,
    pitchRate: 0,
    velocityX: surface.horizontalTangent.x * fastest.cap,
    velocityY: 0,
    velocityZ: surface.horizontalTangent.z * fastest.cap,
  });
  vehicle.course = initializePlanCoordinateObservation(scene.world.coordinates, vehicle.x, vehicle.z, s);
  publishVehicleRenderY(vehicle, model);
  // Full throttle until it recovers: out past the end, it comes back at rest within the backtrack before the end.
  let recovered = null;
  for (let i = 0; i < 6 * 60 && recovered === null; i++) {
    if (race.advance({ ...idle, throttle: true }).recovered)
      recovered = { s: vehicle.course.s, speed: vehicle.longitudinalSpeed };
  }
  assert.ok(recovered, 'never recovered');
  assert.ok(recovered.s < end && recovered.s >= end - 8 - 1e-6, `${recovered.s - end}`);
  assert.ok(Math.abs(recovered.speed) < 1e-9, `${recovered.speed}`);
  // At rest, it stays before the end.
  for (let i = 0; i < 2 * 60; i++) {
    assert.ok(!race.advance(idle).recovered && vehicle.course.inDomain && vehicle.course.s < end);
  }
});
