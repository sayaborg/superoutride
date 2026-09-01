import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectCurrentSteeringAssistEnvelope,
  collectSteeringAuthoritySweeps,
  collectSteeringSelectorCrossProduct,
  runDeepSideslipEscapeProbe,
  runDeepSlideRecoveryProbe,
  runSteadyFullInputProbe,
} from '../tools/probe-steering-assist.mjs';
import {
  AWD_VEHICLE_PROFILE,
  BIKE1_VEHICLE_PROFILE,
  BIKE2_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  MR_VEHICLE_PROFILE,
  RR_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
} from '../dist/physics/vehicle-profiles.js';

const profiles = [
  FR_VEHICLE_PROFILE,
  MR_VEHICLE_PROFILE,
  RR_VEHICLE_PROFILE,
  AWD_VEHICLE_PROFILE,
  BIKE1_VEHICLE_PROFILE,
  BIKE2_VEHICLE_PROFILE,
];

function findCase(envelope, expected) {
  return envelope.find((entry) => Object.entries(expected).every(
    ([key, value]) => entry[key] === value,
  ));
}

test('zero-DC steering probe covers duration speed drive and every common profile deterministically', () => {
  const first = collectCurrentSteeringAssistEnvelope();
  const second = collectCurrentSteeringAssistEnvelope();
  assert.deepEqual(second, first);
  assert.equal(first.length, 28);
  assert.deepEqual(
    [...new Set(first.map((entry) => entry.profile))].sort(),
    ['AWD', 'BIKE1', 'BIKE2', 'FR', 'MR', 'RR'],
  );
  assert.deepEqual(
    [...new Set(first.filter((entry) => entry.profile === 'FR').map(
      (entry) => entry.speedMetersPerSecond,
    ))].sort((a, b) => a - b),
    [15, 25, 35],
  );
  assert.deepEqual(
    [...new Set(first.filter((entry) => entry.profile === 'FR').map(
      (entry) => entry.pressSeconds,
    ))].sort((a, b) => a - b),
    [0.1, 0.35, 0.6],
  );
  for (const entry of first) {
    assert.equal(entry.yawTransientGain, 0.18);
    assert.equal(entry.yawWashoutTime, 0.35);
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${entry.profile} ${key}`);
    }
  }
});

test('current FR default preserves transient damping without the old absolute-yaw penalty', () => {
  const envelope = collectCurrentSteeringAssistEnvelope();
  const coast = findCase(envelope, {
    profile: 'FR',
    speedMetersPerSecond: 25,
    pressSeconds: 0.35,
    driven: false,
  });
  const driven = findCase(collectCurrentSteeringAssistEnvelope(), {
    profile: 'FR',
    speedMetersPerSecond: 25,
    pressSeconds: 0.35,
    driven: true,
  });
  assert.ok(coast);
  assert.ok(driven);
  assert.equal(coast.oppositePeakComponentsDegrees.residualDriverOffset, 0);
  assert.ok(coast.peakOppositeRoadWheelDegrees < 3);
  assert.ok(coast.peakReverseYawRateDegreesPerSecond < 3);
  assert.ok(coast.settleSeconds <= 0.8);
  assert.ok(coast.maxFrontUtilization < 1);
  assert.ok(coast.maxRearUtilization < 1);
  assert.ok(driven.peakReverseYawRateDegreesPerSecond > coast.peakReverseYawRateDegreesPerSecond);

  for (const speedMetersPerSecond of [25, 35]) {
    for (const pressSeconds of [0.35, 0.6]) {
      const transient = findCase(envelope, {
        profile: 'FR',
        speedMetersPerSecond,
        pressSeconds,
        driven: false,
      });
      assert.ok(transient, `${speedMetersPerSecond} m/s ${pressSeconds} s`);
      assert.ok(transient.peakReverseYawRateDegreesPerSecond <= 12, JSON.stringify(transient));
      assert.ok(transient.peakOppositeRoadWheelDegrees <= 8, JSON.stringify(transient));
      assert.ok(transient.settleSeconds <= 1.2, JSON.stringify(transient));
    }
  }
});

test('yaw transient and washout selectors vary only their independent adjustable terms', () => {
  const sweeps = collectSteeringAuthoritySweeps();
  assert.deepEqual(
    sweeps.yawTransient.map((entry) => entry.yawTransientGain),
    [0, 0.06, 0.12, 0.18, 0.24, 0.3],
  );
  assert.deepEqual(
    sweeps.yawWashout.map((entry) => entry.yawWashoutTime),
    [0.2, 0.35, 0.5, 0.65],
  );
  for (const { yawTransientGain, result } of sweeps.yawTransient) {
    assert.equal(result.yawTransientGain, yawTransientGain);
    assert.equal(result.yawWashoutTime, 0.35);
  }
  for (const { yawWashoutTime, result } of sweeps.yawWashout) {
    assert.equal(result.yawTransientGain, 0.18);
    assert.equal(result.yawWashoutTime, yawWashoutTime);
  }

  const noTransient = sweeps.yawTransient.find(({ yawTransientGain }) => yawTransientGain === 0).result;
  const defaultTransient = sweeps.yawTransient.find(
    ({ yawTransientGain }) => yawTransientGain === 0.18,
  ).result;
  assert.ok(
    noTransient.peakReverseYawRateDegreesPerSecond
      > defaultTransient.peakReverseYawRateDegreesPerSecond * 5,
  );
  assert.ok(noTransient.settleSeconds > defaultTransient.settleSeconds * 1.5);

  const defaultWashout = sweeps.yawWashout.find(({ yawWashoutTime }) => yawWashoutTime === 0.35).result;
  for (const { yawWashoutTime, result } of sweeps.yawWashout) {
    if (yawWashoutTime !== 0.35) {
      assert.notEqual(
        result.peakReverseYawRateDegreesPerSecond,
        defaultWashout.peakReverseYawRateDegreesPerSecond,
      );
    }
  }
});

test('steering-response sweep keeps apply and release symmetric for every selector value', () => {
  const { actuatorResponse } = collectSteeringAuthoritySweeps();
  assert.deepEqual(
    actuatorResponse.map(({ traversalSeconds }) => traversalSeconds),
    [0.25, 0.375, 0.5, 0.625],
  );
  for (const { steeringActuatorRate, result } of actuatorResponse) {
    assert.deepEqual(result.steeringActuatorResponse, {
      applyRate: steeringActuatorRate,
      releaseRate: steeringActuatorRate,
    });
  }
});

test('every steering selector cross-product is finite and deterministically replayable', () => {
  const first = collectSteeringSelectorCrossProduct();
  const second = collectSteeringSelectorCrossProduct();
  assert.equal(first.length, 6 * 4 * 4);
  assert.deepEqual(second, first);
  for (const entry of first) {
    assert.equal(entry.result.yawTransientGain, entry.yawTransientGain);
    assert.equal(entry.result.yawWashoutTime, entry.yawWashoutTime);
    assert.equal(
      entry.result.steeringActuatorResponse.applyRate,
      1 / entry.traversalSeconds,
    );
    assert.equal(
      entry.result.steeringActuatorResponse.releaseRate,
      1 / entry.traversalSeconds,
    );
    assert.notEqual(entry.result.settleSeconds, null, JSON.stringify(entry));
    assertAllNumbersFinite(entry);
  }
});

test('calm full-input steady envelope remains inside A without a 15-to-16 m/s discontinuity', () => {
  for (const profile of profiles) {
    const bySign = new Map();
    for (const steeringSign of [-1, 1]) {
      const envelope = [12, 15, 16, 20, 25].map((speed) => runSteadyFullInputProbe({
        profile,
        speed,
        steeringSign,
      }));
      bySign.set(steeringSign, envelope);
      for (const result of envelope) {
        assert.ok(Number.isFinite(result.radiusMeters) && result.radiusMeters > 0, JSON.stringify(result));
        assert.ok(
          Number.isFinite(result.lateralAccelerationMetersPerSecondSquared)
            && result.lateralAccelerationMetersPerSecondSquared > 0,
          JSON.stringify(result),
        );
        assert.ok(Number.isFinite(result.frontUtilization) && result.frontUtilization >= 0);
        assert.ok(Number.isFinite(result.rearUtilization) && result.rearUtilization >= 0);
        assert.ok(
          result.maxAbsSideslipDegrees < profile.steeringAutomaticMax * 180 / Math.PI,
          JSON.stringify(result),
        );
      }
      const at15 = envelope.find(({ speedMetersPerSecond }) => speedMetersPerSecond === 15);
      const at16 = envelope.find(({ speedMetersPerSecond }) => speedMetersPerSecond === 16);
      assert.ok(
        Math.abs(at16.sideslipDegrees - at15.sideslipDegrees) < 3.5,
        `${profile.id} ${steeringSign}: ${JSON.stringify({ at15, at16 })}`,
      );
      assert.ok(Math.abs(at16.frontUtilization - at15.frontUtilization) < 0.5);
      assert.ok(Math.abs(at16.rearUtilization - at15.rearUtilization) < 0.5);
      assert.ok(Math.abs(at16.radiusMeters / at15.radiusMeters - 1) < 0.25);
    }

    const negative = bySign.get(-1);
    const positive = bySign.get(1);
    for (let index = 0; index < negative.length; index += 1) {
      assert.ok(Math.abs(negative[index].radiusMeters - positive[index].radiusMeters) < 1e-8);
      assert.ok(
        Math.abs(
          negative[index].lateralAccelerationMetersPerSecondSquared
            - positive[index].lateralAccelerationMetersPerSecondSquared,
        ) < 1e-8,
      );
      assert.ok(Math.abs(negative[index].sideslipDegrees + positive[index].sideslipDegrees) < 1e-8);
      assert.ok(Math.abs(negative[index].frontUtilization - positive[index].frontUtilization) < 1e-8);
      assert.ok(Math.abs(negative[index].rearUtilization - positive[index].rearUtilization) < 1e-8);
    }
  }
});

test('deep-beta seeds escape the automatic-steer boundary for every common profile and both signs', () => {
  for (const profile of profiles) {
    for (const speed of [12, 15, 16, 20, 25]) {
      for (const steeringSign of [-1, 1]) {
        const negative = runDeepSideslipEscapeProbe({
          profile,
          speed,
          initialSideslipDegrees: -43,
          steeringSign,
        });
        const positive = runDeepSideslipEscapeProbe({
          profile,
          speed,
          initialSideslipDegrees: 43,
          steeringSign: -steeringSign,
        });
        for (const result of [negative, positive]) {
          assert.equal(result.enteredInnerRegion, true, JSON.stringify(result));
          assert.equal(result.finalInsideAutomaticAuthority, true, JSON.stringify(result));
        }
        assert.ok(
          Math.abs(negative.finalSideslipDegrees + positive.finalSideslipDegrees) < 1e-9,
          `${profile.id} ${speed} m/s ${steeringSign} must remain mirror-symmetric`,
        );
        assert.ok(
          Math.abs(negative.peakFrontUtilization - positive.peakFrontUtilization) < 1e-9,
        );
        assert.ok(
          Math.abs(negative.peakRearUtilization - positive.peakRearUtilization) < 1e-9,
        );
      }
    }
  }
});

test('deep-beta basin probe rejects the known D=15/A=16 outer-attractor control', () => {
  const knownBad = compileArcadeVehicleProfile({
    ...FR_VEHICLE_PROFILE,
    steeringOffsetMax: 15 * Math.PI / 180,
  });
  assert.ok(Math.abs(knownBad.steeringAutomaticMax * 180 / Math.PI - 16) < 1e-12);
  for (const speed of [16, 20]) {
    for (const initialSideslipDegrees of [-43, 43]) {
      const result = runDeepSideslipEscapeProbe({
        profile: knownBad,
        speed,
        initialSideslipDegrees,
      });
      assert.equal(result.finalInsideAutomaticAuthority, false, JSON.stringify(result));
      assert.ok(Math.abs(result.finalSideslipDegrees) > 30, JSON.stringify(result));
    }
  }
});

test('deep-slide input ordering uses beta integral and retained speed to reject drag recovery', () => {
  const common = { initialSideslipDegrees: -30, initialYawRate: 0 };
  const correct = runDeepSlideRecoveryProbe({ inputKind: 'correct', ...common });
  const neutral = runDeepSlideRecoveryProbe({ inputKind: 'neutral', ...common });
  const wrong = runDeepSlideRecoveryProbe({ inputKind: 'wrong', ...common });
  const fixedStepTolerance = 1 / 60 + 1e-12;

  assert.ok(correct.recoverySeconds <= neutral.recoverySeconds + fixedStepTolerance);
  assert.ok(wrong.recoverySeconds >= neutral.recoverySeconds + 2 / 60 - 1e-12);
  assert.ok(
    correct.absoluteSideslipIntegralDegreeSeconds
      <= neutral.absoluteSideslipIntegralDegreeSeconds + 0.1,
  );
  assert.ok(
    wrong.absoluteSideslipIntegralDegreeSeconds
      > neutral.absoluteSideslipIntegralDegreeSeconds + 0.2,
  );
  assert.ok(
    correct.speedAtRecoveryMetersPerSecond
      >= neutral.speedAtRecoveryMetersPerSecond - 0.15,
  );
  assert.ok(
    wrong.speedAtRecoveryMetersPerSecond
      < neutral.speedAtRecoveryMetersPerSecond - 0.2,
  );
  assert.ok(wrong.finalSpeedMetersPerSecond < neutral.finalSpeedMetersPerSecond - 0.2);
  assert.ok(wrong.minimumSpeedBeforeRecoveryMetersPerSecond < neutral.minimumSpeedBeforeRecoveryMetersPerSecond);
});

function assertAllNumbersFinite(value) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) assertAllNumbersFinite(child);
}
