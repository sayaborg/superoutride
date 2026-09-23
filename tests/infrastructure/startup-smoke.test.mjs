import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCourse, loadCourseGround } from '../../tools/course/authoring-io.ts';
import { readVehicleSprites } from '../../tools/course/read-vehicle-sprites.ts';
import { createCourseScene } from '../../src/shell/course-scene.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../../src/vehicle/physics/arcade-vehicle-physics.js';
import { VEHICLE_CATALOG } from '../../src/vehicle/vehicle-catalog.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { deriveVehicleSpriteFamily } from '../../src/view/vehicle-visuals.js';
import { BAND_RENDER_METHODS } from '../../src/view/display-settings.js';
import { createDisplaySettings } from '../../src/view/display-settings.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';

for (const stem of ['ribbon-coast', 'ribbon-fork', 'ribbon-ring'])
  test(`${stem} compiles and starts through the shared driving scene`, async () => {
    const file = fileURLToPath(new URL(`../../content/courses/${stem}.course.json`, import.meta.url));
    const { course } = await loadCourse(file);
    const settings = createDisplaySettings();
    assert.equal(settings.bandMethod, 'LEVEL-POINT');
    const scene = createCourseScene(course.entry, await loadCourseGround(course), await readVehicleSprites(), settings);
    const entry = VEHICLE_CATALOG[0];
    const port = course.entry.ports.find((port) => port.kind === 'entry');
    const vehicle = createArcadeVehicle(entry.profile, scene.world, {
      s: port.anchor.s,
      l: 0,
      initialSpeed: 0,
      torqueProtection: entry.torqueProtection,
    });
    const rig = createCameraRig(),
      target = new SoftwareSurface(320, 240);
    for (let frame = 0; frame < 3; frame++) {
      updateArcadeVehicle(scene.world, vehicle, { steering: 0, throttle: true, brake: false }, 1 / 60);
      const camera = updateCamera(rig, scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
      target.pixels.fill(0);
      const result = scene.render(target, vehicle, camera, deriveVehicleSpriteFamily(entry), []);
      assert.ok(result.bandGround.outputPixels > 0);
      const before = JSON.stringify(vehicle),
        history = scene.history,
        view = scene.session.view;
      for (const method of BAND_RENDER_METHODS) {
        settings.setBandMethod(method);
        assert.equal(
          scene.render(target, vehicle, camera, deriveVehicleSpriteFamily(entry), []).bandGround.method,
          method,
        );
        assert.equal(JSON.stringify(vehicle), before);
        assert.equal(scene.history, history);
        assert.equal(scene.session.view, view);
      }
      assert.throws(() => settings.setBandMethod('UNKNOWN'), RangeError);
      assert.ok([vehicle.x, vehicle.y, vehicle.z, camera.s].every(Number.isFinite));
      assert.ok(
        target.pixels.some((pixel) => pixel !== 0),
        `frame ${frame} was not drawn`,
      );
    }
  });
