import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BROWSER_COURSE_MODES,
  browserCourseModeForKey,
  selectBrowserCourseMode,
} from '../dist/browser/course-mode-selection.js';
import {
  BROWSER_VEHICLE_PROFILES,
  browserVehicleProfileForKey,
  formatVehicleProfileSelector,
} from '../dist/browser/vehicle-profile-selection.js';
import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { CURRENT_M5_CAMERA_PROFILE } from '../dist/camera/current-camera-profile.js';
import { guideCoordinateCurve } from '../dist/core/guide-coordinate-frame.js';
import {
  M7_2_DEFAULT_BRANCHING_FORK,
  M7_2_DEFAULT_BRANCHING_JUNCTION,
  createM72DefaultBranchingParent,
} from '../dist/dev/m7-2-default-branching-highway.js';
import {
  M8_3_LINEAR_COURSE_MODE,
  M8_3_LINEAR_LENGTH_METERS,
  createM83LinearHighwayRuntime,
} from '../dist/dev/m8-3-linear-highway.js';
import { M8_3_BRANCHING_COURSE_MODE } from '../dist/dev/m8-3-course-debug-mode.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import {
  createM5RecoveryState,
  updateM5Recovery,
} from '../dist/gameplay/recovery.js';
import { pendingRouteStageRecoveryTarget } from '../dist/gameplay/route-stage-handoff.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import {
  AWD_VEHICLE_PROFILE,
  BIKE1_VEHICLE_PROFILE,
  BIKE2_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  MR_VEHICLE_PROFILE,
  RR_VEHICLE_PROFILE,
  createTestBike,
  createTestCar,
  updateTestVehicle,
} from './helpers/vehicle-fixture.mjs';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { setArcadeVehicleTravelDirectionSteeringGain } from '../dist/physics/vehicle-calibration.js';
import {
  HUD_INPUT_ACCEL_COLOR,
  HUD_INPUT_BRAKE_COLOR,
  createVehicleDebugHudModel,
  drawVehicleDebugHud,
  drawTopDownGSensor,
  drawVehicleControlGraphics,
  gSensorPoint,
} from '../dist/browser/vehicle-debug-hud.js';
import {
  advanceLiveRouteTraveler,
  createLiveRouteTravelerState,
  resyncLiveRouteTraveler,
  resolveLiveRouteTravelerRuntime,
} from '../dist/runtime/live-route-traveler.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';

const DT = 1 / 60;
const CAMERA_PROFILE = CURRENT_M5_CAMERA_PROFILE;

test('browser course selector maps 1/2/3 and URL modes from one authority', () => {
  assert.deepEqual(
    BROWSER_COURSE_MODES.map(({ digitCode, query, routeKind, entryName }) => ({
      digitCode,
      query,
      routeKind,
      entryName,
    })),
    [
      { digitCode: 'Digit1', query: 'linear', routeKind: 'LINEAR', entryName: 'main-linear.js' },
      { digitCode: 'Digit2', query: 'branching', routeKind: 'BRANCHING', entryName: 'main.js' },
      { digitCode: 'Digit3', query: 'circuit', routeKind: 'CIRCUIT', entryName: 'main-circuit.js' },
    ],
  );
  assert.equal(browserCourseModeForKey('Digit1')?.routeKind, 'LINEAR');
  assert.equal(browserCourseModeForKey('Numpad2')?.routeKind, 'BRANCHING');
  assert.equal(browserCourseModeForKey('Digit3')?.routeKind, 'CIRCUIT');
  assert.equal(browserCourseModeForKey('KeyV'), null);
  assert.equal(selectBrowserCourseMode(null).routeKind, 'BRANCHING');
  assert.equal(selectBrowserCourseMode('unknown').routeKind, 'BRANCHING');
  assert.equal(M8_3_BRANCHING_COURSE_MODE.rivalCount, 0);
  assert.equal(M8_3_BRANCHING_COURSE_MODE.sharedRouteChoiceMode, 'FIRST_PHYSICAL_CROSSING_LOCKS');
});

