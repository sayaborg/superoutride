import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  BROWSER_CALIBRATION_KEYS,
  BROWSER_CAMERA_YAW_TOGGLE_CODE,
  BROWSER_COURSE_KEYS,
  BROWSER_RECOVERY_CODE,
  BROWSER_VEHICLE_KEYS,
} from '../dist/browser/key-bindings.js';
import { createBrowserVehicleProfileSelections } from '../dist/browser/vehicle-profile-selection.js';

import { DRIVING_KEYS } from '../dist/input/keyboard-input.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

describe('authored boundary regressions', () => {
  test('all driving, vehicle, course, camera and calibration shortcuts have unique owners', () => {
    const codes = [
      ...Object.values(DRIVING_KEYS),
      ...Object.values(BROWSER_VEHICLE_KEYS),
      ...Object.values(BROWSER_COURSE_KEYS).flatMap(Object.values),
      ...Object.values(BROWSER_CALIBRATION_KEYS),
      BROWSER_CAMERA_YAW_TOGGLE_CODE,
      BROWSER_RECOVERY_CODE,
    ];
    assert.equal(new Set(codes).size, codes.length);
    assert.deepEqual(Object.keys(BROWSER_VEHICLE_KEYS).sort(), VEHICLE_CATALOG.map((v) => v.profile.id).sort());
    for (const entry of VEHICLE_CATALOG) {
      assert.equal('keyCode' in entry, false);
      assert.equal('keyLabel' in entry, false);
    }
    // Content IDs are opaque strings, including Object.prototype names.
    const entry = { ...VEHICLE_CATALOG[0], profile: { ...VEHICLE_CATALOG[0].profile, id: 'toString' } };
    assert.equal(createBrowserVehicleProfileSelections([entry])[0].code, undefined);
  });
});
