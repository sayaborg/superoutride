import { testGround } from '../helpers/resident-ground.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { readCourseImages } from '../../tools/course/read-course-images.mjs';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { createRecoveryState, advanceVehicleWithRecovery, recoverVehicle } from '../../dist/gameplay/recovery.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { transformPlanarPoint, transformPlanarVector } from '../../dist/core/planar-transform.js';

const document = JSON.parse(await readFile(new URL('../../content/courses/seam.course.json', import.meta.url)));
const compiled = await compileCourseDocument(
  document,
  await readCourseImages(document.assets, new URL('../../content/images/', import.meta.url).pathname),
);
assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
const course = compiled.value;
const ground = await testGround(course, 'seam');
const dt = 1 / 120;
const input = { steering: 0, throttle: false, brake: false };

for (const entry of [VEHICLE_CATALOG[0], VEHICLE_CATALOG.find((e) => e.profile.id === 'VFR750R')]) {
  test(`saved two-Section ${entry.profile.id} commits once with invariant mechanics and picture, reverses and recovers`, () => {
    assert.deepEqual(course.links[0].overlap, { behind: 30, ahead: 30 });
    const scene = createCourseScene(course.entry, ground);
    const spawn = (s, initialSpeed, l = 0) =>
      createArcadeVehicle(entry.profile, scene.world, { s, l, initialSpeed, torqueProtection: entry.torqueProtection });
    const actor = { vehicle: spawn(course.links[0].source.anchor.s - 2, 20), cameraRig: createCameraRig() };
    actor.recovery = createRecoveryState(actor.vehicle);
    const beforePixels = new SoftwareSurface(320, 240),
      afterPixels = new SoftwareSurface(320, 240);
    let commits = 0;
    for (let tick = 0; tick < 80; tick++) {
      const previous = { x: actor.vehicle.x, z: actor.vehicle.z };
      const recovered = advanceVehicleWithRecovery(scene.world, actor.vehicle, { state: actor.recovery, input, dt });
      assert.equal(recovered, null);
      const oldState = structuredClone(actor.vehicle);
      const oldRig = { ...actor.cameraRig };
      const oldCamera = updateCamera(oldRig, scene.world, actor.vehicle, CURRENT_CAMERA_PROFILE, dt);
      const crossing = scene.history.active.ordinal === 0 && actor.vehicle.course.s >= course.links[0].source.anchor.s;
      if (crossing)
        scene.render(beforePixels, actor.vehicle, oldCamera, entry.profile.id === 'VFR750R' ? 'bike' : 'car');
      const direction = scene.observeStep(actor, previous, false);
      const camera = updateCamera(actor.cameraRig, scene.world, actor.vehicle, CURRENT_CAMERA_PROFILE, dt);
      if (!direction) continue;
      commits++;
      assert.equal(direction, 'forward');
      const transform = course.links[0].destinationFromSource;
      const position = transformPlanarPoint(transform, oldState);
      const velocity = transformPlanarVector(transform, { x: oldState.velocityX, z: oldState.velocityZ });
      assert.equal(actor.vehicle.x, position.x);
      assert.equal(actor.vehicle.z, position.z);
      assert.equal(actor.vehicle.velocityX, velocity.x);
      assert.equal(actor.vehicle.velocityZ, velocity.z);
      for (const key of Object.keys(oldState)) {
        if (['x', 'z', 'velocityX', 'velocityZ', 'yaw', 'course'].includes(key)) continue;
        if (Object.getOwnPropertyDescriptor(actor.vehicle, key).get && typeof oldState[key] === 'number')
          assert.ok(Math.abs(actor.vehicle[key] - oldState[key]) < 1e-10, key);
        else assert.deepEqual(actor.vehicle[key], oldState[key], key);
      }
      assert.equal(actor.cameraRig.verticalCorrection, oldRig.verticalCorrection);
      scene.render(afterPixels, actor.vehicle, camera, entry.profile.id === 'VFR750R' ? 'bike' : 'car');
      const differences = beforePixels.pixels.reduce((n, p, i) => n + (p !== afterPixels.pixels[i] ? 1 : 0), 0);
      assert.ok(differences <= 2, `${differences} pixels differ under rigid reframing`);
      assert.equal(scene.history.active.section, course.sections[1]);
      assert.equal(actor.recovery.recoveries, 0);
    }
    assert.equal(commits, 1);
    actor.vehicle = spawn(102, -20);
    actor.recovery = createRecoveryState(actor.vehicle);
    let reversed = false;
    for (let tick = 0; tick < 30; tick++) {
      const previous = { x: actor.vehicle.x, z: actor.vehicle.z };
      const recovered = advanceVehicleWithRecovery(scene.world, actor.vehicle, { state: actor.recovery, input, dt });
      if (scene.observeStep(actor, previous, recovered !== null) === 'reverse') reversed = true;
      const camera = updateCamera(actor.cameraRig, scene.world, actor.vehicle, CURRENT_CAMERA_PROFILE, dt);
      scene.render(afterPixels, actor.vehicle, camera, entry.profile.id === 'VFR750R' ? 'bike' : 'car');
    }
    assert.equal(reversed, true);
    assert.equal(scene.history.active.section, course.entry);
    actor.vehicle = spawn(course.links[0].source.anchor.s + 2, 20, 14);
    actor.recovery = createRecoveryState(actor.vehicle);
    scene.observeStep(actor, actor.vehicle, true);
    assert.equal(scene.history.active.section, course.sections[1]);
    recoverVehicle(scene.world, actor.vehicle, { state: actor.recovery, reason: 'manual' });
    scene.observeStep(actor, actor.vehicle, true);
    assert.equal(scene.history.active.section, course.entry);
    assert.equal(actor.recovery.recoveries, 1);
    assert.equal(actor.recovery.lastReason, 'manual');
    const camera = updateCamera(actor.cameraRig, scene.world, actor.vehicle, CURRENT_CAMERA_PROFILE, dt);
    scene.render(afterPixels, actor.vehicle, camera, entry.profile.id === 'VFR750R' ? 'bike' : 'car');
  });
}