test('browser vehicle selector maps Q/W/E/R/A/S to FR/MR/RR/AWD/Bike1/Bike2', () => {
  assert.deepEqual(
    BROWSER_VEHICLE_PROFILES.map(({ code, profile }) => [code, profile.id]),
    [
      ['KeyQ', 'FR'],
      ['KeyW', 'MR'],
      ['KeyE', 'RR'],
      ['KeyR', 'AWD'],
      ['KeyA', 'BIKE1'],
      ['KeyS', 'BIKE2'],
    ],
  );
  assert.equal(browserVehicleProfileForKey('KeyQ'), FR_VEHICLE_PROFILE);
  assert.equal(browserVehicleProfileForKey('KeyW'), MR_VEHICLE_PROFILE);
  assert.equal(browserVehicleProfileForKey('KeyE'), RR_VEHICLE_PROFILE);
  assert.equal(browserVehicleProfileForKey('KeyR'), AWD_VEHICLE_PROFILE);
  assert.equal(browserVehicleProfileForKey('KeyA'), BIKE1_VEHICLE_PROFILE);
  assert.equal(browserVehicleProfileForKey('KeyS'), BIKE2_VEHICLE_PROFILE);
  assert.equal(browserVehicleProfileForKey('KeyV'), null);
  assert.equal(
    formatVehicleProfileSelector('MR'),
    '[Q]FR [W]MR* [E]RR [R]AWD [A]BIKE1 [S]BIKE2',
  );
});

test('six profiles share one two-station mechanics contract', () => {
  const profiles = [
    FR_VEHICLE_PROFILE,
    MR_VEHICLE_PROFILE,
    RR_VEHICLE_PROFILE,
    AWD_VEHICLE_PROFILE,
    BIKE1_VEHICLE_PROFILE,
    BIKE2_VEHICLE_PROFILE,
  ];
  assert.deepEqual(
    profiles.map((profile) => profile.id),
    ['FR', 'MR', 'RR', 'AWD', 'BIKE1', 'BIKE2'],
  );
  for (const profile of profiles) {
    assert.deepEqual([profile.frontStation.id, profile.rearStation.id], ['FRONT', 'REAR']);
    assert.equal(profile.actuator, FR_VEHICLE_PROFILE.actuator);
    assert.equal(profile.steeringRatio, 18);
  }
});

test('car profiles share one engine tire and chassis package except distribution inertia and AWD drive split', () => {
  const carProfiles = [
    FR_VEHICLE_PROFILE,
    MR_VEHICLE_PROFILE,
    RR_VEHICLE_PROFILE,
    AWD_VEHICLE_PROFILE,
  ];
  const sharedCarPackage = (profile) => {
    const {
      id: _id,
      yawInertia: _yawInertia,
      pitchInertia: _pitchInertia,
      frontAxle: _frontAxle,
      rearAxle: _rearAxle,
      frontDriveTorqueFraction: _frontDriveTorqueFraction,
      frontStation: _frontStation,
      rearStation: _rearStation,
      ...shared
    } = profile;
    return shared;
  };
  for (const profile of carProfiles.slice(1)) {
    assert.deepEqual(sharedCarPackage(profile), sharedCarPackage(FR_VEHICLE_PROFILE));
  }
  assert.deepEqual(
    carProfiles.map((profile) => profile.frontDriveTorqueFraction),
    [0, 0, 0, 0.5],
  );
  assert.equal(AWD_VEHICLE_PROFILE.frontAxle, FR_VEHICLE_PROFILE.frontAxle);
  assert.equal(AWD_VEHICLE_PROFILE.rearAxle, FR_VEHICLE_PROFILE.rearAxle);
  assert.equal(AWD_VEHICLE_PROFILE.yawInertia, FR_VEHICLE_PROFILE.yawInertia);
  assert.equal(AWD_VEHICLE_PROFILE.pitchInertia, FR_VEHICLE_PROFILE.pitchInertia);

  const rearLoadShare = (profile) => profile.frontAxle / (profile.frontAxle + profile.rearAxle);
  assert.ok(rearLoadShare(FR_VEHICLE_PROFILE) < 0.5);
  assert.ok(rearLoadShare(MR_VEHICLE_PROFILE) > 0.5);
  assert.ok(rearLoadShare(RR_VEHICLE_PROFILE) > rearLoadShare(MR_VEHICLE_PROFILE));
});

