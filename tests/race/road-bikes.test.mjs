import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { measureRacingVehicle, measureVehicleBraking } from '../../tools/course/racing-vehicle-check.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { formPool } from '../../src/race/free-play-field.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { recoverVehicleToPlanCoordinate } from '../../src/race/recovery.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createTextLayer } from '../../src/view/text-layer.js';
import { writeHud } from '../../src/shell/run-hud.js';
import { createVehicleAudioEmitter, readVehicleAudio } from '../../src/shell/vehicle-audio.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';

const content = await readDeliveredContent();
const sounds = await loadEngineSounds(content);
const definitions = await loadVehicleDefinitions(content, sounds);
const materials = await loadSurfaceMaterials(content);
const freePlay = await loadFreePlayRules(content);
const course = await loadDeliveredCourse(content, 'tsukuba', materials);
const tiles = await loadTextTiles(content);
const identities = [
  ['CB900F_1981', 5],
  ['GSX1100SZ', 5],
  ['GPZ900R_A1', 6],
  ['GSX_R750_1985', 6],
  ['VMAX1200_1985', 5],
];
const idle = { steering: 0, throttle: false, brake: false };

for (const [id, gears] of identities) {
  test(`${id}: four-stroke road bike completes shifts, braking, restart and both steering directions`, () => {
    const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === id);
    assert.ok(entry);
    assert.equal(entry.listing.form, 'bike');
    assert.equal(entry.compiledVehicle.powertrain.gearRatios.length, gears);
    assert.equal(entry.compiledVehicle.powertrain.cycle, 4);
    assert.equal(sounds[id].cycleRevolutions, 2);
    assert.equal(sounds[id].firingPhases.length, 4);
    assert.equal(entry.listing.contactResponse, undefined);
    const result = measureRacingVehicle(entry, definitions.driving, 75);
    assert.ok(result.targets[100]);
    assert.deepEqual(
      result.shifts.map((s) => s.to),
      Array.from({ length: gears - 1 }, (_, i) => i + 2),
    );
    assert.deepEqual(
      result.braking.shifts.map((s) => s.to),
      Array.from({ length: gears - 1 }, (_, i) => gears - i - 1),
    );
    assert.ok(result.braking.stopped);
    assert.ok(result.restartKph > 20);
    assert.ok(result.lateralAccelerationRange[0] < -0.1);
    assert.ok(result.lateralAccelerationRange[1] > 0.1);
    const braking = measureVehicleBraking(entry, definitions.driving, 100);
    assert.ok(Math.abs(braking.fromKph - 100) < 1e-10);
    assert.ok(braking.stopped);
    assert.ok(braking.metres > 0 && braking.seconds > 0);
    assert.ok(braking.shifts.every((shift) => shift.to === shift.from - 1));
  });

  test(`${id}: FREE PLAY renders its lamps, follows engine audio, contacts normally and resets`, async () => {
    const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === id);
    const prepared = await prepareRun(content, { ...definitions, materials, freePlay }, course, null, {
      mode: 'FREE_PLAY',
      vehicleId: id,
      color: null,
      lapCount: 1,
      rivalCount: 1,
      rivalPool: formPool(freePlay, entry).id,
      traffic: 'OFF',
    });
    const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
    const race = createCourseRace({ setup: prepared.resolve(0), runtime: scene.runtime });
    race.start();
    while (race.outcome.status === 'READY') race.advance(idle);
    const emitter = createVehicleAudioEmitter();
    let firstRpm = null;
    for (let tick = 0; tick < 120; tick++) {
      race.advance({ ...idle, throttle: true });
      const player = race.observe().player;
      readVehicleAudio(player, emitter);
      assert.equal(emitter.rpm, race.player.actor.vehicle.powertrain.engineRpm);
      assert.equal(emitter.effectiveOpening, race.player.actor.vehicle.powertrain.effectiveOpening);
      firstRpm ??= emitter.rpm;
    }
    assert.notEqual(emitter.rpm, firstRpm);
    const player = race.observe().player;
    assert.equal(player.vehicleId, id);
    assert.ok(player.speed > 5);
    assert.equal(player.brakeLampOn, false);
    const visual = createVehicleSprites(entry);
    assert.equal(entry.spriteSet.colors.length, 4);
    assert.notEqual(entry.spriteSet.brakeLamp.off, entry.spriteSet.brakeLamp.on);
    assert.ok(
      entry.spriteSet.pictures.some((row) =>
        row.some((picture) => {
          const frame = picture.sizes[0];
          for (let index = 0; index < frame.width * frame.height; index++)
            if (frame.pattern.indexAt(index) === 15) return true;
          return false;
        }),
      ),
    );
    const frame = createLogicalFrame(),
      text = createTextLayer(tiles);
    const camera = updateCamera(createCameraRig(), scene.world, player, CAMERA_DEFINITION, 'FACING');
    scene.render(frame, { vehicle: player, set: visual.off, reach: entry.compiledVehicle.reach }, camera, [], [], []);
    writeHud(
      {
        race,
        player,
        camera,
        run: {
          courseName: course.name,
          rules: 'FREE PLAY',
          redlineRpm: entry.compiledVehicle.powertrain.redlineRpm,
          steeringPicture: entry.steeringPicture,
          tireKnee: race.player.actor.model.tire.rhoKnee,
          slowDown: false,
        },
        record: null,
        split: null,
      },
      text,
      false,
    );
    text.draw(frame);
    const png = new PNG({ width: frame.width, height: frame.height });
    frame.pixels.forEach((pixel, i) => {
      const c = unpackRgba(rgb555ToRgba(pixel));
      png.data.set([c.r, c.g, c.b, 255], i * 4);
    });
    const directory = new URL('../../dist/road-bike-validation/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL(`${id}.png`, directory), PNG.sync.write(png));
    race.advance({ ...idle, brake: true });
    assert.equal(race.observe().player.brakeLampOn, true);

    // Put the player at a real rival's location, then let the shared contact system handle the overlap.
    const actor = race.player.actor,
      other = race.rivals[0].actor;
    recoverVehicleToPlanCoordinate(scene.world, actor.vehicle, actor.model, {
      state: actor.recovery,
      target: { s: other.vehicle.course.s, l: other.vehicle.course.l },
      reason: 'blocked',
    });
    race.advance(idle);
    assert.ok(race.playerContacts.starts.some((contact) => contact.counterpart === 'vehicle'));
    assert.equal(actor.contactResponse.sequence, 0);
    assert.equal(actor.contactResponse.phase, 'driving');
    assert.ok(Number.isFinite(actor.vehicle.speed));
    const recoveries = actor.recovery.recoveries;
    race.recoverPlayer();
    assert.equal(actor.recovery.recoveries, recoveries + 1);
    assert.equal(actor.recovery.lastReason, 'manual');
    assert.equal(actor.contactResponse.sequence, 0);

    const resetScene = createCourseScene(course.entry, course.gates, definitions.vehicles);
    const reset = createCourseRace({ setup: prepared.resolve(0), runtime: resetScene.runtime });
    reset.start();
    assert.equal(reset.player.actor.vehicle.speed, 0);
    assert.equal(reset.player.actor.contactResponse.sequence, 0);
    assert.equal(reset.player.actor.recovery.recoveries, 0);
  });
}
