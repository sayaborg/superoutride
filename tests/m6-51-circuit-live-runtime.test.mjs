import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SIM_DT } from '../dist/core/constants.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { M6_51_DEV_COURSE_MODE, createM651CircuitLiveRuntime } from '../dist/dev/m6-51-circuit-live-runtime.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';

function cameraProfile() {
  return {
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
    height: 2.469902425419539,
    baseDownPitch: 8 * Math.PI / 180,
    focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
    centerX: 160,
    centerY: 120,
    directionSpeedMin: 0.25,
    playerTargetY: 190,
    tauVertical: 0.22,
    deltaYMax: 4,
  };
}

function driveAcrossFirstSeam(live) {
  const { window } = live;
  const L = window.topology.lapLength;
  // Keep this probe narrow: it proves the seam itself rather than turning into a
  // handling calibration test for the deliberately DEV_UNCALIBRATED vehicle model.
  const car = createTestCar(window.guide, window.height, window.surface, L - 20);
  let ticks = 0;
  while (car.course.s <= L + 5 && ticks < 120) {
    const input = sampleRivalDrivingInput(window.guide, car, 0);
    updateTestVehicle(window.guide, window.height, window.surface, car, input, SIM_DT);
    ticks += 1;
  }
  return { car, ticks, L };
}

test('M6.51 live compiler derives exactly one unscored runtime copy beyond authored race laps', () => {
  const live = createM651CircuitLiveRuntime();
  const L = live.window.topology.lapLength;

  assert.equal(live.raceRules.lapCount, 3);
  assert.equal(live.window.repeatCount, 4);
  assert.ok(Math.abs(live.window.length - 4 * L) < 1e-8);
  assert.ok(Math.abs(live.raceRules.raceDistance - 3 * L) < 1e-8);
  assert.ok(live.raceRules.raceDistance < live.window.length);
});

test('M6.51 selectable DEV mode is a real CIRCUIT authority with no branch policy or shared lock', () => {
  assert.equal(M6_51_DEV_COURSE_MODE.routeKind, 'CIRCUIT');
  assert.equal(M6_51_DEV_COURSE_MODE.routeAuthorityKind, 'CIRCUIT_LOOP');
  assert.equal(M6_51_DEV_COURSE_MODE.finishKind, 'LAPS');
  assert.equal(M6_51_DEV_COURSE_MODE.rivalCount, 0);
  assert.equal(M6_51_DEV_COURSE_MODE.sharedRouteChoiceMode, 'INDEPENDENT');
  assert.equal(M6_51_DEV_COURSE_MODE.branchViolationPolicy, null);
});

test('M6.51 DEV lap closes only by one explicit duplicate endpoint and unfolds into ordinary open runtime', () => {
  const live = createM651CircuitLiveRuntime();
  const lap = live.window.topology.lapPath;
  const first = lap.vertices[0];
  const last = lap.vertices.at(-1);

  assert.deepEqual({ x: last.x, z: last.z }, { x: first.x, z: first.z });
  assert.equal(live.window.raster.segments.length, lap.segments.length * live.window.repeatCount);
  assert.ok(Math.abs(live.window.guide.length - live.window.length) < 1e-8);
});

test('M6.51 ordinary M5 car physics carries finite window chainage across an internal circuit seam', () => {
  const live = createM651CircuitLiveRuntime();
  const { car, ticks, L } = driveAcrossFirstSeam(live);

  assert.ok(ticks < 120, 'ordinary physics should physically reach the next unfolded copy');
  assert.ok(car.course.s > L + 5, 'course.s must continue monotonically beyond the former lap endpoint');
  assert.ok(car.course.s < 2 * L, 'one seam crossing must not jump an extra lap copy');
  assert.ok(car.supported, 'the narrow seam probe should remain on the authored supported corridor');
  assert.ok(Math.abs(car.course.l) < 12);
});

test('M6.51 existing open camera follows the same finite window ruler after the seam without wrap logic', () => {
  const live = createM651CircuitLiveRuntime();
  const { car, L } = driveAcrossFirstSeam(live);
  const camera = updateM5Camera(
    createM5CameraRig(),
    live.window.guide,
    live.window.height,
    car,
    cameraProfile(),
    SIM_DT,
  );

  assert.ok(camera.s > L, 'camera chainage should remain in the second finite copy');
  assert.ok(Math.abs((car.course.s - camera.s) - CURRENT_CAMERA_DISTANCE_METERS) < 1e-8);
});

test('M6.51 unchanged M5 renderer draws a normal frame after the live physics seam crossing', () => {
  const live = createM651CircuitLiveRuntime();
  const { car, L } = driveAcrossFirstSeam(live);
  const camera = updateM5Camera(
    createM5CameraRig(),
    live.window.guide,
    live.window.height,
    car,
    cameraProfile(),
    SIM_DT,
  );
  const surface = new SoftwareSurface(320, 240);
  const ground = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
  };
  const stats = renderM5Driving(
    surface,
    createM3FarBackground(),
    live.window.guide,
    camera,
    car,
    {
      screenHeight: 240,
      dMin: 2.5,
      dMax: 150,
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 4.5,
      roadRight: 4.5,
      height: live.window.height,
      visual: live.window.visual,
      thinSpanScreenRows: 1,
    },
    ground,
    [],
    createM4SpriteAssets(),
    'car',
  );

  assert.ok(car.course.s > L);
  assert.ok(stats.terrainLineCount > 0);
  assert.equal(stats.activeSection, 'M6.51 CIRCUIT STADIUM');
});

test('M6.51 generic live compiler remains topology integration only and owns no browser/renderer/vehicle/RouteDag dependency', async () => {
  const source = await readFile(new URL('../src/runtime/circuit-live-runtime.ts', import.meta.url), 'utf8');
  const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

  assert.equal(importSpecifiers.some((path) => path.includes('/render/')), false);
  assert.equal(importSpecifiers.some((path) => path.includes('/physics/')), false);
  assert.equal(importSpecifiers.some((path) => path.includes('route-dag')), false);
  assert.equal(importSpecifiers.some((path) => path.includes('main-circuit')), false);
  assert.doesNotMatch(source, /\bdocument\b|\bglobalThis\.window\b/);
  assert.match(source, /raceAuthoring\.lapCount \+ 1/);
});

test('M6.51 circuit browser composition uses existing open engine paths and contains no point-to-point route authority', async () => {
  const source = await readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8');
  const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

  assert.match(source, /updateArcadeVehicle\(guide, height, surfaces/);
  assert.match(source, /updateM5Camera\(cameraRig, guide, height/);
  assert.match(source, /renderM5Driving\(/);
  assert.match(source, /updateCircuitRaceProgress/);
  assert.equal(importSpecifiers.some((path) => /route-dag|live-route|shared-route-choice|branch-violation/.test(path)), false);
});
