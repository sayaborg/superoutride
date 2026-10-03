import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { createSessionVehicle } from '../../src/content/session-vehicle.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createRenderMeasurements } from '../../src/view/renderer.js';
import { createVehicle, updateVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { STRIP_RENDER_METHODS } from '../../src/view/display-settings.js';
import { createDisplaySettings } from '../../src/view/display-settings.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';

const definitionContent = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(definitionContent, await loadEngineSounds(definitionContent));

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
for (const { id: stem } of content.manifest.files.filter((file) => file.kind === 'course'))
  test(`${stem} compiles and starts through the shared driving scene`, async () => {
    const course = await loadDeliveredCourse(content, stem, materials);
    const settings = createDisplaySettings();
    assert.equal(settings.stripMethod, 'LEVEL-POINT');
    const scene = createCourseScene(course.entry, course.gates, definitions.vehicles, settings);
    const entry = definitions.vehicles[0];
    const sprites = createVehicleSprites(entry);
    const model = createVehicleModel(createSessionVehicle(entry, definitions.driving, materials), SIM_DT);
    const vehicle = createVehicle(model, scene.world, { s: course.gates.grid.at(-1).at.s, l: 0, initialSpeed: 0 });
    const rig = createCameraRig(),
      target = createLogicalFrame();
    for (let frame = 0; frame < 3; frame++) {
      updateVehicle(scene.world, vehicle, model, { steering: 0, throttle: true, brake: false });
      const camera = updateCamera(rig, scene.world, vehicle, CAMERA_DEFINITION);
      target.pixels.fill(0);
      const result = createRenderMeasurements();
      scene.render(target, vehicle, camera, sprites.off, [], result);
      assert.ok(result.stripGround.outputPixels > 0);
      const before = JSON.stringify(vehicle),
        occurrences = scene.runtime.window.occurrences,
        view = scene.runtime.readers;
      for (const method of STRIP_RENDER_METHODS) {
        settings.setStripMethod(method);
        scene.render(target, vehicle, camera, sprites.off, [], result);
        assert.equal(result.stripGround.method, method);
        assert.equal(JSON.stringify(vehicle), before);
        assert.equal(scene.runtime.window.occurrences, occurrences);
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
