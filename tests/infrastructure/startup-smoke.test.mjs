import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCourse, loadCourseGround } from '../../tools/course/authoring-io.mjs';
import { readVehicleSprites } from '../../tools/course/read-vehicle-sprites.mjs';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { deriveVehicleSpriteFamily } from '../../dist/render/vehicle-presentation.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';

test('a saved course compiles and starts through the shared driving scene', async () => {
  const file = fileURLToPath(new URL('../../content/courses/linear.course.json', import.meta.url));
  const { course } = await loadCourse(file);
  const scene = createCourseScene(course.entry, await loadCourseGround(course, file), await readVehicleSprites());
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
    scene.render(target, vehicle, camera, deriveVehicleSpriteFamily(entry), []);
    assert.ok([vehicle.x, vehicle.y, vehicle.z, camera.s].every(Number.isFinite));
    assert.ok(
      target.pixels.some((pixel) => pixel !== 0),
      `frame ${frame} was not drawn`,
    );
  }
});
