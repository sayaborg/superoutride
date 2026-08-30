import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectCurrentSteeringSelfSteerEnvelope,
  collectSteeringAuthoritySweeps,
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
  assert.ok(noPreview.peakOppositeRoadWheelDegrees >= currentPreview.peakOppositeRoadWheelDegrees);
  assert.ok(
    noPreview.peakReverseYawRateDegreesPerSecond
    > currentPreview.peakReverseYawRateDegreesPerSecond,
  );
  assert.ok(noPreview.settleSeconds > currentPreview.settleSeconds);

  const slowRelease = sweeps.actuatorRelease.find(
    (entry) => entry.steeringReleaseRate === 2,
  ).result;
  const currentRelease = sweeps.actuatorRelease.find(
    (entry) => entry.steeringReleaseRate === 4,
  ).result;
  assert.ok(slowRelease.peakOppositeRoadWheelDegrees < currentRelease.peakOppositeRoadWheelDegrees);
  assert.ok(
    slowRelease.peakReverseYawRateDegreesPerSecond
    > currentRelease.peakReverseYawRateDegreesPerSecond,
  );
  assert.ok(slowRelease.settleSeconds > currentRelease.settleSeconds);
});
