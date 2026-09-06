import assert from 'node:assert/strict';
import test from 'node:test';

import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { runProtectionProbe } from '../tools/torque-protection-probe.mjs';

const MOVING_SPEEDS = [15, 30, 55];

/**
 * Broaden the released M9.21 causal baseline without changing control law or calibration.
 * ROAD policy owns wheel-slip protection, not anti-wheelie. TWO_WHEEL additionally owns support
 * protection, so only bike policy is required to survive the zero-speed ENG4 launch without lift.
 * This remains a finite straight/flat envelope, not arbitrary-terrain, ESC, human handling or
 * whole-five-axis-grid certification.
 */
test('M9.21 authorized protection stays finite across a broader straight-line speed and power envelope', () => {
  for (const entry of VEHICLE_CATALOG) {
    const hasSupportProtection = entry.torqueProtection.supportReserve !== null;
    const driveSpeeds = hasSupportProtection ? [0, ...MOVING_SPEEDS] : MOVING_SPEEDS;

    for (const speed of driveSpeeds) {
      const drive = runProtectionProbe(entry, {
        hz: 120,
        seconds: 6,
        kind: 'drive',
        speed,
        protectedRun: true,
        engine: 4,
      });
      assert.equal(drive.error, null, JSON.stringify(drive));
      assert.equal(drive.overturned, false, JSON.stringify(drive));
      assert.ok(Number.isFinite(drive.finalSpeed), JSON.stringify(drive));
      assert.ok(Number.isFinite(drive.maxPitch) && Number.isFinite(drive.minPitch), JSON.stringify(drive));
      assert.equal(drive.infeasibleTime, 0, JSON.stringify(drive));

      if (hasSupportProtection) {
        assert.equal(drive.frontLiftTime, 0, JSON.stringify(drive));
        assert.equal(drive.rearLiftTime, 0, JSON.stringify(drive));
      }
    }

    for (const speed of MOVING_SPEEDS) {
      const brake = runProtectionProbe(entry, {
        hz: 120,
        seconds: 6,
        kind: 'brake',
        speed,
        protectedRun: true,
      });
      assert.equal(brake.error, null, JSON.stringify(brake));
      assert.equal(brake.overturned, false, JSON.stringify(brake));
      assert.ok(Number.isFinite(brake.finalSpeed), JSON.stringify(brake));
      assert.ok(brake.finalSpeed < 0.5, JSON.stringify(brake));
      assert.equal(brake.infeasibleTime, 0, JSON.stringify(brake));

      if (hasSupportProtection) {
        assert.equal(brake.frontLiftTime, 0, JSON.stringify(brake));
        assert.equal(brake.rearLiftTime, 0, JSON.stringify(brake));
      }
    }
  }
});
