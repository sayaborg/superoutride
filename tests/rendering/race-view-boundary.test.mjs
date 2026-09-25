import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCourse, loadCourseGround } from '../../tools/course/authoring-io.ts';
import { createCourseScene } from '../../src/shell/course-scene.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { loadVehicleDefinitions } from '../../src/vehicle/definition-document.js';
import { browserSessionVehicle } from '../../src/shell/session-vehicle.js';
import { createRecoveryState } from '../../src/race/recovery.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { resolveCourseSession } from '../../src/race/course-session.js';
import { readVehicleEnvelope } from '../../src/race/vehicle-envelope.js';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';

const definitions = await loadVehicleDefinitions(await readDeliveredContent());

async function setup() {
  const file = fileURLToPath(new URL('../../content/courses/ribbon-ring.course.json', import.meta.url));
  const { course } = await loadCourse(file);
  const scene = createCourseScene(
    course.entry,
    await loadCourseGround(course),

    course.gates,
    definitions.vehicles,
  );
  const assets = createVehicleSprites(definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'));
  const compiledVehicle = browserSessionVehicle(
    definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'),
    definitions.driving,
  );
  const spawn = (s) =>
    createVehicle(compiledVehicle.compiledVehicle, scene.world, { ...compiledVehicle, s, l: 0, initialSpeed: 0 });
  return { course, assets, scene, compiledVehicle, spawn };
}

test('shared route keeps vehicle and camera coordinates across forward and reverse seams', async () => {
  const { course, scene, spawn } = await setup();
  const link = course.entry.outgoing[0];
  const seam = link.from.section.coordinates.domain.end;
  scene.runtime.refresh(0, seam + 100);
  const rig = createCameraRig('MOVEMENT_FOLLOW');
  rig.yaw = 0.7;
  rig.movementYaw = -0.4;
  rig.verticalCorrection = 0.8;
  rig.initialized = true;
  for (const [s, ordinal] of [
    [seam + 1, 1],
    [seam - 1, 0],
  ]) {
    const vehicle = spawn(s);
    const before = { ...rig };
    const pose = { x: vehicle.x, z: vehicle.z, yaw: vehicle.yaw, s: vehicle.course.s, l: vehicle.course.l };
    scene.runtime.refresh(s, s);
    assert.equal(scene.runtime.route.at(s).ordinal, ordinal);
    assert.deepEqual(rig, before, 'race must not mutate an observer camera');
    assert.deepEqual({ x: vehicle.x, z: vehicle.z, yaw: vehicle.yaw, s: vehicle.course.s, l: vehicle.course.l }, pose);
  }
});

test('race actors have no cameras and view assembles sixteen rival sprites from observations', async () => {
  const { course, scene, assets, compiledVehicle, spawn } = await setup();
  const envelope = await readVehicleEnvelope(
    compiledVehicle,
    await (await readDeliveredContent()).json('envelope', 'TESTAROSSA'),
  );
  const settings = resolveCourseSession(
    course,
    { mode: 'CUSTOM', rivalCount: 16, lapCount: 1, timeLimit: false },
    compiledVehicle,
    envelope,
  );
  const vehicle = spawn(settings.grid[0].at.s);
  const race = createCourseRace({
    session: settings,
    player: { vehicle, recovery: createRecoveryState(vehicle) },
    runtime: scene.runtime,
  });
  for (const c of [race.player, ...race.rivals]) assert.ok(!('cameraRig' in c.actor));
  assert.equal(race.rivals.length, 16);
  assert.deepEqual(race.advance({ steering: 0, throttle: false, brake: false }, 1 / 60), { recovered: false });
  const observed = race.observe();
  assert.ok(!('sprites' in observed));
  assert.equal(observed.rivals.length, 16);
  const camera = updateCamera(createCameraRig(), scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
  const sprites = createRaceSprites(assets)(observed.rivals, camera);
  assert.equal(sprites.length, observed.rivals.length);
  assert.deepEqual(
    sprites.map((s) => s.name),
    observed.rivals.map((a) => a.id),
  );
  assert.ok(sprites.every((s) => s.asset && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)));
  race.resyncPlayer();
});
