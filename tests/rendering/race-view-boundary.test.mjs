import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCourse, loadCourseGround } from '../../tools/course/authoring-io.ts';
import { readVehicleSprites } from '../../tools/course/read-vehicle-sprites.ts';
import { createCourseScene } from '../../src/shell/course-scene.js';
import { createArcadeVehicle } from '../../src/vehicle/physics/arcade-vehicle-physics.js';
import { VEHICLE_CATALOG } from '../../src/vehicle/vehicle-catalog.js';
import { browserSessionVehicle } from '../../src/shell/session-vehicle.js';
import { createRecoveryState } from '../../src/race/recovery.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { resolveCourseSession } from '../../src/race/course-session.js';
import { readVehicleEnvelope } from '../../src/race/vehicle-envelope.js';
import { readFile } from 'node:fs/promises';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';

async function setup() {
  const file = fileURLToPath(new URL('../../content/courses/ribbon-ring.course.json', import.meta.url));
  const { course } = await loadCourse(file);
  const assets = await readVehicleSprites();
  const scene = createCourseScene(course.entry, await loadCourseGround(course), assets, course.rules);
  const profile = browserSessionVehicle(VEHICLE_CATALOG.find((v) => v.profile.id === 'TESTAROSSA'));
  const spawn = (s) => createArcadeVehicle(profile.profile, scene.world, { ...profile, s, l: 0, initialSpeed: 0 });
  return { course, assets, scene, profile, spawn };
}

test('shared route keeps vehicle and camera coordinates across forward and reverse seams', async () => {
  const { course, scene, spawn } = await setup();
  const link = course.entry.outgoing[0];
  const seam = link.from.anchor.s;
  scene.session.refresh(0, seam + 100);
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
    const actor = { vehicle, recovery: createRecoveryState(vehicle) };
    const before = { ...rig };
    const pose = { x: vehicle.x, z: vehicle.z, yaw: vehicle.yaw, s: vehicle.course.s, l: vehicle.course.l };
    const transition = scene.observeStep(actor);
    assert.equal(transition, 'changed');
    assert.equal(scene.session.occurrence.ordinal, ordinal);
    assert.deepEqual(rig, before, 'race must not mutate an observer camera');
    assert.deepEqual({ x: vehicle.x, z: vehicle.z, yaw: vehicle.yaw, s: vehicle.course.s, l: vehicle.course.l }, pose);
    assert.equal(scene.observeStep(actor), null, 'no repeated transition at one station');
  }
});

test('race actors have no cameras and view assembles sixteen rival sprites from observations', async () => {
  const { course, scene, assets, profile, spawn } = await setup();
  const settings = resolveCourseSession(
    course,
    { mode: 'CUSTOM', rivalCount: 16, lapCount: 1, countdown: false },
    profile,
  );
  const envelope = await readVehicleEnvelope(
    profile,
    JSON.parse(await readFile(new URL('../../dist/content/envelopes/TESTAROSSA.json', import.meta.url), 'utf8')),
  );
  const vehicle = spawn(settings.grid[0].anchor.s);
  const race = createCourseRace({
    session: settings,
    player: { vehicle, recovery: createRecoveryState(vehicle) },
    playerSession: scene.session,
    createSession: scene.createActorSession,
    rival: profile,
    rivalEnvelope: envelope,
    entryRecovery: scene.entryRecovery,
  });
  for (const c of [race.player, ...race.rivals]) assert.ok(!('cameraRig' in c.actor));
  assert.equal(race.rivals.length, 16);
  assert.deepEqual(race.advance({ steering: 0, throttle: false, brake: false }, 1 / 60), { recovered: false });
  const observed = race.observe();
  assert.ok(!('sprites' in observed));
  assert.equal(observed.rivals.length, 16);
  const camera = updateCamera(createCameraRig(), scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
  const sprites = createRaceSprites(assets, profile)(
    observed.rivals,
    camera,
    scene.session.view.geometry,
    scene.world.height,
    scene.session.view.renderHeight,
  );
  assert.equal(sprites.length, observed.rivals.length);
  assert.deepEqual(
    sprites.map((s) => s.name),
    observed.rivals.map((a) => a.id),
  );
  assert.ok(sprites.every((s) => s.asset && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)));
  race.resyncPlayer();
});
