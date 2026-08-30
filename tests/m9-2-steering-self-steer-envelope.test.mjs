import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectCurrentSteeringSelfSteerEnvelope,
  collectSteeringAuthoritySweeps,
  collectTravelDirectionGainSweep,
} from '../tools/probe-steering-self-steer.mjs';

function findCase(envelope, expected) {
  return envelope.find((entry) => Object.entries(expected).every(
    ([key, value]) => entry[key] === value,
  ));
}

test('self-steer calibration probe covers duration speed drive and every common profile deterministically', () => {
  const first = collectCurrentSteeringSelfSteerEnvelope();
  const second = collectCurrentSteeringSelfSteerEnvelope();
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
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${entry.profile} ${key}`);
    }
  }
});

test('selectable travel-direction gains produce one deterministic calibration sweep', () => {
  const sweep = collectTravelDirectionGainSweep();
  assert.deepEqual(sweep.map(({ gain }) => gain), [0.3, 0.4, 0.5, 0.6, 0.7]);
  assert.deepEqual(collectTravelDirectionGainSweep(), sweep);
  for (const { gain, result } of sweep) {
    assert.equal(result.travelDirectionGain, gain);
    assert.equal(result.oppositePeakComponentsDegrees.residualDriverOffset, 0);
    assert.ok(result.maxFrontUtilization < 1);
    assert.ok(result.maxRearUtilization < 1);
  }
  for (let index = 1; index < sweep.length; index += 1) {
    const weaker = sweep[index - 1].result;
    const stronger = sweep[index].result;
    assert.ok(weaker.peakOppositeRoadWheelDegrees < stronger.peakOppositeRoadWheelDegrees);
    assert.ok(
      weaker.peakReverseYawRateDegreesPerSecond
      < stronger.peakReverseYawRateDegreesPerSecond,
    );
    assert.ok(weaker.settleSeconds >= stronger.settleSeconds);
  }
  const canonical = findCase(collectCurrentSteeringSelfSteerEnvelope(), {
    profile: 'FR',
    speedMetersPerSecond: 25,
    pressSeconds: 0.35,
    driven: false,
  });
  assert.equal(canonical.travelDirectionGain, 1);
  assert.ok(sweep.at(-1).result.peakOppositeRoadWheelDegrees < canonical.peakOppositeRoadWheelDegrees);
  assert.ok(
    sweep.at(-1).result.peakReverseYawRateDegreesPerSecond
    < canonical.peakReverseYawRateDegreesPerSecond,
  );
});

test('current canonical excessive-self-steer case is input-neutral and below tire saturation', () => {
  const envelope = collectCurrentSteeringSelfSteerEnvelope();
  const coast = findCase(envelope, {
    profile: 'FR',
    speedMetersPerSecond: 25,
    pressSeconds: 0.35,
    driven: false,
  });
  const driven = findCase(envelope, {
    profile: 'FR',
    speedMetersPerSecond: 25,
    pressSeconds: 0.35,
    driven: true,
  });
  assert.ok(coast);
  assert.ok(driven);
  assert.equal(coast.oppositePeakComponentsDegrees.residualDriverOffset, 0);
  assert.ok(coast.peakOppositeRoadWheelDegrees > 3);
  assert.ok(coast.peakReverseYawRateDegreesPerSecond > 5);
  assert.ok(coast.maxFrontUtilization < 1);
  assert.ok(coast.maxRearUtilization < 1);
  assert.ok(
    Math.abs(coast.oppositePeakComponentsDegrees.travelDirection)
    > Math.abs(coast.oppositePeakComponentsDegrees.yawPreview),
  );
  assert.ok(driven.peakOppositeRoadWheelDegrees > coast.peakOppositeRoadWheelDegrees);
});

test('weakening yaw preview or slowing actuator release trades away stabilization rather than fixing the cause', () => {
  const sweeps = collectSteeringAuthoritySweeps();
  const noPreview = sweeps.yawPreview.find((entry) => entry.steeringYawPreviewTime === 0).result;
  const currentPreview = sweeps.yawPreview.find(
    (entry) => entry.steeringYawPreviewTime === 0.12,
  ).result;
  assert.ok(
    noPreview.peakReverseYawRateDegreesPerSecond
    > currentPreview.peakReverseYawRateDegreesPerSecond,
  );
  assert.ok(noPreview.settleSeconds > currentPreview.settleSeconds);

  const slowRelease = sweeps.actuatorRelease.find(
    (entry) => entry.steeringReleaseRate === 2,
  ).result;
  const releasedM90Release = sweeps.actuatorRelease.find(
    (entry) => entry.steeringReleaseRate === 4,
  ).result;
  const currentRelease = sweeps.actuatorRelease.find(
    (entry) => entry.steeringReleaseRate === 8,
  ).result;
  assert.ok(slowRelease.peakOppositeRoadWheelDegrees < currentRelease.peakOppositeRoadWheelDegrees);
  assert.ok(
    slowRelease.peakReverseYawRateDegreesPerSecond
    > currentRelease.peakReverseYawRateDegreesPerSecond,
  );
  assert.ok(slowRelease.settleSeconds > currentRelease.settleSeconds);
  assert.ok(
    currentRelease.peakReverseYawRateDegreesPerSecond
    < releasedM90Release.peakReverseYawRateDegreesPerSecond,
  );
  assert.ok(currentRelease.settleSeconds < releasedM90Release.settleSeconds);
});
