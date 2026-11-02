import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createCourseRoute, gridRouteS } from '../../src/course/course-route.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { transformPlanarPoint } from '../../src/core/planar-transform.js';
import { normalizeCoursePositions } from '../../tools/authoring/course-joints.ts';
import { runCourseReference } from '../../tools/course/reference-run.ts';
import { readRacingLines } from '../../src/content/racing-line.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';
import { cameraDistance } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { formPool } from '../../src/race/free-play-field.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { supportedTargetSurface, publishVehicleRenderY } from '../../src/vehicle/physics/vehicle-physics.js';
import { initializePlanCoordinateObservation } from '../../src/vehicle/physics/vehicle-state.js';

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);

/** SUPER MONACO GP's circuit with its start gate moved into Section `to`, its slots `back` metres before its end. */
async function startIn(to, back = (k) => 100 + 4 * k) {
  const delivered = {
    ...content,
    bytes: async (kind, id) => {
      const bytes = await content.bytes(kind, id);
      if (kind !== 'course' || id !== 'super-monaco-gp') return bytes;
      const document = JSON.parse(new TextDecoder().decode(bytes));
      const [entry] = document.sections;
      const start = entry.gates.find((gate) => gate.kind === 'start');
      entry.gates = entry.gates.filter((gate) => gate !== start);
      const slots = (grid) => grid && grid.map((slot, k) => ({ ...slot, at: { joint: 'end', offset: -back(k) } }));
      const section = document.sections.find((s) => s.id === to);
      section.gates = [{ ...start, grid: slots(start.grid), bikeGrid: slots(start.bikeGrid) }, ...section.gates];
      return new TextEncoder().encode(JSON.stringify(normalizeCoursePositions(document).document));
    },
  };
  return loadDeliveredCourse(delivered, 'super-monaco-gp', materials);
}

const pose = (section, s, transform) => {
  const at = section.coordinates.toWorld(s, 0, createPlanCoordinateSample());
  return transformPlanarPoint(transform, { x: at.x, z: at.z });
};

test("a circuit's Route begins before its line, in the Section returning to its entry", async () => {
  const course = await startIn('sector-3');
  const last = course.sections.find((s) => s.id === 'sector-3');
  assert.equal(course.gates.start, last);
  const builder = createCourseRoute(course.entry, course.gates.start);
  const { route } = builder;
  const length = last.coordinates.domain.end;
  const [before, entry] = route.occurrences;
  assert.equal(route.start, -length);
  assert.deepEqual([before.section, before.start, before.end], [last, -length, 0]);
  assert.deepEqual([entry.section, entry.start, entry.incoming?.to.section], [course.entry, 0, course.entry]);
  // The Section before the line meets the entry in the world as the lap does.
  const end = pose(last, length, before.worldFromSection),
    origin = pose(course.entry, 0, entry.worldFromSection);
  assert.ok(Math.hypot(end.x - origin.x, end.z - origin.z) < 1e-6);
  builder.extendThrough(2 * length + 4000);
  const again = route.occurrences.find((o) => o.ordinal > 1 && o.section === last);
  assert.ok(Math.abs(again.repeatTurn) > 1);
  const there = pose(last, 0, again.worldFromSection),
    first = pose(last, 0, before.worldFromSection);
  assert.ok(Math.hypot(there.x - first.x, there.z - first.z) < 1e-3);
});

test('a start in any other Section than the entry or the one returning to it is refused', async () => {
  await assert.rejects(startIn('sector-2'), /start gate must belong to the entry Section/);
});

test('from a start before the line, laps and checkpoints count from the line, as the reference run times them', async () => {
  const course = await startIn('sector-3');
  const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
  const vehicle = createRunVehicle(definitions.vehicles[0], definitions.driving);
  const catalog = { vehicles: definitions.vehicles, freePlay: await loadFreePlayRules(content) };
  const lines = readRacingLines(course, await content.json('racing-line', 'super-monaco-gp'));
  assert.ok(lines.ok);
  const run = runCourseReference(course, vehicle, catalog, [], 2, lines.value);
  // Every line after the line, lap by lap; the line crossed from the grid is none.
  const ids = course.gates.intervals.flatMap(({ checkpoints, finish }) => [
    ...checkpoints.map((c) => c.id),
    ...(finish ? [finish.id] : []),
  ]);
  assert.deepEqual(
    run.events.map((e) => [e.landmarkId, e.lap]),
    [1, 2].flatMap((lap) => ids.map((id) => [id, lap])),
  );
  assert.equal(run.elapsedSeconds, run.events.at(-1).timeSeconds);
  assert.equal(run.metrics.recoveries, 0);
  // The run begins in the Section before the line.
  assert.equal(run.passes[0].section, 'sector-3');
});

test('behind the Route start a vehicle recovers at rest as at a road end, and the camera has room', async () => {
  const course = await startIn('sector-3');
  const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const { route } = scene.runtime;
  const rearmost = courseStartGrid(course.gates, false).at(-1);
  assert.ok(gridRouteS(route, rearmost) - cameraDistance(CAMERA_DEFINITION) >= route.start);
  const prepared = await prepareRun(
    content,
    {
      vehicles: definitions.vehicles,
      driving: definitions.driving,
      materials,
      freePlay: await loadFreePlayRules(content),
    },
    course,
    null,
    {
      mode: 'FREE_PLAY',
      vehicleId: definitions.vehicles[0].compiledVehicle.id,
      color: null,
      lapCount: 1,
      rivalCount: 0,
      rivalPool: formPool(await loadFreePlayRules(content), definitions.vehicles[0]).id,
      traffic: 'OFF',
    },
  );
  const race = createCourseRace({ setup: prepared.resolve(0), runtime: scene.runtime });
  const idle = { steering: 0, throttle: false, brake: false };
  race.start();
  while (race.outcome.status === 'READY') race.advance(idle);
  // 30 m after the Route's start, rolling backwards at 15 m/s out past it.
  const { vehicle, model } = race.player.actor;
  const s = route.start + 30;
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
    velocityX: -surface.horizontalTangent.x * 15,
    velocityY: 0,
    velocityZ: -surface.horizontalTangent.z * 15,
  });
  vehicle.course = initializePlanCoordinateObservation(scene.world.coordinates, vehicle.x, vehicle.z, s);
  publishVehicleRenderY(vehicle, model);
  let recovered = null;
  for (let i = 0; i < 10 * 60 && recovered === null; i++)
    if (race.advance(idle).recovered) recovered = { s: vehicle.course.s, speed: vehicle.longitudinalSpeed };
  assert.ok(recovered, 'never recovered');
  assert.ok(recovered.s > route.start && recovered.s < route.start + 10, `${recovered.s - route.start}`);
  assert.ok(Math.abs(recovered.speed) < 1e-9);
});
