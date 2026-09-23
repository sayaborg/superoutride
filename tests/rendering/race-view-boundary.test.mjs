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
import { createCameraRig, reframeCamera, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';
import { wrapAngle } from '../../src/core/math.js';

async function setup() {
  const file = fileURLToPath(new URL('../../content/courses/ribbon-ring.course.json', import.meta.url));
  const { course } = await loadCourse(file);
  const assets = await readVehicleSprites();
  const scene = createCourseScene(course.entry, await loadCourseGround(course), assets);
  const profile = browserSessionVehicle(VEHICLE_CATALOG.find((v) => v.profile.id === 'TESTAROSSA'));
  const spawn = (s) => createArcadeVehicle(profile.profile, scene.world, { ...profile, s, l: 0, initialSpeed: 0 });
  return { course, assets, scene, profile, spawn };
}

test('committed forward/reverse seams publish transforms without owning or mutating a camera', async () => {
  const { course, scene, spawn } = await setup();
  const link = course.entry.outgoing[0];
  const rig = createCameraRig('MOVEMENT_FOLLOW');
  rig.yaw = 0.7;
  rig.movementYaw = -0.4;
  rig.verticalCorrection = 0.8;
  rig.initialized = true;
  for (const [direction, port, sign] of [
    ['forward', link.source, 1],
    ['reverse', link.destination, -1],
  ]) {
    const previous = spawn(port.anchor.s - sign);
    const vehicle = spawn(port.anchor.s + sign);
    const actor = { vehicle, recovery: createRecoveryState(vehicle) };
    const before = { ...rig };
    const transition = scene.observeStep(actor, previous, false);
    assert.equal(transition.direction, direction);
    assert.deepEqual(rig, before, 'race must not mutate an observer camera');
    assert.ok(Object.isFrozen(transition.destinationFromSource));
    const yaw = Math.atan2(transition.destinationFromSource.sine, transition.destinationFromSource.cosine);
    reframeCamera(rig, transition.destinationFromSource);
    assert.equal(rig.yaw, wrapAngle(before.yaw + yaw));
    assert.equal(rig.movementYaw, wrapAngle(before.movementYaw + yaw));
    assert.equal(rig.verticalCorrection, before.verticalCorrection);
    assert.equal(rig.initialized, before.initialized);
    assert.equal(scene.observeStep(actor, vehicle, false), null, 'no repeated transform without a new crossing');
    const after = { ...rig };
    reframeCamera(rig, null);
    assert.deepEqual(rig, after);
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
  });
  for (const c of [race.player, ...race.rivals]) assert.ok(!('cameraRig' in c.actor));
  assert.equal(race.rivals.length, 16);
  assert.deepEqual(race.advance({ steering: 0, throttle: false, brake: false }, 1 / 60), {
    recovered: false,
    frameChange: null,
  });
  const observed = race.observe();
  assert.ok(!('sprites' in observed));
  assert.equal(observed.rivals.length, 16);
  const camera = updateCamera(createCameraRig(), scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
  const sprites = createRaceSprites(assets, profile)(
    observed.rivals,
    camera,
    scene.session.view.geometry,
    scene.world.height,
  );
  assert.equal(sprites.length, observed.rivals.length);
  assert.deepEqual(
    sprites.map((s) => s.name),
    observed.rivals.map((a) => a.id),
  );
  assert.ok(sprites.every((s) => s.asset && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)));
  assert.equal(race.resyncPlayer(), null);
});