test('LINEAR debug course is one finite ordinary open 8 km highway and renders normally', () => {
  const runtime = createM83LinearHighwayRuntime();
  assert.equal(M8_3_LINEAR_COURSE_MODE.routeKind, 'LINEAR');
  assert.equal(M8_3_LINEAR_COURSE_MODE.rivalCount, 0);
  assert.equal(runtime.guide.length, M8_3_LINEAR_LENGTH_METERS);
  assert.equal(runtime.guide.segments.length, 1);
  const car = createTestCar(runtime.guide, runtime.heightProfile, runtime.surfaceMap, 45);
  const camera = updateM5Camera(
    createM5CameraRig(),
    runtime.guide,
    runtime.heightProfile,
    car,
    CAMERA_PROFILE,
    DT,
  );
  const result = renderM5Driving(
    new SoftwareSurface(320, 240, new Uint32Array(320 * 240)),
    createM3FarBackground(),
    runtime.guide,
    camera,
    car,
    runtime.terrainProfile,
    runtime.groundProfile,
    [],
    createM4SpriteAssets(),
    'car',
  );
  assert.ok(result.terrainLineCount > 0);
  assert.equal(camera.playerScreenX, 160);
});

test('all six vehicle profiles integrate ordinarily on the finite LINEAR course', () => {
  const runtime = createM83LinearHighwayRuntime();
  for (const profile of [
    FR_VEHICLE_PROFILE,
    MR_VEHICLE_PROFILE,
    RR_VEHICLE_PROFILE,
    AWD_VEHICLE_PROFILE,
    BIKE1_VEHICLE_PROFILE,
    BIKE2_VEHICLE_PROFILE,
  ]) {
    const vehicle = profile.id.startsWith('BIKE')
      ? createTestBike(runtime.guide, runtime.heightProfile, runtime.surfaceMap, 45, 0, 20, profile)
      : createTestCar(runtime.guide, runtime.heightProfile, runtime.surfaceMap, 45, 0, 20, profile);
    for (let tick = 0; tick < 600; tick += 1) {
      updateTestVehicle(
        runtime.guide,
        runtime.heightProfile,
        runtime.surfaceMap,
        vehicle,
        sampleRivalDrivingInput(runtime.guide, vehicle, 0),
        DT,
      );
    }
    assert.ok(vehicle.course.s > 300, `${profile.id} stalled at s=${vehicle.course.s}`);
    assert.ok(Math.abs(vehicle.course.l) < 4.5, `${profile.id} left LINEAR asphalt`);
  }
});

test('shared HUD exposes numeric request actual actuator and HUD-only 18:1 handwheel observations', () => {
  const runtime = createM83LinearHighwayRuntime();
  const vehicle = createTestCar(runtime.guide, runtime.heightProfile, runtime.surfaceMap, 45);
  setArcadeVehicleTravelDirectionSteeringGain(vehicle, 0.4);
  vehicle.control.actualSteerAngle = -12.5 * Math.PI / 180;
  vehicle.control.handwheelAngle = vehicle.control.actualSteerAngle * vehicle.profile.steeringRatio;
  vehicle.control.throttleActuator = 0.42;
  vehicle.control.brakeActuator = 0.08;
  vehicle.longitudinalAcceleration = 9.80665;
  vehicle.lateralAcceleration = -4.903325;
  const model = createVehicleDebugHudModel(
    'LINEAR',
    { steering: -1, throttle: true, brake: false },
    vehicle,
  );
  assert.match(model.courseSelector, /\[1\] LINEAR/);
  assert.match(model.vehicleSelector, /\[Q\]FR\*/);
  assert.match(model.selfSteerSelector, /\[6\]0\.4\*/);
  assert.equal(model.yawPreviewSelector, 'YAW [Y] 0.12s');
  assert.equal(model.steeringResponseSelector, 'ACT [T] 0.375s');
  assert.equal(model.tireFrictionSelector, 'TIRE [G] 1');
  assert.equal(model.requestedSteering, -1);
  assert.equal(model.requestedThrottle, 1);
  assert.equal(model.requestedBrake, 0);
  assert.ok(Math.abs(model.actualSteering + 12.5 / 31) < 1e-12);
  assert.equal(model.actualThrottle, 0.42);
  assert.equal(model.actualBrake, 0.08);
  assert.ok(Math.abs(model.handwheelAngle + 225 * Math.PI / 180) < 1e-12);
  assert.ok(Math.abs(model.longitudinalG - 1) < 1e-12);
  assert.ok(Math.abs(model.lateralG + 0.5) < 1e-12);
});

