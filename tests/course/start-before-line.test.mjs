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
import { createRacingLines } from '../../src/content/racing-line.js';
import { PACE_SCHEDULE_SPACING, paceScheduleStations } from '../../src/content/pace-schedule.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadFreePlayRules, NO_TRAFFIC } from '../../src/content/free-play-rules.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';
import { cameraDistance } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { compileRunConfiguration } from '../../src/race/run-configuration.js';
import { resolveRunSetup } from '../../src/race/run-setup.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { supportedTargetSurface, publishVehicleRenderY } from '../../src/vehicle/physics/vehicle-physics.js';
import { initializePlanCoordinateObservation } from '../../src/vehicle/physics/vehicle-state.js';

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const catalog = { vehicles: definitions.vehicles, freePlay: await loadFreePlayRules(content) };

/** A sky the delivered content holds, for the synthetic circuit's one environment. */
const SKY = 'tsukuba-sky';
const LANE = 5;

/**
 * A synthetic circuit: three Sections, each a 200 m straight and a 120° right arc of 80 m radius, two lanes; a
 * checkpoint ending the first two, the finish the third; the start gate in Section `start`, its 16 slots 6 m apart
 * from 150 m into it.
 */
function circuit(start) {
  const id = (k) => `sector-${k + 1}`;
  const document = {
    format: 'superoutride.course',
    version: 61,
    name: 'RING',
    entry: id(0),
    maxLaps: 3,
    bearing: 0,
    sections: [0, 1, 2].map((k) => ({
      id: id(k),
      plan: [
        { kind: 'straight', id: `s${k}`, length: 200 },
        { kind: 'arc', id: `c${k}`, length: (80 * 2 * Math.PI) / 3, radius: 80, turn: 'right' },
      ],
      profile: [
        { at: { joint: `s${k}`, offset: 0 }, y: 0, curveLength: 0 },
        { at: { joint: 'end', offset: 0 }, y: 0, curveLength: 0 },
      ],
      lanes: [
        { kind: 'lane', id: 'a', width: LANE },
        { kind: 'lane', id: 'b', width: LANE },
      ],
      centerLane: 'a',
      centerLateral: -LANE / 2,
      boundaries: [],
      strips: [
        {
          kind: 'strip',
          start: { joint: `s${k}`, offset: 0 },
          end: { joint: 'end', offset: 0 },
          left: { lane: 'a', side: 'left', offset: -8 },
          right: { lane: 'b', side: 'right', offset: 8 },
          color: 12683,
          material: 'ASPHALT',
        },
      ],
      walls: [],
      openLimits: [],
      sprites: [],
      environments: [
        {
          at: { joint: `s${k}`, offset: 0 },
          name: 'RING',
          background: { image: SKY, horizonY: 320, yawOrigin: 0 },
          transition: 0,
        },
      ],
      gates: [
        ...(id(k) === start
          ? [
              {
                kind: 'start',
                grid: Array.from({ length: 16 }, (_, slot) => ({
                  at: { joint: `s${k}`, offset: 150 - 6 * slot },
                  lateral: { lane: slot % 2 ? 'b' : 'a', side: 'center', offset: 0 },
                })),
                bikeGrid: null,
              },
            ]
          : []),
        k === 2
          ? { kind: 'finish', id: 'RING-FINISH', at: { joint: 'end', offset: 0 } }
          : { kind: 'checkpoint', id: `RING-CP${k + 1}`, at: { joint: 'end', offset: 0 } },
      ],
    })),
    links: [0, 1, 2].map((k) => ({
      id: `${id(k)}-to-${id((k + 1) % 3)}`,
      from: { section: id(k), lane: 'a' },
      to: id((k + 1) % 3),
    })),
  };
  return normalizeCoursePositions(document).document;
}

/** The synthetic circuit compiled as delivered content, its start gate in Section `start`. */
async function startIn(start) {
  const template = content.manifest.files.find((file) => file.kind === 'course' && file.id === 'tsukuba');
  const delivered = {
    ...content,
    manifest: { ...content.manifest, files: [...content.manifest.files, { ...template, id: 'ring' }] },
    bytes: async (kind, id) =>
      kind === 'course' && id === 'ring'
        ? new TextEncoder().encode(JSON.stringify(circuit(start)))
        : content.bytes(kind, id),
  };
  return loadDeliveredCourse(delivered, 'ring', materials);
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
  builder.extendThrough(3 * length);
  const again = route.occurrences.find((o) => o.ordinal > 1 && o.section === last);
  assert.ok(Math.abs(Math.abs(again.repeatTurn) - 2 * Math.PI) < 1e-9);
  const there = pose(last, 0, again.worldFromSection),
    first = pose(last, 0, before.worldFromSection);
  assert.ok(Math.hypot(there.x - first.x, there.z - first.z) < 1e-6);
});

test('a start in any other Section than the entry or the one returning to it is refused', async () => {
  await assert.rejects(startIn('sector-2'), /start gate must belong to the entry Section/);
});

test('from a start before the line, laps and checkpoints count from the line, as the reference run times them', async () => {
  const course = await startIn('sector-3');
  const vehicle = createRunVehicle(definitions.vehicles[0], definitions.driving);
  // The racing line along P.
  const lines = createRacingLines(
    course,
    new Map(course.sections.map((s) => [s.id, new Map([[null, paceScheduleStations(s).map(() => 0)]])])),
  );
  const run = runCourseReference(course, vehicle, catalog, [], 2, lines);
  // Every line after the line, lap by lap; the line crossed from the grid is none.
  assert.deepEqual(
    run.events.map((e) => [e.landmarkId, e.lap]),
    [1, 2].flatMap((lap) => ['RING-CP1', 'RING-CP2', 'RING-FINISH'].map((id) => [id, lap])),
  );
  assert.equal(run.elapsedSeconds, run.events.at(-1).timeSeconds);
  assert.equal(run.metrics.recoveries, 0);
  // The run begins in the Section before the line, from its grid's last slot 60 m into it, where a FREE PLAY run alone
  // starts from its first, 150 m in.
  assert.equal(run.passes[0].section, 'sector-3');
  const first = paceScheduleStations(course.gates.start)[run.passes[0].first];
  assert.ok(first >= 60 && first < 60 + PACE_SCHEDULE_SPACING, `${first}`);
});

test('behind the Route start a vehicle recovers at rest as at a road end, and the camera has room', async () => {
  const course = await startIn('sector-3');
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const { route } = scene.runtime;
  const rearmost = courseStartGrid(course.gates, false).at(-1);
  assert.ok(gridRouteS(route, rearmost) - cameraDistance(CAMERA_DEFINITION) >= route.start);
  const entry = definitions.vehicles[0];
  const configuration = compileRunConfiguration(
    {
      mode: 'FREE_PLAY',
      vehicleId: entry.compiledVehicle.id,
      color: null,
      lapCount: 1,
      rivalCount: 0,
      rivalPool: catalog.freePlay.rivalPools[0].id,
      traffic: NO_TRAFFIC,
    },
    course,
    null,
    catalog,
  );
  const setup = resolveRunSetup(course, null, configuration, 0, createRunVehicle(entry, definitions.driving));
  const race = createCourseRace({ setup, runtime: scene.runtime });
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
  assert.ok(recovered.s >= route.start && recovered.s < route.start + 10, `${recovered.s - route.start}`);
  assert.ok(Math.abs(recovered.speed) < 1e-9);
});
