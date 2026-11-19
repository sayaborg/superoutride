import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { resolveRunSetup } from '../../src/race/run-setup.js';
import { compileRunConfiguration } from '../../src/race/run-configuration.js';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';
import { fieldClass } from '../race/field-class.mjs';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createTextLayer } from '../../src/view/text-layer.js';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { drawRivalMarker } from '../../src/view/rival-marker.js';

const definitionContent = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(definitionContent, await loadEngineSounds(definitionContent));

async function setup() {
  const materials = await loadSurfaceMaterials(definitionContent);
  const course = await loadDeliveredCourse(definitionContent, 'tsukuba', materials);
  const testarossa = definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA');
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const assets = createVehicleSprites(testarossa);
  const compiledVehicle = createRunVehicle(
    definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'),
    definitions.driving,
  );
  return { course, materials, assets, scene, compiledVehicle };
}

test('shared route keeps vehicle and camera coordinates across forward and reverse seams', async () => {
  const { course, scene, compiledVehicle } = await setup();
  // Route readers only, without a race: vehicles are placed directly at the seam.
  const model = createVehicleModel(compiledVehicle, SIM_DT);
  const spawn = (s) => createVehicle(model, scene.world, { s, l: 0, initialSpeed: 0 });
  const link = course.entry.outgoing[0];
  const seam = link.from.section.coordinates.domain.end;
  scene.runtime.refresh(0, seam + 100);
  const rig = createCameraRig();
  rig.yaw = 0.7;
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

test('the view assembles fifteen rival sprites from race observations', async () => {
  const { course, scene, compiledVehicle } = await setup();
  const id = compiledVehicle.vehicleDefinition.compiledVehicle.id;
  const field = fieldClass(course, id, { rivals: 15 });
  const configuration = compileRunConfiguration({ mode: 'RACE', vehicleId: id, color: null }, course, field, {
    vehicles: definitions.vehicles,
  });
  const settings = resolveRunSetup(course, field, configuration, 0, compiledVehicle, null, {
    vehicleOf: () => ({ vehicle: compiledVehicle }),
  });
  const race = createCourseRace({ setup: settings, runtime: scene.runtime });
  assert.equal(race.rivals.length, 15);
  assert.deepEqual(race.advance({ steering: 0, throttle: false, brake: false }), { recovered: false, barriers: [] });
  const observed = race.observe();
  assert.equal(observed.rivals.length, 15);
  const camera = updateCamera(createCameraRig(), scene.world, observed.player, CAMERA_DEFINITION, 'FACING');
  const sprites = createRaceSprites(definitions.vehicles, () => true)(observed.rivals, camera, scene.world);
  assert.equal(sprites.length, observed.rivals.length);
  assert.deepEqual(
    sprites.map((s) => s.name),
    observed.rivals.map((a) => a.id),
  );
  assert.ok(sprites.every((s) => s.asset && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)));
});

test('a race of one rival marks it where the frame shows it and measures to it; a race of two does neither', async () => {
  const { course, scene, compiledVehicle } = await setup();
  const id = compiledVehicle.vehicleDefinition.compiledVehicle.id;
  const raceOf = (rivals) => {
    const field = fieldClass(course, id, { rivals });
    const configuration = compileRunConfiguration({ mode: 'RACE', vehicleId: id, color: null }, course, field, {
      vehicles: definitions.vehicles,
    });
    const setup = resolveRunSetup(course, field, configuration, 0, compiledVehicle, null, {
      vehicleOf: () => ({ vehicle: compiledVehicle }),
    });
    return createCourseRace({ setup, runtime: scene.runtime });
  };
  const race = raceOf(1);
  race.start();
  // The rival stands in the slot in front of the player: marked, and measured ahead of it.
  assert.equal(race.loneRivalId, race.rivals[0].id);
  assert.ok(race.rivalGap > 0);
  const frame = createLogicalFrame();
  const rig = createCameraRig();
  const pictures = createRaceSprites(definitions.vehicles, () => true);
  const frameShows = () => {
    const observed = race.observe();
    const camera = updateCamera(rig, scene.world, observed.player, CAMERA_DEFINITION, 'FACING');
    return scene.render(
      frame,
      null,
      camera,
      pictures(observed.rivals, camera, scene.world),
      [],
      [],
      null,
      race.loneRivalId,
    );
  };
  // On the grid it stands beside the camera's view, off the frame: no marker.
  assert.equal(frameShows(), null);
  // Once the field runs, it comes into view ahead, its picture entering the frame from the side.
  let shown = null;
  for (let step = 0; step < 900 && !shown; step++) {
    race.advance(null);
    shown = frameShows();
  }
  assert.ok(shown && Number.isFinite(shown.x) && shown.top < frame.height, 'the rival comes into view');
  // A picture the frame does not draw is not found.
  const camera = updateCamera(rig, scene.world, race.observe().player, CAMERA_DEFINITION, 'FACING');
  assert.equal(scene.render(frame, null, camera, [], [], [], null, race.loneRivalId), null);
  // The marker stands within the frame wherever the picture is.
  const text = createTextLayer(await loadTextTiles(definitionContent));
  for (const at of [shown, { x: -50, top: -100 }, { x: 400, top: 500 }])
    assert.doesNotThrow(() => drawRivalMarker(frame, text, at));
  // With two rivals, none is the race's one rival.
  const two = raceOf(2);
  two.start();
  assert.deepEqual([two.loneRivalId, two.rivalGap], [null, null]);
});