test('shared HUD leaves the driving view transparent behind outlined text and control graphics', () => {
  const runtime = createM83LinearHighwayRuntime();
  const vehicle = createTestCar(runtime.guide, runtime.heightProfile, runtime.surfaceMap, 45);
  const rectangles = [];
  const outlinedText = [];
  const context = {
    save() {},
    restore() {},
    font: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: '',
    fillText() {},
    strokeText: (text) => outlinedText.push(text),
    fillRect: (x, y, width, height) => rectangles.push({ x, y, width, height }),
    strokeRect() {},
    beginPath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
  };

  drawVehicleDebugHud(
    context,
    'LINEAR',
    { steering: 0, throttle: false, brake: false },
    vehicle,
  );

  assert.equal(outlinedText.length, 13);
  assert.equal(
    rectangles.some(({ width, height }) => width > 60 || height > 10),
    false,
    'HUD must not paint an opaque full text/control panel over the driving view',
  );
});

test('G sensor draws only one cross and one dot in the felt inertial-load direction', () => {
  const point = gSensorPoint({ longitudinalG: 1, lateralG: 0.5 }, 100, 80, 20);
  assert.deepEqual(point, { x: 95, y: 90 });

  const operations = [];
  const context = {
    beginPath: () => operations.push('beginPath'),
    moveTo: () => operations.push('moveTo'),
    lineTo: () => operations.push('lineTo'),
    stroke: () => operations.push('stroke'),
    arc: () => operations.push('arc'),
    fill: () => operations.push('fill'),
  };
  drawTopDownGSensor(context, { longitudinalG: 1, lateralG: 0.5 }, 100, 80);
  assert.equal(operations.filter((operation) => operation === 'moveTo').length, 2);
  assert.equal(operations.filter((operation) => operation === 'lineTo').length, 2);
  assert.equal(operations.filter((operation) => operation === 'arc').length, 1);
  assert.equal(operations.filter((operation) => operation === 'stroke').length, 1);
  assert.equal(operations.filter((operation) => operation === 'fill').length, 1);
});

test('pedal input graphics show exactly blue accel red brake or no active color', () => {
  const fillColors = (requestedThrottle, requestedBrake) => {
    const colors = [];
    let fillStyle = '';
    const context = {
      get fillStyle() { return fillStyle; },
      set fillStyle(value) { fillStyle = value; },
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: '',
      fillRect: () => colors.push(fillStyle),
      strokeRect() {},
      fillText() {},
      strokeText() {},
      beginPath() {},
      arc() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
    };
    drawVehicleControlGraphics(context, {
      requestedSteering: 0,
      requestedThrottle,
      requestedBrake,
      actualSteering: 0,
      actualThrottle: 0,
      actualBrake: 0,
      handwheelAngle: 0,
    }, 0, 0);
    return colors;
  };

  const accel = fillColors(1, 0);
  assert.equal(accel.includes(HUD_INPUT_ACCEL_COLOR), true);
  assert.equal(accel.includes(HUD_INPUT_BRAKE_COLOR), false);
  const brake = fillColors(0, 1);
  assert.equal(brake.includes(HUD_INPUT_ACCEL_COLOR), false);
  assert.equal(brake.includes(HUD_INPUT_BRAKE_COLOR), true);
  const neutral = fillColors(0, 0);
  assert.equal(neutral.includes(HUD_INPUT_ACCEL_COLOR), false);
  assert.equal(neutral.includes(HUD_INPUT_BRAKE_COLOR), false);
  assert.throws(() => fillColors(1, 1), /mutually exclusive/);
});

