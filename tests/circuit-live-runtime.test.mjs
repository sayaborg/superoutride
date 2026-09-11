import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CENTER_DASH_MARKINGS } from '../dist/dev/courses/stadium-surface-authoring.js';
import { STADIUM_CIRCUIT_SESSION } from '../dist/dev/fixtures/stadium-circuit.js';

import { SIM_DT } from '../dist/browser/frame-loop.js';
import { createCameraRig, updateCamera } from '../dist/camera/camera.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { createStadiumCircuitRuntime, STADIUM_CIRCUIT_MODE } from '../dist/dev/fixtures/stadium-circuit.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { SoftwareSurface } from '../dist/graphics/software-surface.js';
import { renderDriving } from '../dist/render/renderer.js';
import { createFarBackground } from '../dist/visual/far-background.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';
import { createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';

function cameraProfile() {
  return {
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
    height: 2.469902425419539,
    baseDownPitch: (8 * Math.PI) / 180,
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

test('live compiler derives exactly one unscored runtime copy beyond authored race laps', () => {
  const live = createStadiumCircuitRuntime();
  const L = live.window.topology.lapLength;

  assert.equal(live.raceRules.lapCount, 3);
  assert.equal(live.window.repeatCount, 4);
  assert.ok(Math.abs(live.window.length - 4 * L) < 1e-8);
  assert.ok(Math.abs(live.raceRules.raceDistance - 3 * L) < 1e-8);
  assert.ok(live.raceRules.raceDistance < live.window.length);
});

test('selectable DEV mode is a real CIRCUIT authority with no branch policy or shared lock', () => {
  assert.equal(STADIUM_CIRCUIT_MODE.routeKind, 'CIRCUIT');
  assert.equal(STADIUM_CIRCUIT_MODE.routeAuthorityKind, 'CIRCUIT_LOOP');
  assert.equal(STADIUM_CIRCUIT_MODE.finishKind, 'LAPS');
  assert.equal(STADIUM_CIRCUIT_SESSION.rivalCount, 0);
  assert.equal(STADIUM_CIRCUIT_MODE.sharedRouteChoiceMode, 'INDEPENDENT');
  assert.equal(STADIUM_CIRCUIT_MODE.branchViolationPolicy, null);
});

test('DEV lap closes only by one explicit duplicate endpoint and unfolds into ordinary open runtime', () => {
  const live = createStadiumCircuitRuntime();
  const lap = live.window.topology.lapPath;
  const first = lap.vertices[0];
  const last = lap.vertices.at(-1);

  assert.deepEqual({ x: last.x, z: last.z }, { x: first.x, z: first.z });
  assert.equal(live.window.raster.segments.length, lap.segments.length * live.window.repeatCount);
  assert.ok(Math.abs(live.window.guide.length - live.window.length) < 1e-8);
});

test('ordinary car physics carries finite window chainage across an internal circuit seam', () => {
  const live = createStadiumCircuitRuntime();
  const { car, ticks, L } = driveAcrossFirstSeam(live);

  assert.ok(ticks < 120, 'ordinary physics should physically reach the next unfolded copy');
  assert.ok(car.course.s > L + 5, 'course.s must continue monotonically beyond the former lap endpoint');
  assert.ok(car.course.s < 2 * L, 'one seam crossing must not jump an extra lap copy');
  assert.ok(car.supported, 'the narrow seam probe should remain on the authored supported corridor');
  assert.ok(Math.abs(car.course.l) < 12);
});

test('existing open camera follows the same finite window ruler after the seam without wrap logic', () => {
  const live = createStadiumCircuitRuntime();
  const { car, L } = driveAcrossFirstSeam(live);
  const camera = updateCamera(
    createCameraRig(),
    { guide: live.window.guide, height: live.window.height },
    car,
    cameraProfile(),
    SIM_DT,
  );

  assert.ok(camera.s > L, 'camera chainage should remain in the second finite copy');
  assert.ok(Math.abs(car.course.s - camera.s - CURRENT_CAMERA_DISTANCE_METERS) < 1e-8);
});

test('unchanged renderer draws a normal frame after the live physics seam crossing', () => {
  const live = createStadiumCircuitRuntime();
  const { car, L } = driveAcrossFirstSeam(live);
  const camera = updateCamera(
    createCameraRig(),
    { guide: live.window.guide, height: live.window.height },
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
    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,
    shoulderWidth: 1,
  };
  const stats = renderDriving(
    surface,
    {
      background: createFarBackground(),
      guide: live.window.guide,
      camera,
      vehicle: car,
      terrainProfile: {
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
      groundProfile: ground,
      worldSprites: [],
      assets: createSpriteAssets(),
      playerKind: 'car',
    },
    {},
  );

  assert.ok(car.course.s > L);
  assert.ok(stats.terrainLineCount > 0);
  assert.equal(stats.activeSection, 'CIRCUIT STADIUM');
});

test('generic live compiler remains topology integration only and owns no browser/renderer/vehicle/RouteDag dependency', async () => {
  const source = await readFile(new URL('../src/runtime/circuit-live-runtime.ts', import.meta.url), 'utf8');
  const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

  assert.equal(
    importSpecifiers.some((path) => path.includes('/render/')),
    false,
  );
  assert.equal(
    importSpecifiers.some((path) => path.includes('/physics/')),
    false,
  );
  assert.equal(
    importSpecifiers.some((path) => path.includes('route-dag')),
    false,
  );
  assert.equal(
    importSpecifiers.some((path) => path.includes('main-circuit')),
    false,
  );
  assert.doesNotMatch(source, /\bdocument\b|\bglobalThis\.window\b/);
  assert.match(source, /raceAuthoring\.lapCount \+ 1/);
});

test('circuit browser composition uses existing open engine paths and contains no point-to-point route authority', async () => {
  const source = await readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8');
  const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

  assert.match(source, /advanceCircuitDrivingActor\(vehicleWorld, playerActor/);
  assert.match(source, /updateCamera\(cameraRig, \{ guide, height \}/);
  assert.match(source, /renderDriving\(/);
  assert.match(source, /advanceCircuitDrivingActor/);
  assert.equal(
    importSpecifiers.some((path) => /route-dag|live-route|shared-route-choice|branch-violation/.test(path)),
    false,
  );
});
