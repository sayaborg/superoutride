import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER,
  M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER,
} from '../dist/browser/tire-friction-selection.js';
import {
  createArcadeTireFrictionCalibration,
  setArcadeVehicleTireFrictionCalibration,
} from '../dist/physics/tire-friction-calibration.js';
import {
  evaluateTireForce,
  lateralPostPeakScale,
  solveWheelOmega,
} from '../dist/physics/tire-wheel.js';
import {
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
} from '../dist/physics/vehicle-profiles.js';
import { VEHICLE_GRAVITY } from '../dist/physics/vehicle-dynamics.js';

const tire = FERRARI_TESTAROSSA_VEHICLE_PROFILE.frontStation.tire;
const profile = FERRARI_TESTAROSSA_VEHICLE_PROFILE;
const normalLoad = profile.mass * VEHICLE_GRAVITY * profile.rearAxle / (profile.frontAxle + profile.rearAxle);
const referenceCalibration = Object.freeze({
  referenceFrictionMultiplier: M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER,
  linearStiffnessMultiplier: M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER,
  slidingFrictionRatio: 1,
});

function forceAtSlipAngle(calibration, angleDegrees, wheelSlipSpeed = 0) {
  const longitudinalVelocity = 30;
  const referenceSpeed = Math.sqrt(
    longitudinalVelocity ** 2 + tire.lowSpeedRegularization ** 2,
  );
  const lateralVelocity = -referenceSpeed * Math.tan(angleDegrees * Math.PI / 180);
  const rollingRadius = 0.33;
  const omega = (longitudinalVelocity + wheelSlipSpeed) / rollingRadius;
  return evaluateTireForce(
    omega,
    rollingRadius,
    longitudinalVelocity,
    lateralVelocity,
    normalLoad,
    1,
    tire,
    calibration.referenceFrictionMultiplier,
    calibration.linearStiffnessMultiplier,
    calibration.slidingFrictionRatio,
  );
}

test('retained TIRE 2 peak is exactly 12 degrees before post-peak scaling', () => {
  const force = forceAtSlipAngle(referenceCalibration, 12);
  assert.ok(Math.abs(force.rho - 1.26) < 1e-12);
  assert.ok(Math.abs(Math.abs(force.fy) - force.fmax) < 1e-9);
});

test('M9.15 falls C1 from peak P to the selected sliding plateau at exactly 2P', () => {
  const peak = 2 - tire.rhoKnee;
  const width = peak;
  const plateau = peak + width;
  assert.equal(lateralPostPeakScale(peak, tire.rhoKnee, 0.70), 1);
  const midway = lateralPostPeakScale(peak + width * 0.5, tire.rhoKnee, 0.70);
  assert.ok(Math.abs(midway - 0.85) < 1e-12);
  assert.equal(lateralPostPeakScale(plateau, tire.rhoKnee, 0.70), 0.70);
  assert.equal(lateralPostPeakScale(plateau + 5, tire.rhoKnee, 0.70), 0.70);

  const epsilon = 1e-6;
  const leftPeakSlope = (
    lateralPostPeakScale(peak, tire.rhoKnee, 0.70)
    - lateralPostPeakScale(peak - epsilon, tire.rhoKnee, 0.70)
  ) / epsilon;
  const rightPeakSlope = (
    lateralPostPeakScale(peak + epsilon, tire.rhoKnee, 0.70)
    - lateralPostPeakScale(peak, tire.rhoKnee, 0.70)
  ) / epsilon;
  const leftPlateauSlope = (
    lateralPostPeakScale(plateau, tire.rhoKnee, 0.70)
    - lateralPostPeakScale(plateau - epsilon, tire.rhoKnee, 0.70)
  ) / epsilon;
  const rightPlateauSlope = (
    lateralPostPeakScale(plateau + epsilon, tire.rhoKnee, 0.70)
    - lateralPostPeakScale(plateau, tire.rhoKnee, 0.70)
  ) / epsilon;
  for (const slope of [leftPeakSlope, rightPeakSlope, leftPlateauSlope, rightPlateauSlope]) {
    assert.ok(Math.abs(slope) < 1e-5);
  }

  const pureLateralPeakSlip = Math.tan(12 * Math.PI / 180);
  const pureLateralPlateauSlip = Math.tan(24 * Math.PI / 180);
  assert.ok(Math.abs(pureLateralPlateauSlip / pureLateralPeakSlip - 2.095) < 0.01);
});