test('sixteen actors share immutable readers while occurrence state and recovery remain independent', () => {
  const scene = createCourseScene(course.entry, ground);
  const sessions = Array.from({ length: 16 }, () => scene.createActorSession());
  for (const session of sessions) {
    assert.equal(session.view.world, scene.world);
    assert.equal(session.view.presentation, scene.session.view.presentation);
    assert.notEqual(session.history.active, scene.history.active);
    assert.equal(session.history, session.history);
    assert.equal(session.closedCarriageways, session.closedCarriageways);
  }
  const entry = VEHICLE_CATALOG[0];
  const actor = {
    vehicle: createArcadeVehicle(entry.profile, scene.world, {
      s: course.links[0].source.anchor.s - 1,
      initialSpeed: 20,
    }),
    cameraRig: createCameraRig(),
  };
  actor.recovery = createRecoveryState(actor.vehicle);
  for (const [offset, lateral] of [
    [0.5, 40],
    [5, 0],
  ]) {
    const previous = scene.world.guide.toWorld(course.links[0].source.anchor.s - offset, lateral, {
      x: 0,
      z: 0,
      s: 0,
      l: 0,
      heading: 0,
      segmentIndex: -1,
    });
    const current = scene.world.guide.toWorld(course.links[0].source.anchor.s + offset, lateral, {
      x: 0,
      z: 0,
      s: 0,
      l: 0,
      heading: 0,
      segmentIndex: -1,
    });
    actor.vehicle.x = current.x;
    actor.vehicle.z = current.z;
    actor.vehicle.course = { s: current.s, l: current.l, segmentIndex: current.segmentIndex, distanceSquared: 0 };
    assert.equal(scene.observeStep(actor, previous, false), 'recovered');
    assert.equal(scene.history.active.ordinal, 0);
    assert.equal(actor.recovery.lastReason, 'wrong-course');
    assert.ok(actor.vehicle.course.s < course.links[0].source.anchor.s);
    assert.equal(scene.world.surfaces.sample(actor.vehicle.course.s, actor.vehicle.course.l).material.supported, true);
  }
  assert.equal(actor.recovery.recoveries, 2);
  for (const session of sessions) assert.equal(session.history.active.ordinal, 0);
});
