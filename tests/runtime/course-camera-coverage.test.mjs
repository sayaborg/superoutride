import assert from 'node:assert/strict';
import test from 'node:test';
import { courseCameraQueryBounds } from '../../dist/runtime/course-camera-coverage.js';
import { pseudoProject } from '../../dist/core/projection.js';
import { compilePlanarTransform, transformPlanarPoint } from '../../dist/core/planar-transform.js';
import { guidePathToWorld } from '../../dist/core/guide-curve.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { createSeamDrivingFixture, seamDrivingView } from '../helpers/course-seam-driving.mjs';
import { cameraProfile, ok } from '../helpers/course-driving-probe.mjs';

const render = { width: 320, dMin: 2.5, dMax: 200 };

test('actual camera bounds contain independently projected viewport points with world/ruler offsets', () => {
  const source = { x: 0, z: 0, heading: 0 };
  for (const angle of [-0.65, -0.1, 0, 0.4]) {
    const port = { x: 31, z: -82, heading: angle };
    const transform = compilePlanarTransform(source, port);
    for (const yaw of [-0.3, 0, 0.25]) {
      const localCamera = {
        x: 2.1,
        y: 4,
        z: -7.3,
        s: 995,
        yaw,
        pitch: 0.2,
        focalLength: 200,
        centerX: 143,
        centerY: 120,
      };
      const camera = { ...localCamera, ...transformPlanarPoint(transform, localCamera), yaw: yaw + angle };
      const bounds = ok(courseCameraQueryBounds(port, 1000, camera, render, [])).groundFilter;
      for (const depth of [2.5, 4, 50, 112, 200])
        for (const x of [0, 0.5, 143, 319.5, 320]) {
          // Independent world ray, then the actual Core projector; the camera's ruler and world S differ.
          const s = localCamera.s + depth,
            z = s - 1000;
          const lateral =
            localCamera.x +
            (Math.sin(yaw) * (z - localCamera.z) + ((x - localCamera.centerX) * depth) / localCamera.focalLength) /
              Math.cos(yaw);
          const world = transformPlanarPoint(transform, { x: lateral, z });
          const projected = pseudoProject({ ...world, y: 0, s }, camera);
          assert.ok(Math.abs(projected.x - x) < 1e-9);
          assert.ok(lateral >= bounds.left - 1e-10 && lateral <= bounds.right + 1e-10);
          assert.ok(z >= bounds.start && z <= bounds.end);
        }
    }
  }
});

test('seam camera admission checks actual yaw, viewport/depth and independent presentation consumer limits', async () => {
  const f = await createSeamDrivingFixture();
  const geometry = seamDrivingView(f).geometry;
  const d = ok(f.source.createSeamView(geometry, f.traversal.snapshot().selected[0]));
  const point = guidePathToWorld(f.c.entry.guide, 1400, 1);
  const vehicle = {
    ...point,
    y: 1,
    yaw: point.heading,
    course: { s: 1400, l: 1 },
    longitudinalSpeed: 20,
    lateralSpeed: 0,
    sprungPitch: 0,
    presentationY: 1,
  };
  const camera = updateCamera(createCameraRig(), d.world, vehicle, cameraProfile, 1 / 60);
  assert.equal(d.admitCamera(camera, render).ok, true);
  assert.equal(d.admitCamera({ ...camera, yaw: camera.yaw + 0.6 }, render).reason, 'camera_domain_exhausted');
  assert.equal(d.admitCamera(camera, { ...render, width: 1000 }).reason, 'camera_domain_exhausted');
  assert.equal(d.admitCamera(camera, { ...render, dMax: 400 }).reason, 'camera_domain_exhausted');
  assert.equal(d.admitCamera({ ...camera, yaw: camera.yaw + Math.PI }, render).reason, 'camera_facing_unqualified');
  assert.throws(() => d.admitCamera(null, render), TypeError);
  assert.throws(() => d.admitCamera(camera, { ...render, width: 0 }), RangeError);
  assert.equal(f.traversal.snapshot().occurrences.length, 1);
});