test('M9.15 broad falloff reaches the internal ratio while preserving vector direction', () => {
  const deep100 = forceAtSlipAngle(referenceCalibration, 30);
  for (const ratio of [0.90, 0.70, 0.50, 1 / 3]) {
    const deep = forceAtSlipAngle({ ...referenceCalibration, slidingFrictionRatio: ratio }, 30);
    assert.ok(Math.abs(Math.abs(deep.fy) / Math.abs(deep100.fy) - ratio) < 1e-12);
    assert.ok(Math.abs(deep.fx) < 1e-12);
  }
});

test('lateral post-peak scale leaves pure longitudinal tire behavior unchanged', () => {
  const forces = [1, 0.9, 0.7, 1 / 3].map((slidingFrictionRatio) => (
    forceAtSlipAngle({ ...referenceCalibration, slidingFrictionRatio }, 0, 25)
  ));
  const reference = forces[0];
  assert.ok(Math.abs(reference.fx) > 0);
  for (const force of forces.slice(1)) {
    assert.ok(Math.abs(force.fx - reference.fx) < 1e-9);
    assert.ok(Math.abs(force.fy) < 1e-12);
  }
});

test('M9.15 slide ratio remains compatible with the unique scalar implicit wheel solve', () => {
  for (const slidingFrictionRatio of [1 / 3, 0.50, 0.70, 1]) {
    const input = {
      omegaPrevious: 125,
      inertia: 3.4,
      rollingRadius: 0.331,
      longitudinalVelocity: 30,
      lateralVelocity: -22,
      normalLoad,
      gripFactor: 1,
      referenceFrictionMultiplier: referenceCalibration.referenceFrictionMultiplier,
      linearStiffnessMultiplier: referenceCalibration.linearStiffnessMultiplier,
      slidingFrictionRatio,
      rollingResistance: 0,
      driveTorque: 2200,
      brakeTorque: 0,
      dt: 1 / 720,
      tire,
    };
    const a = solveWheelOmega(input);
    const b = solveWheelOmega(input);
    for (const value of [a.omega, a.omegaDot, a.tire.fx, a.tire.fy, a.tire.rho]) {
      assert.ok(Number.isFinite(value));
    }
    assert.deepEqual(a, b);
  }
});

test('calibration remains atomic and rejects invalid sliding ratios without partial mutation', () => {
  const owner = {
    tireFrictionCalibration: createArcadeTireFrictionCalibration({
      ...referenceCalibration,
      slidingFrictionRatio: 0.80,
    }),
  };
  const before = { ...owner.tireFrictionCalibration };
  for (const invalid of [0, -0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleTireFrictionCalibration(owner, {
        ...owner.tireFrictionCalibration,
        slidingFrictionRatio: invalid,
      }),
      /sliding-friction ratio/,
    );
    assert.deepEqual(owner.tireFrictionCalibration, before);
  }
});

test('M9.15 post-peak law remains constitutive tire behavior not a drift or vehicle mode', async () => {
  const [tireSource, solverSource, calibrationSource, selectionSource] = await Promise.all([
    readFile(new URL('../src/physics/tire-wheel.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/tire-friction-calibration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/tire-friction-selection.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(tireSource, /Math\.abs\(demand\.dy\) \/ fmax/);
  assert.match(tireSource, /const width = peak;/);
  assert.match(tireSource, /lateralPostPeakScale/);
  assert.match(solverSource, /vehicle\.tireFrictionCalibration\.slidingFrictionRatio/);
  assert.match(selectionSource, /slideToPeakRatio/);
  for (const source of [tireSource, solverSource, calibrationSource, selectionSource]) {
    assert.doesNotMatch(source, /driftMode|driftAssist|targetSideslip/);
  }
  for (const source of [tireSource, calibrationSource, selectionSource]) {
    assert.doesNotMatch(source, /profile\.id|frontDriveTorqueFraction/);
  }
  assert.doesNotMatch(solverSource, /if\s*\([^)]*frontDriveTorqueFraction/);
  assert.doesNotMatch(tireSource, /yawRate|betaTravel|bodyTravelDirection/);
});
