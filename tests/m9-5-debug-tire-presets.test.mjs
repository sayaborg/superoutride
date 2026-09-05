import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER,
  M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER,
  browserTireCalibrationForGrip,
  browserTireCalibrationForSlide,
  browserTireEffectiveGrip,
  browserTireEffectiveSlideGrip,
  browserTirePeakSlipRatio,
} from '../dist/browser/tire-friction-selection.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { createArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import {
  createArcadeTireFrictionCalibration,
  setArcadeVehicleTireFrictionCalibration,
} from '../dist/physics/tire-friction-calibration.js';
import {
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE,
} from '../dist/physics/vehicle-profiles.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const highway = createM72DefaultBranchingParent();
const height = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);
const surface = new SurfaceMap(highway.guide.length, [{
  sStart: 0,
  name: 'RETAINED TIRE CALIBRATION TEST',
  bands: [{ lMin: -100, lMax: 100, type: 'ASPHALT' }],
}]);

test('M9.10 historical TIRE 2 anchors remain exact beneath the M9.19 diagnostic default', () => {
  assert.ok(Math.abs(M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER - 10.3 / 9.75) < 1e-15);
  assert.ok(Math.abs(
    M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER
      - (10.3 * Math.tan(12 * Math.PI / 180) / 1.26) / 1.35,
  ) < 1e-15);
  assert.ok(Math.abs(browserTireEffectiveGrip(DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION) - 1.2) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION) - 0.08) < 1e-12);
  assert.ok(Math.abs(browserTireEffectiveSlideGrip(DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION) - 1.0) < 1e-12);
  assert.ok(Math.abs(DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION.slidingFrictionRatio - 1 / 1.2) < 1e-12);
});

test('vehicle-owned tire calibration remains atomic and survives recovery and profile reconstruction', () => {
  const vehicle = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    800,
    0,
    25,
    {},
    browserTireCalibrationForSlide('1.40',
      browserTireCalibrationForGrip('2.00', DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION)),
  );
  const selected = { ...vehicle.tireFrictionCalibration };
  assert.ok(Math.abs(browserTireEffectiveSlideGrip(selected) - 1.40) < 1e-12);
  const recovery = createM5RecoveryState(vehicle);
  recoverM5Vehicle(recovery, highway.guide, height, surface, vehicle);
  assert.deepEqual(vehicle.tireFrictionCalibration, selected);

  const replacement = createArcadeVehicle(
    PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    vehicle.course.s,
    vehicle.course.l,
    vehicle.longitudinalSpeed,
    vehicle.steeringCalibration,
    vehicle.tireFrictionCalibration,
  );
  assert.deepEqual(replacement.tireFrictionCalibration, selected);
  assert.notEqual(replacement.tireFrictionCalibration, vehicle.tireFrictionCalibration);

  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleTireFrictionCalibration(vehicle, {
        ...selected,
        linearStiffnessMultiplier: invalid,
      }),
      /finite and > 0/,
    );
    assert.deepEqual(vehicle.tireFrictionCalibration, selected);
    assert.throws(
      () => setArcadeVehicleTireFrictionCalibration(vehicle, {
        ...selected,
        referenceFrictionMultiplier: invalid,
      }),
      /finite and > 0/,
    );
    assert.deepEqual(vehicle.tireFrictionCalibration, selected);
  }

  assert.deepEqual(createArcadeTireFrictionCalibration(), {
    referenceFrictionMultiplier: 1,
    linearStiffnessMultiplier: 1,
    slidingFrictionRatio: 1,
  });
});

test('retained tire calibration remains one vehicle-owned state consumed only by common tire mechanics', async () => {
  const [solver, tire, calibration, selection, controls, surfaceSource, linear, branching, circuit] =
    await Promise.all([
      readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/physics/tire-wheel.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/physics/tire-friction-calibration.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/browser/tire-friction-selection.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/browser/tire-friction-controls.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/physics/surface-map.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
    ]);
  assert.match(tire, /tire\.normalizedStiffness \* Math\.max\(0, normalLoad\) \* linearStiffnessMultiplier/);
  assert.match(tire, /tire\.muRef\s*\n\s*\* referenceFrictionMultiplier/);
  assert.match(tire, /slidingFrictionRatio/);
  assert.match(solver, /vehicle\.tireFrictionCalibration\.linearStiffnessMultiplier/);
  assert.match(solver, /vehicle\.tireFrictionCalibration\.referenceFrictionMultiplier/);
  assert.match(solver, /vehicle\.tireFrictionCalibration\.slidingFrictionRatio/);
  assert.doesNotMatch(calibration, /profile\.id|routeKind|camera|surface/);
  assert.doesNotMatch(selection, /vehicle\.yaw|yawRate|routeKind|camera|SurfaceMap/);
  assert.match(selection, /browserTireEffectiveSlideGrip/);
  assert.match(selection, /slideToPeakRatio/);
  assert.match(controls, /setArcadeVehicleTireFrictionCalibration/);
  assert.doesNotMatch(surfaceSource, /linearStiffnessMultiplier|referenceFrictionMultiplier|slidingFrictionRatio|KeyG/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION/);
    assert.match(source, /mountBrowserTireFrictionControls/);
    assert.match(source, /tireFrictionControls\.handleKey/);
    assert.match(source, /const tireFrictionCalibration = vehicle\.tireFrictionCalibration/);
    assert.doesNotMatch(source, /setArcadeVehicleTireFrictionCalibration/);
  }
});
