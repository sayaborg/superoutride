import { testGround } from '../helpers/resident-ground.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { readCourseImages } from '../../tools/course/read-course-images.mjs';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createCourseRace } from '../../dist/runtime/course-race.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY as entry } from '../../dist/vehicle/vehicle-catalog.js';
import { createRecoveryState, recoverVehicle, recoverVehicleToGuideCoordinate } from '../../dist/gameplay/recovery.js';
import { sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
const document = JSON.parse(await readFile(new URL('../../content/courses/circuit.course.json', import.meta.url)));
const result = await compileCourseDocument(
  document,
  await readCourseImages(document.assets, new URL('../../content/images/', import.meta.url).pathname),
);
assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
const course = result.value;
const ground = await testGround(course, 'circuit');
function fixture() {
  const scene = createCourseScene(course.entry, ground);
  const vehicle = createArcadeVehicle(entry.profile, scene.world, {
    s: 45,
    l: 0,
    initialSpeed: 0,
    torqueProtection: entry.torqueProtection,
  });
  return { scene, actor: { vehicle, recovery: createRecoveryState(vehicle), cameraRig: createCameraRig() } };
}
test('standing player and rival physically finish a transformed source lap with shared content and bounded histories', () => {
  const { scene, actor } = fixture();
  const race = createCourseRace({
    course,
    player: actor,
    playerSession: scene.session,
    createSession: scene.createActorSession,
    rivalCount: 1,
    lapCount: 1,
    rival: { profile: entry.profile, torqueProtection: entry.torqueProtection, kind: 'car' },
  });
  assert.equal(actor.vehicle.longitudinalSpeed, 0);
  assert.equal(race.rivals[0].actor.vehicle.longitudinalSpeed, 0);
  assert.equal(
    scene.session.view.presentation.worldSprites[0].asset,
    race.rivals[0].session.view.presentation.worldSprites[0].asset,
  );
  const target = new SoftwareSurface(320, 240);
  let visibleRival = false;
  for (let tick = 0; tick < 8000; tick++) {
    race.advance(sampleRivalDrivingInput(scene.world.guide, actor.vehicle), 1 / 120);
    const camera = updateCamera(actor.cameraRig, scene.world, actor.vehicle, CURRENT_CAMERA_PROFILE, 1 / 120);
    if (tick % 600 === 0) {
      const observation = race.observe(camera);
      visibleRival ||= observation.sprites.some((s) => s.sRender > camera.s && s.sRender < camera.s + 200);
      const frame = scene.render(target, actor.vehicle, camera, 'car', observation.sprites);
      assert.ok(frame.terrainOutputPixels > 1000);
    }
    for (const session of [scene.session, race.rivals[0].session]) {
      const history = session.history;
      assert.ok(history.occurrences.length + history.selected.length <= 3);
      assert.ok([...history.occurrences, ...history.selected].every((o) => o.section === course.entry));
    }
  }
  assert.equal(visibleRival, true);
  assert.equal(race.player.progress.status, 'FINISHED');
  assert.equal(race.rivals[0].progress.status, 'FINISHED');
  assert.equal(race.player.progress.acceptedFinishCount, 1);
  assert.equal(actor.recovery.recoveries, 0);
  assert.equal(race.rivals[0].actor.recovery.recoveries, 0);
  assert.equal(scene.history.active.ordinal, 1);
  assert.ok(race.label().startsWith('FINISH'));
  const earned = [
    race.player.progress.sProgress,
    race.player.progress.validatedProgressFloor,
    race.player.finishElapsedSeconds,
  ];
  recoverVehicle(scene.world, actor.vehicle, { state: actor.recovery, reason: 'manual' });
  race.resyncPlayer();
  for (let tick = 0; tick < 10; tick++) race.advance({ steering: 0, throttle: false, brake: false }, 1 / 120);
  assert.deepEqual(
    [race.player.progress.sProgress, race.player.progress.validatedProgressFloor, race.player.finishElapsedSeconds],
    earned,
  );
});
test('repeated observation discontinuities retain only actual neighbors and share the one canonical source', () => {
  const { scene, actor } = fixture();
  for (let loop = 1; loop <= 16; loop++) {
    recoverVehicleToGuideCoordinate(scene.world, actor.vehicle, {
      state: actor.recovery,
      reason: 'manual',
      target: { s: 2031, l: 0 },
    });
    assert.equal(scene.observeStep(actor, actor.vehicle, true), 'forward');
    assert.equal(scene.history.active.ordinal, loop);
    assert.ok(scene.history.occurrences.length + scene.history.selected.length <= 3);
    assert.ok(
      [...scene.history.occurrences, ...scene.history.selected].every(
        (o) => o.section.raster === course.entry.raster && o.section.height === course.entry.height,
      ),
    );
    assert.equal(scene.session.referenceSOffset, loop * 2000);
    assert.ok(Math.abs(actor.vehicle.course.s - 31) < 1e-7);
  }
});
