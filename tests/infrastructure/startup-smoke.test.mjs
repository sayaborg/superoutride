import { browserSessionVehicle } from '../../src/shell/session-vehicle.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/course/load-delivered-course.js';
import { loadCourseGround } from '../../tools/course/authoring-io.ts';
import { readVehicleSprites } from '../../tools/course/read-vehicle-sprites.ts';
import { createCourseScene } from '../../src/shell/course-scene.js';
import { createVehicle, updateVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { loadVehicleDefinitions } from '../../src/vehicle/definition-document.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { deriveVehicleSpriteFamily } from '../../src/view/vehicle-visuals.js';
import { STRIP_RENDER_METHODS } from '../../src/view/display-settings.js';
import { createDisplaySettings } from '../../src/view/display-settings.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';

const definitions = await loadVehicleDefinitions(await readDeliveredContent());

const content = await readDeliveredContent();
for (const { id: stem } of content.manifest.files.filter((file) => file.kind === 'course'))
  test(`${stem} compiles and starts through the shared driving scene`, async () => {
    const course = await loadDeliveredCourse(content, stem);
    const settings = createDisplaySettings();
    assert.equal(settings.stripMethod, 'LEVEL-POINT');
    const scene = createCourseScene(
      course.entry,
      await loadCourseGround(course),
      await readVehicleSprites(),
      course.gates,
      definitions.vehicles,
      settings,
    );
    const entry = definitions.vehicles[0];
    const vehicle = createVehicle(entry.compiledVehicle, scene.world, {
      s: course.gates.grid[0].at.s,
      l: 0,
      initialSpeed: 0,
      ...browserSessionVehicle(entry, definitions.driving),
    });
    const rig = createCameraRig(),
      target = new SoftwareSurface(320, 240);
    for (let frame = 0; frame < 3; frame++) {
      updateVehicle(scene.world, vehicle, { steering: 0, throttle: true, brake: false }, 1 / 60);
      const camera = updateCamera(rig, scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
      target.pixels.fill(0);
      const result = scene.render(target, vehicle, camera, deriveVehicleSpriteFamily(entry), []);
      assert.ok(result.stripGround.outputPixels > 0);
      const before = JSON.stringify(vehicle),
        occurrences = scene.runtime.route.occurrences,
        view = scene.runtime.readers;
      for (const method of STRIP_RENDER_METHODS) {
        settings.setStripMethod(method);
        assert.equal(
          scene.render(target, vehicle, camera, deriveVehicleSpriteFamily(entry), []).stripGround.method,
          method,
        );
        assert.equal(JSON.stringify(vehicle), before);
        assert.equal(scene.runtime.route.occurrences, occurrences);
        assert.equal(scene.runtime.readers, view);
      }
      assert.throws(() => settings.setStripMethod('UNKNOWN'), RangeError);
      assert.ok([vehicle.x, vehicle.y, vehicle.z, camera.s].every(Number.isFinite));
      assert.ok(
        target.pixels.some((pixel) => pixel !== 0),
        `frame ${frame} was not drawn`,
      );
    }
  });
