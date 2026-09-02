import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  COMMON_SELECTABLE_VEHICLE_TIRE,
} from '../dist/physics/vehicle-profiles.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

test('M9.9 axle-neutral compiled reference remains common beneath later browser tire calibration', () => {
  assert.deepEqual(COMMON_SELECTABLE_VEHICLE_TIRE, {
    muRef: 1.35,
    rhoKnee: 0.74,
    lowSpeedRegularization: 1,
    frontNormalizedStiffness: 9.75,
    rearNormalizedStiffness: 9.75,
  });
  assert.equal(9.75, (9 + 10.5) / 2);
  for (const { profile } of VEHICLE_CATALOG) {
    assert.equal(profile.frontNormalizedStiffness, 9.75, profile.id);
    assert.equal(profile.rearNormalizedStiffness, 9.75, profile.id);
    assert.equal(profile.frontStation.tire.normalizedStiffness, 9.75, profile.id);
    assert.equal(profile.rearStation.tire.normalizedStiffness, 9.75, profile.id);
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
