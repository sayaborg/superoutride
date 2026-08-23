import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideCourseToWorld, locateWorldOnGuideLocal, sampleGuideCurve } from '../dist/core/guide-curve.js';
import { pseudoDepth, pseudoProject } from '../dist/core/projection.js';
import { computeM2Camera } from '../dist/dev/m2-camera.js';
import { createM2Vehicle } from '../dist/dev/m2-vehicle.js';
import {
  computeForwardVisibleInterval,
  generateFlatTerrainLines,
  lateralToScreenX,
  screenXToLateral,
} from '../dist/road/terrain-line.js';

const deg = (value) => value * Math.PI / 180;
const near = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

const cameraProfile = {
  dCam: 20,
  lCamMax: 12,
  height: 2,
  pitch: deg(8),
  focalLength: 200,
  centerX: 160,
  centerY: 120,
};

const roadProfile = {
  screenHeight: 240,
  dMin: 2.5,
  dMax: 150,
  groundY: 0,
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
};

test('stadium debug course satisfies closed-course draw-distance requirement', () => {
  const guide = createM2StadiumGuide();
  assert.ok(guide.length > 2 * roadProfile.dMax);
});

test('free world motion on the long straight produces simultaneous s and l change', () => {
  const guide = createM2StadiumGuide();
  const start = guideCourseToWorld(guide, 60, 0);
  const yaw = start.heading + deg(20);
  const travel = 10;
  const moved = {
    x: start.x + Math.sin(yaw) * travel,
    z: start.z + Math.cos(yaw) * travel,
  };
  const located = locateWorldOnGuideLocal(guide, moved, start.segmentIndex, 3);

  near(located.s - 60, Math.cos(deg(20)) * travel, 0.02);
  near(located.l, Math.sin(deg(20)) * travel, 0.02);
  assert.ok(located.l > 0);
});

test('camera chainage keeps player pseudo-depth exactly D_cam even with lateral offset and yaw', () => {
  const guide = createM2StadiumGuide();
  const vehicle = createM2Vehicle(guide, 80);
  vehicle.course.l = 7;
  vehicle.yaw += deg(25);
  const camera = computeM2Camera(guide, vehicle, cameraProfile);
  const d = pseudoDepth(vehicle.course.s, camera.s, guide.length);
  near(d, cameraProfile.dCam, 1e-10);
});

test('flat TerrainLine generator emits far-to-near horizontal rows and valid affine spans', () => {
  const guide = createM2StadiumGuide();
  const vehicle = createM2Vehicle(guide, 80);
  const camera = computeM2Camera(guide, vehicle, cameraProfile);
  const lines = generateFlatTerrainLines(guide, camera, roadProfile);

  assert.ok(lines.length > 100);
  for (let i = 1; i < lines.length; i += 1) {
    assert.ok(lines[i].y > lines[i - 1].y);
    assert.ok(lines[i].d < lines[i - 1].d);
  }
  for (const line of lines) {
    assert.ok(line.xGroundL < line.xGroundR);
    assert.ok(line.xGroundL < line.xRoadL);
    assert.ok(line.xRoadL < line.xRoadR);
    assert.ok(line.xRoadR < line.xGroundR);
  }
});

test('horizontal mapping is exactly affine and invertible on a non-degenerate TerrainLine', () => {
  const xL = 40;
  const xR = 280;
  const gL = 12;
  const gR = 12;
  const xCenter = lateralToScreenX(0, xL, xR, gL, gR);
  near(xCenter, 160);
  near(lateralToScreenX(-12, xL, xR, gL, gR), xL);
  near(lateralToScreenX(12, xL, xR, gL, gR), xR);
  near(screenXToLateral(xCenter, xL, xR, gL, gR), 0);
  near(screenXToLateral(xL, xL, xR, gL, gR), -12);
  near(screenXToLateral(xR, xL, xR, gL, gR), 12);
});

test('forward-only visibility becomes empty when camera faces more than 90 degrees away', () => {
  const guide = createM2StadiumGuide();
  const sCamera = 40;
  const road = sampleGuideCurve(guide, sCamera + roadProfile.dMin);
  const visible = computeForwardVisibleInterval(
    guide,
    road.heading + deg(100),
    sCamera,
    roadProfile.dMin,
    roadProfile.dMax,
  );
  assert.equal(visible, null);
});

test('player projection scale depends on chainage depth, not Euclidean camera distance', () => {
  const guide = createM2StadiumGuide();
  const vehicle = createM2Vehicle(guide, 80);
  vehicle.course.l = 10;
  const roadAtCar = sampleGuideCurve(guide, vehicle.course.s);
  const displaced = guideCourseToWorld(guide, vehicle.course.s, 10);
  vehicle.x = displaced.x;
  vehicle.z = displaced.z;
  vehicle.yaw = roadAtCar.heading + deg(15);

  const camera = computeM2Camera(guide, vehicle, cameraProfile);
  const projected = pseudoProject(
    { x: vehicle.x, y: 0, z: vehicle.z, s: vehicle.course.s },
    camera,
  );
  near(projected.depth, 20);
  near(projected.scale, 10);
});
