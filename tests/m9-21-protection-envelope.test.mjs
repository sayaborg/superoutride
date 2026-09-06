import assert from 'node:assert/strict';
import test from 'node:test';

import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { runProtectionProbe } from '../tools/torque-protection-probe.mjs';

const SPEEDS = [0, 15, 30, 55];

function assertFiniteProtectedRun(run) {
  assert.equal(run.error, null, JSON.stringify(run));
  assert.equal(run.overturned, false, JSON.stringify(run));
  assert.ok(Number.isFinite(run.finalSpeed), JSON.stringify(run));
  assert.ok(Number.isFinite(run.maxPitch) && Number.isFinite(run.minPitch), JSON.stringify(run));
  assert.equal(run.infeasibleTime, 0, JSON.stringify(run));
}

/**
 * Broaden the released M9.21 causal baseline without changing control law or calibration.
 * All catalog entries are required to survive the product-default ENG1 straight envelope.
 * TWO_WHEEL additionally owns support protection, so only those policies are stress-tested at ENG4.
 * ROAD+ENG4 may physically wheelie: TCS owns longitudinal overslip, not body-support viability.
 */
test('M9.21 product-default protection stays finite across 0..198 km/h straight drive and braking', () => {
  for (const entry of VEHICLE_CATALOG) {
    for (const speed of SPEEDS) {
      const drive = runProtectionProbe(entry, {
        hz: 120, seconds: 6, kind: 'drive', speed, protectedRun: true, engine: 1,
      });
      assertFiniteProtectedRun(drive);
      if (entry.torqueProtection.supportReserve !== null) {
        assert.equal(drive.frontLiftTime, 0, JSON.stringify(drive));
        assert.equal(drive.rearLiftTime, 0, JSON.stringify(drive));
      }
    }

    for (const speed of SPEEDS.filter((value) => value > 0)) {
      const brake = runProtectionProbe(entry, {
        hz: 120, seconds: 6, kind: 'brake', speed, protectedRun: true,
      });
      assertFiniteProtectedRun(brake);
      assert.ok(brake.finalSpeed < 0.5, JSON.stringify(brake));
      if (entry.torqueProtection.supportReserve !== null) {
        assert.equal(brake.frontLiftTime, 0, JSON.stringify(brake));
        assert.equal(brake.rearLiftTime, 0, JSON.stringify(brake));
      }
    }
  }
});

test('M9.21 TWO_WHEEL support protection survives ENG4 drive across 0..198 km/h', () => {
  for (const entry of VEHICLE_CATALOG.filter((value) => value.torqueProtection.supportReserve !== null)) {
    for (const speed of SPEEDS) {
      const drive = runProtectionProbe(entry, {
        hz: 120, seconds: 6, kind: 'drive', speed, protectedRun: true, engine: 4,
      });
      assertFiniteProtectedRun(drive);
      assert.equal(drive.frontLiftTime, 0, JSON.stringify(drive));
      assert.equal(drive.rearLiftTime, 0, JSON.stringify(drive));
    }
  }
});
