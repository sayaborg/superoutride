import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  COMMON_SELECTABLE_VEHICLE_TIRE,
} from '../dist/physics/vehicle-profiles.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

test('M9.9 axle-neutral compiled reference remains common beneath later browser tire calibration', () => {
  const reference = { gripX: 1.35, peakSlipX: 1.26*1.35/9.75,
    gripY: 1.35, peakSlipY: 1.26*1.35/9.75, knee: .74 };
  assert.deepEqual(COMMON_SELECTABLE_VEHICLE_TIRE, {
    frontTire: reference, rearTire: reference, lowSpeedRegularization: 1,
  });
  assert.equal(9.75, (9 + 10.5) / 2);
  for (const { profile } of VEHICLE_CATALOG) {
    assert.equal(profile.frontStation.tire.kY, 9.75, profile.id);
    assert.equal(profile.rearStation.tire.kY, 9.75, profile.id);
    assert.equal(profile.frontStation.tire.kY, 9.75, profile.id);
    assert.equal(profile.rearStation.tire.kY, 9.75, profile.id);
  }
});

test('M9.9 unit travel-direction foundation survives M9.11 without drift or gain authority', async () => {
  const [solver, calibration, input] = await Promise.all([
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/vehicle-calibration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/input/driving-input.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(solver, /const automaticSteer = clamp\(\s*bodyTravelDirection,/s);
  for (const source of [solver, calibration, input]) {
    assert.doesNotMatch(source, /travelDirectionGain|driftMode|driftAssist/i);
  }
  assert.doesNotMatch(`${solver}\n${calibration}`, /yawTransient|yawWashout|steeringAssist/i);
});
