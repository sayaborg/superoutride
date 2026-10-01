import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCourse } from '../../tools/course/authoring-io.ts';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createSessionVehicle } from '../../src/content/session-vehicle.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { resolveCourseSession } from '../../src/race/course-session.js';
import { readRivalEnvelope } from '../../src/content/rival-envelope.js';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';

const definitionContent = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(definitionContent, await loadEngineSounds(definitionContent));

async function setup() {
  const file = fileURLToPath(new URL('../../content/courses/ribbon-ring.course.json', import.meta.url));
  const { course, materials } = await loadCourse(file);
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const assets = createVehicleSprites(definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'));
  const compiledVehicle = createSessionVehicle(
    definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'),
    definitions.driving,
    materials,
  );
  return { course, assets, scene, compiledVehicle };
}

test('shared route keeps vehicle and camera coordinates across forward and reverse seams', async () => {
  const { course, scene, compiledVehicle } = await setup();
  // Route readers only, without a race: vehicles are placed directly at the seam.
  const model = createVehicleModel(compiledVehicle, SIM_DT);
  const spawn = (s) => createVehicle(model, scene.world, { s, l: 0, initialSpeed: 0 });
  const link = course.entry.outgoing[0];
  const seam = link.from.section.coordinates.domain.end;
  scene.runtime.refresh(0, seam + 100);
  const rig = createCameraRig('MOVEMENT_FOLLOW');
  rig.yaw = 0.7;
  rig.movementYaw = -0.4;
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
  const { course, scene, compiledVehicle } = await setup();
  const admitted = await readRivalEnvelope(
    compiledVehicle,
    await (await readDeliveredContent()).json('envelope', 'TESTAROSSA'),
  );
  assert.ok(admitted.ok);
  const envelope = admitted.value;
  const settings = resolveCourseSession(
    course,
    null,
    { mode: 'FREE_PLAY', rivalCount: 16, lapCount: 1, timeLimit: false, initialSpeed: 0, seed: 0 },
    compiledVehicle,
    envelope,
  );
  const race = createCourseRace({ session: settings, runtime: scene.runtime });
  for (const c of [race.player, ...race.rivals]) assert.ok(!('cameraRig' in c.actor));
  assert.equal(race.rivals.length, 16);
  assert.deepEqual(race.advance({ steering: 0, throttle: false, brake: false }), { recovered: false });
  const observed = race.observe();
  assert.ok(!('sprites' in observed));
  assert.equal(observed.rivals.length, 16);
  const camera = updateCamera(createCameraRig(), scene.world, observed.player, CURRENT_CAMERA_PROFILE);
  const sprites = createRaceSprites(definitions.vehicles)(observed.rivals, camera);
  assert.equal(sprites.length, observed.rivals.length);
  assert.deepEqual(
    sprites.map((s) => s.name),
    observed.rivals.map((a) => a.id),
  );
  assert.ok(sprites.every((s) => s.asset && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)));
  race.recoverPlayer();
});
