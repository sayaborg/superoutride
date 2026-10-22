import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadContactExplosionPictures } from '../../src/content/contact-explosion-pictures.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createCompetitorObservation, writeCompetitorObservation } from '../../src/race/competitor-observation.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';
import { createContactExplosionSprites } from '../../src/view/contact-explosion-sprites.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

test('delivered explosion frames render through the shared scene at the common base, replacing the stopped vehicle', async () => {
  const content = await readDeliveredContent();
  const frames = await loadContactExplosionPictures(content);
  const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
  const materials = await loadSurfaceMaterials(content);
  const course = await loadDeliveredCourse(content, 'tsukuba', materials);
  const entry = definitions.vehicles[0];
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const model = createVehicleModel(createRunVehicle(entry, definitions.driving), SIM_DT);
  const vehicle = createVehicle(model, scene.world, { s: 30, l: 0, initialSpeed: 0 });
  const actor = createCompetitorObservation(
    'effect',
    entry.compiledVehicle.id,
    entry.listing.visuals.palette,
    entry.listing.form,
  );
  const response = { phase: 'exploding', seconds: 0, sequence: 1 };
  const publish = () =>
    writeCompetitorObservation(actor, vehicle, { steering: 0, throttle: false, brake: false }, 0, response);
  publish();
  const camera = updateCamera(createCameraRig(), scene.world, actor, CAMERA_DEFINITION, 'FACING');
  const target = createLogicalFrame();
  scene.render(target, null, camera, [], [], []);
  const road = target.pixels.slice();
  const explosions = createContactExplosionSprites(frames);
  const vehicles = createRaceSprites(definitions.vehicles);
  const rendered = new Set();
  for (let frame = 0; frame < frames.length; frame++) {
    response.seconds = ((frame + 0.5) * 1.2) / frames.length;
    publish();
    const sprites = explosions([actor], scene.world.coordinates);
    assert.equal(sprites.length, 1);
    assert.equal(sprites[0].asset, frames[frame]);
    assert.equal(sprites[0].y, actor.renderY);
    assert.equal(vehicles([actor], camera, scene.world).length, 0);
    scene.render(target, null, camera, [], sprites, []);
    assert.ok(target.pixels.filter((pixel, i) => pixel !== road[i]).length > 100);
    rendered.add(Buffer.from(target.pixels.buffer).toString('base64'));
  }
  assert.equal(rendered.size, frames.length);
  response.phase = 'recovering';
  publish();
  assert.equal(explosions([actor], scene.world.coordinates).length, 0);
  assert.equal(vehicles([actor], camera, scene.world).length, 0);
  response.phase = 'protected';
  publish();
  assert.equal(explosions([actor], scene.world.coordinates).length, 0);
  assert.equal(vehicles([actor], camera, scene.world).length, 1);
});
