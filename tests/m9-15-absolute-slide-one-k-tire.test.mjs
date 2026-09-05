import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  browserTireEffectiveGrip,
  browserTireEffectiveSlideGrip,
  browserTirePeakSlipRatio,
} from '../dist/browser/tire-friction-selection.js';
import { evaluateTireForce } from '../dist/physics/tire-wheel.js';
import { FERRARI_TESTAROSSA_VEHICLE_PROFILE } from '../dist/physics/vehicle-profiles.js';
import { VEHICLE_GRAVITY } from '../dist/physics/vehicle-dynamics.js';

const tire = FERRARI_TESTAROSSA_VEHICLE_PROFILE.rearStation.tire;
const profile = FERRARI_TESTAROSSA_VEHICLE_PROFILE;
const normalLoad = profile.mass * VEHICLE_GRAVITY * profile.frontAxle / (profile.frontAxle + profile.rearAxle);
const rollingRadius = FERRARI_TESTAROSSA_VEHICLE_PROFILE.rearWheelRadius;
const longitudinalVelocity = 30;
const referenceSpeed = Math.sqrt(
  longitudinalVelocity ** 2 + tire.lowSpeedRegularization ** 2,
);

function forceAtNormalizedSlip(sx, sy) {
  const calibration = DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION;
  const omega = (longitudinalVelocity + sx * referenceSpeed) / rollingRadius;
  return evaluateTireForce(
    omega,
    rollingRadius,
    longitudinalVelocity,
    -sy * referenceSpeed,
    normalLoad,
    1,
    tire,
    calibration.referenceFrictionMultiplier,
    calibration.linearStiffnessMultiplier,
    calibration.slidingFrictionRatio,
  );
}

test('M9.19 default retains the M9.15 three-axis law with G1.20 P8 S1', () => {
  const calibration = DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION;
  assert.ok(Math.abs(browserTireEffectiveGrip(calibration) - 1.2) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(calibration) - 0.08) < 1e-12);
  assert.ok(Math.abs(browserTireEffectiveSlideGrip(calibration) - 1) < 1e-12);
  assert.ok(Math.abs(calibration.slidingFrictionRatio - 1 / 1.2) < 1e-12);
});

test('pure lateral peak occurs at P and absolute slide plateau occurs at 2P', () => {
  const peakSlip = browserTirePeakSlipRatio(DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION);
  const peak = forceAtNormalizedSlip(0, peakSlip);
  const midway = forceAtNormalizedSlip(0, peakSlip * 1.5);
  const plateau = forceAtNormalizedSlip(0, peakSlip * 2);
  const deep = forceAtNormalizedSlip(0, peakSlip * 4);

  assert.ok(Math.abs(Math.abs(peak.fy) / normalLoad - 1.2) < 1e-12);
  assert.ok(Math.abs(Math.abs(plateau.fy) / normalLoad - 1) < 1e-12);
  assert.ok(Math.abs(Math.abs(deep.fy) / normalLoad - 1) < 1e-12);
  assert.ok(Math.abs(Math.abs(midway.fy) / normalLoad - 1.1) < 1e-12);
});

test('deep combined slide keeps magnitude S while wheel speed rotates force from lateral to longitudinal', () => {
  const sy = 0.8;
  const samples = [0, 0.2, 0.4, 0.8, 1.6].map((sx) => ({
    sx,
    force: forceAtNormalizedSlip(sx, sy),
  }));

  for (const { sx, force } of samples) {
    assert.ok(Math.abs(Math.hypot(force.fx, force.fy) / normalLoad - 1) < 1e-12, `sx=${sx}`);
    if (sx === 0) {
      assert.ok(Math.abs(force.sx) < 1e-15);
      assert.ok(Math.abs(force.fx) / normalLoad < 1e-12);
    } else {
      assert.ok(Math.abs(force.fx / force.fy - force.dx / force.dy) < 1e-12, `sx=${sx}`);
    }
  }

  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1].force;
    const after = samples[index].force;
    assert.ok(Math.abs(after.fx) > Math.abs(before.fx));
    assert.ok(Math.abs(after.fy) < Math.abs(before.fy));
  }
});

test('M9.15 adds no tire memory drift mode or second force authority', async () => {
  const [tireSource, calibrationSource, selectionSource] = await Promise.all([
    readFile(new URL('../src/physics/tire-wheel.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/tire-friction-calibration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/tire-friction-selection.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(tireSource, /const width = peak;/);
  assert.match(selectionSource, /effectiveSlideGrip/);
  assert.match(selectionSource, /effectiveSlideGrip \/ effectivePeakGrip/);
  assert.match(calibrationSource, /slidingFrictionRatio/);
  for (const source of [tireSource, calibrationSource, selectionSource]) {
    assert.doesNotMatch(source, /relaxation|tireMemory|driftMode|driftAssist|targetSideslip/i);
  }
});
