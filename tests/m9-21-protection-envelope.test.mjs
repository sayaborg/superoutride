import assert from 'node:assert/strict';
import test from 'node:test';

import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { runProtectionProbe } from '../tools/torque-protection-probe.mjs';

const SPEEDS = [0, 15, 30, 55];

/**
 * Broaden the released M9.21 causal baseline without changing control law or calibration.
 * This is a finite straight/flat envelope, not a claim about arbitrary terrain, yaw stability,
 * human handling or the whole five-axis tire grid.
 */
test('M9.21 protected catalog stays finite across a broader straight-line speed and power envelope', () => {
  for (const entry of VEHICLE_CATALOG) {
    for (const speed of SPEEDS) {
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

      if (entry.torqueProtection.supportReserve !== null) {
        assert.equal(drive.frontLiftTime, 0, JSON.stringify(drive));
        assert.equal(drive.rearLiftTime, 0, JSON.stringify(drive));
      }
    }

    for (const speed of SPEEDS.filter((value) => value > 0)) {
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

      if (entry.torqueProtection.supportReserve !== null) {
        assert.equal(brake.frontLiftTime, 0, JSON.stringify(brake));
        assert.equal(brake.rearLiftTime, 0, JSON.stringify(brake));
      }
    }
  }
});