for (const [profile, createVehicle, presentationKind] of [
  [FR_VEHICLE_PROFILE, createTestCar, 'car'],
  [BIKE1_VEHICLE_PROFILE, createTestBike, 'bike'],
]) {
  for (const side of ['LEFT', 'RIGHT']) {
    test(`${profile.id} commits the current M7.2 ${side} fork and keeps physics/rendering alive`, () => {
    const parent = createM72DefaultBranchingParent();
    const assets = createM4SpriteAssets();
    const live = createM627LiveRouteRuntime(
      parent.guide,
      {
        heightProfile: parent.heightProfile,
        surfaceMap: parent.surfaceMap,
        terrainProfile: parent.terrainProfile,
        groundProfile: parent.groundProfile,
        selectFarBackground: () => createM3FarBackground(),
        worldSprites: [],
      },
      assets,
      M7_2_DEFAULT_BRANCHING_FORK,
    );
    const car = createVehicle(
      parent.guide,
      parent.heightProfile,
      parent.surfaceMap,
      M7_2_DEFAULT_BRANCHING_FORK.junction.authoring.sWidenStart - 120,
    );
    const traveler = createLiveRouteTravelerState(live, { x: car.x, z: car.z });
    const recovery = createM5RecoveryState(car);
    const cameraRig = createM5CameraRig();
    const targetL = M7_2_DEFAULT_BRANCHING_JUNCTION.separatedChildCenterL(side);
    let committed = false;
    let renderedAfterCommit = 0;
    let minSpeedAfterCommit = Infinity;

    for (let tick = 0; tick < 1_800; tick += 1) {
      const runtimeBefore = resolveLiveRouteTravelerRuntime(live, traveler);
      const desiredL = runtimeBefore.packageId === 'CONTENT_STAGE_1' ? targetL : 0;
      const input = sampleRivalDrivingInput(
        guideCoordinateCurve(runtimeBefore.coordinateFrame),
        car,
        desiredL,
      );
      updateTestVehicle(
        runtimeBefore.coordinateFrame,
        runtimeBefore.heightProfile,
        runtimeBefore.surfaceMap,
        car,
        input,
        DT,
      );
      const recovered = updateM5Recovery(
        recovery,
        runtimeBefore.coordinateFrame,
        runtimeBefore.heightProfile,
        runtimeBefore.surfaceMap,
        car,
        DT,
        undefined,
        pendingRouteStageRecoveryTarget(traveler.handoffState, 8),
      );
      const world = { x: car.x, z: car.z };
      if (recovered !== null) {
        resyncLiveRouteTraveler(live, traveler, world);
        continue;
      }
      const routeUpdate = advanceLiveRouteTraveler(live, traveler, world);
      if (routeUpdate.committed) {
        car.course = { ...traveler.handoffState.coordinate };
        committed = true;
      }

      const runtimeAfter = resolveLiveRouteTravelerRuntime(live, traveler);
      const camera = updateM5Camera(
        cameraRig,
        runtimeAfter.coordinateFrame,
        runtimeAfter.heightProfile,
        car,
        CAMERA_PROFILE,
        DT,
      );
      if (committed) {
        minSpeedAfterCommit = Math.min(minSpeedAfterCommit, car.speed);
        renderM5Driving(
          new SoftwareSurface(320, 240, new Uint32Array(320 * 240)),
          runtimeAfter.selectFarBackground(camera.s),
          guideCoordinateCurve(runtimeAfter.coordinateFrame),
          camera,
          car,
          runtimeAfter.terrainProfile,
          runtimeAfter.groundProfile,
          runtimeAfter.worldSprites,
          assets,
          presentationKind,
          runtimeAfter.roadView ?? undefined,
        );
        renderedAfterCommit += 1;
      }
      if (committed && car.course.s > 120 && renderedAfterCommit >= 30) break;
    }

    assert.equal(committed, true);
    assert.ok(renderedAfterCommit >= 30);
    assert.ok(car.course.s > 120);
    assert.ok(minSpeedAfterCommit > 8, `post-COMMIT speed fell to ${minSpeedAfterCommit}`);
    });
  }
}

test('boot and every course root keep route selection at the composition boundary', async () => {
  const [boot, linear, branching, circuit] = await Promise.all([
    readFile(new URL('../src/boot.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(boot, /selectBrowserCourseMode/);
  assert.match(boot, /browserCourseModeForKey/);
  assert.match(boot, /location\.assign/);
  assert.doesNotMatch(linear, /RouteDag|CircuitTopology|routeKind\s*===/);
  assert.doesNotMatch(branching, /routeKind\s*===/);
  assert.doesNotMatch(circuit, /routeKind\s*===/);
});
