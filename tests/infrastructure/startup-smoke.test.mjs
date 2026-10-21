import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createRenderMeasurements } from '../../src/view/renderer.js';
import { createVehicle, updateVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { driverSteering } from '../../src/vehicle/steering-rule.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';

const definitionContent = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(definitionContent, await loadEngineSounds(definitionContent));

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
for (const { id: stem } of content.manifest.files.filter((file) => file.kind === 'course'))
  test(`${stem} compiles and starts through the shared driving scene`, async () => {
    const course = await loadDeliveredCourse(content, stem, materials);
    const entry = definitions.vehicles[0];
    const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
    const sprites = createVehicleSprites(entry);
    const model = createVehicleModel(createRunVehicle(entry, definitions.driving), SIM_DT);
    const steering = driverSteering(definitions.driving.compiledDriving.defaultSteering, model);
    // The player's grid slot, as a product run places it.
    const slot = courseStartGrid(course.gates, entry.listing.form === 'bike').at(-1);
    const vehicle = createVehicle(model, scene.world, { s: slot.at.s, l: slot.l, initialSpeed: 0 });
    const rig = createCameraRig(),
      target = createLogicalFrame();
    const player = { vehicle, set: sprites.off, reach: entry.compiledVehicle.reach };
    for (let frame = 0; frame < 3; frame++) {
      updateVehicle(scene.world, vehicle, model, { steering: 0, throttle: true, brake: false }, steering);
      const camera = updateCamera(rig, scene.world, vehicle, CAMERA_DEFINITION, 'FACING');
      target.pixels.fill(0);
      const result = createRenderMeasurements();
      scene.render(target, player, camera, [], [], [], result);
      assert.ok(result.stripGround.outputPixels > 0);
      const before = JSON.stringify(vehicle),
        occurrences = scene.runtime.window.occurrences,
        view = scene.runtime.readers;
      // Rendering again changes neither the vehicle nor the Route's window and readers.
      scene.render(target, player, camera, [], [], [], result);
      assert.equal(JSON.stringify(vehicle), before);
      assert.equal(scene.runtime.window.occurrences, occurrences);
      assert.equal(scene.runtime.readers, view);
      assert.ok([vehicle.x, vehicle.y, vehicle.z, camera.s].every(Number.isFinite));
      assert.ok(
        target.pixels.some((pixel) => pixel !== 0),
        `frame ${frame} was not drawn`,
      );
    }
  });
