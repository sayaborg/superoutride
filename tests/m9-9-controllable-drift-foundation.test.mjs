import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BROWSER_TIRE_CHARACTERISTIC_PRESETS,
} from '../dist/browser/tire-friction-selection.js';
import {
  COMMON_SELECTABLE_VEHICLE_TIRE,
} from '../dist/physics/vehicle-profiles.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

test('M9.9 removes the common axle stiffness bias without adding vehicle-specific tire branches', () => {
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

test('M9.9 keeps M9.5 preset 2 and 3 effective slope targets unchanged', () => {
  const [, preset2, preset3] = BROWSER_TIRE_CHARACTERISTIC_PRESETS;
  assert.ok(Math.abs(9.75 * preset2.calibration.linearStiffnessMultiplier - 10.3) < 1e-12);
  assert.ok(Math.abs(9.75 * preset3.calibration.linearStiffnessMultiplier - 10.3) < 1e-12);
  assert.ok(Math.abs(preset2.calibration.linearStiffnessMultiplier - 10.3 / 9.75) < 1e-15);
  assert.equal(
    preset3.calibration.linearStiffnessMultiplier,
    preset2.calibration.linearStiffnessMultiplier,
  );
});

test('M9.9 preserves unit travel-direction steering and adds no drift mode or gain authority', async () => {
  const [solver, calibration, input] = await Promise.all([
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/vehicle-calibration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/input/driving-input.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(
    solver,
    /bodyTravelDirection\s*-\s*calibration\.yawTransientGain\s*\*\s*transientYawRate/,
  );
  for (const source of [solver, calibration, input]) {
    assert.doesNotMatch(source, /travelDirectionGain|driftMode|driftAssist/i);
  }
});
