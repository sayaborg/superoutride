import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { measureRacingVehicle } from '../../tools/course/racing-vehicle-check.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { formPool } from '../../src/race/free-play-field.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createTextLayer } from '../../src/view/text-layer.js';
import { writeHud } from '../../src/shell/run-hud.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';

const content = await readDeliveredContent();
const sounds = await loadEngineSounds(content);
const definitions = await loadVehicleDefinitions(content, sounds);
const materials = await loadSurfaceMaterials(content);
const freePlay = await loadFreePlayRules(content);
const course = await loadDeliveredCourse(content, 'tsukuba', materials);
const tiles = await loadTextTiles(content);
const identities = [
  ['NSR500_1987', 6, 4, 1, 156 * 0.73549875],
  ['YZR500_0W98', 6, 4, 1, 150 * 0.73549875],
  ['MCLAREN_MP4_4', 6, 6, 2, 685 * 0.73549875],
  ['FERRARI_640', 7, 12, 2, 441],
  ['LOTUS_79_SPECIAL', 2, 8, 2, 500],
];
const idle = { steering: 0, throttle: false, brake: false };

for (const [id, gears, cylinders, cycle, powerKW] of identities) {
  test(`${id}: authored power, all forward gears, braking, restart and cornering`, () => {
    const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === id);
    assert.ok(entry);
    const p = entry.compiledVehicle.powertrain;
    assert.equal(p.gearRatios.length, gears);
    assert.equal(sounds[id].firingPhases.length, cylinders);
    assert.equal(sounds[id].cycleRevolutions, cycle);
    const curve = p.torqueCurve;
    const power = (rpm, t) => (rpm * t * Math.PI) / 30000;
    assert.ok(Math.abs(power(curve[3].rpm, curve[3].torqueNewtonMeters) - powerKW) < 0.001);
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1],
        b = curve[i],
        slope = (b.torqueNewtonMeters - a.torqueNewtonMeters) / (b.rpm - a.rpm);
      const stationary = (slope * a.rpm - a.torqueNewtonMeters) / (2 * slope);
      for (const rpm of [a.rpm, b.rpm, ...(stationary > a.rpm && stationary < b.rpm ? [stationary] : [])])
        assert.ok(power(rpm, a.torqueNewtonMeters + slope * (rpm - a.rpm)) <= powerKW + 0.001);
    }
    const result = measureRacingVehicle(entry, definitions.driving, 75);
    assert.deepEqual(
      result.shifts.map((s) => s.to),
      Array.from({ length: gears - 1 }, (_, i) => i + 2),
    );
    assert.ok(result.braking.endKph < 0.4);
    assert.ok(result.restartKph > 100);
    assert.ok(result.maximumLateralAcceleration > 1);
    if (gears === 2) {
      assert.ok(result.terminalRangeKph[0] >= 345 && result.terminalRangeKph[1] <= 355);
      assert.ok(Math.abs(result.samples.at(-1).acceleration) < 0.001);
    }
  });
  test(`${id}: FREE PLAY starts, renders and resets with its delivered pictures`, async () => {
    const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === id);
    assert.equal(entry.spriteSet.yawVariants, 64);
    assert.equal(entry.spriteSet.bankVariants, entry.listing.form === 'bike' ? 7 : 1);
    const prepared = await prepareRun(content, { ...definitions, materials, freePlay }, course, null, {
      mode: 'FREE_PLAY',
      vehicleId: id,
      color: null,
      lapCount: 1,
      rivalCount: 0,
      rivalPool: formPool(freePlay, entry).id,
      traffic: 'OFF',
    });
    const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
    const race = createCourseRace({ setup: prepared.resolve(0), runtime: scene.runtime });
    race.start();
    while (race.outcome.status === 'READY') race.advance(idle);
    for (let tick = 0; tick < 120; tick++) race.advance({ ...idle, throttle: true });
    const player = race.observe().player;
    assert.ok(player.speed > 5);
    assert.equal(player.vehicleId, id);
    assert.equal(player.contactResponse.sequence, 0);
    const camera = updateCamera(createCameraRig(), scene.world, player, CAMERA_DEFINITION, 'FACING');
    const frame = createLogicalFrame(),
      text = createTextLayer(tiles);
    const visual = createVehicleSprites(entry);
    scene.render(frame, { vehicle: player, set: visual.off }, camera, [], [], []);
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
    await mkdir(new URL('../../dist/racing-validation/', import.meta.url), { recursive: true });
    await writeFile(new URL(`../../dist/racing-validation/${id}.png`, import.meta.url), PNG.sync.write(png));
    const resetScene = createCourseScene(course.entry, course.gates, definitions.vehicles);
    const reset = createCourseRace({ setup: prepared.resolve(0), runtime: resetScene.runtime });
    reset.start();
    assert.equal(reset.player.actor.vehicle.speed, 0);
    assert.equal(reset.player.actor.contactResponse.sequence, 0);
  });
}
