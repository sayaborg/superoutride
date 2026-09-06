import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createTerrainProbe, runTerrainProbe, TERRAIN_CASES, terrainInput } from '../tools/torque-protection-terrain-probe.mjs';

function assertBudgets(run) {
  const message = JSON.stringify(run);
  assert.ok(run.torqueBudgetViolation < 1e-7, message);
  assert.ok(run.maxEllipse <= 1 + 1e-10, message);
  assert.equal(run.maxPositiveSlipPower, 0, message);
  assert.equal(run.zeroLoadForceViolation, 0, message);
  assert.equal(run.infeasibleNonzeroTorque, 0, message);
}
function assertCompleted(run) {
  const message = JSON.stringify(run);
  assert.equal(run.error, null, message);
  assert.equal(run.completed, true, message);
  assert.equal(run.overturned, false, message);
  assert.equal(run.seconds, run.requestedSeconds, message);
  assert.ok(Number.isFinite(run.finalSpeed) && Number.isFinite(run.maxAbsPitch), message);
  assertBudgets(run);
}

// These are mechanical acceptance probes, NOT a guarantee of yaw stability or human handling.
const supportedCases = ['lowGripDrive', 'lowGripBrake', 'uphillDrive', 'downhillBrake',
  'gripDropBrake', 'turnDrive', 'turnBrake', 'lowGripReversal'];
for (const entry of VEHICLE_CATALOG) for (const name of supportedCases) {
  test(`M9.21 ${entry.profile.id} ${name}: finite torque/force contract, not yaw certification`, () => {
    const run = runTerrainProbe(entry, { ...TERRAIN_CASES[name], hz: 120 });
    assertCompleted(run);
    assert.equal(run.infeasibleTime, 0, JSON.stringify(run));
    if (entry.torqueProtection.supportReserve !== null) {
      assert.equal(run.frontLiftTime, 0, JSON.stringify(run));
      assert.equal(run.rearLiftTime, 0, JSON.stringify(run));
    }
    if (name === 'lowGripDrive' || name === 'uphillDrive') assert.ok(run.finalSpeed > run.initialSpeed);
    if (['lowGripBrake', 'downhillBrake', 'gripDropBrake', 'turnBrake'].includes(name)) assert.ok(run.finalSpeed < .5);
    if (name === 'gripDropBrake') {
      assert.equal(run.gripTransition, true);
      assert.equal(run.minGrip, .25);
      assert.equal(run.maxGrip, 1);
    }
  });
}

for (const hz of [60, 120, 240]) {
  for (const entry of [VEHICLE_CATALOG[0], VEHICLE_CATALOG[5]]) {
    test(`M9.21 ${entry.profile.id} natural crest coast ${hz}Hz is identical with/without protection`, () => {
      const options = { terrain: 'crest', speed: 45, seconds: 5, kind: 'coast', hz, capture: true };
      const raw = runTerrainProbe(entry, { ...options, protectedRun: false });
      const protectedRun = runTerrainProbe(entry, { ...options, protectedRun: true });
      assertCompleted(protectedRun);
      assert.ok(protectedRun.airborneTime > .3);
      assert.ok(protectedRun.recontacts >= 1);
      const { protectedRun: rawPolicy, ...a } = raw;
      const { protectedRun: enabledPolicy, ...b } = protectedRun;
      assert.equal(rawPolicy, false);
      assert.equal(enabledPolicy, true);
      assert.deepEqual(a, b);
    });
  }
  test(`M9.21 powered VFR crest ${hz}Hz exposes infeasibility without forcing support`, () => {
    const run = runTerrainProbe(VEHICLE_CATALOG[5], {
      terrain: 'crest', speed: 45, seconds: 5, kind: 'drive', hz, capture: true,
    });
    assertCompleted(run);
    assert.ok(run.airborneTime > .3);
    assert.ok(run.recontacts >= 1);
    assert.ok(run.infeasibleTime > 0, 'natural crest can escape the local tangent-plane margin');
    const infeasible = run.rows.filter(row => !row.supportFeasible);
    assert.ok(infeasible.length > 0);
    for (const row of infeasible) {
      assert.equal(row.supportTorqueScale, 0);
      assert.equal(row.frontDriveTorque + row.rearDriveTorque + row.frontBrakeTorque + row.rearBrakeTorque, 0);
    }
  });
  test(`M9.21 crest stress ${hz}Hz reports qTravel/overturn instead of claiming completed protection`, () => {
    // Reporting falsification controls, not desired product responses. A future physical fix must
    // explicitly supersede these observations, not conceal them through recovery or clamps.
    const car = runTerrainProbe(VEHICLE_CATALOG[0], { ...TERRAIN_CASES.crestCoast, hz });
    assert.equal(car.completed, false);
    assert.match(car.error, /VehicleOutsideModelError:.*qTravel/);
    assert.ok(car.airborneTime > 0 && car.recontacts > 0);
    assertBudgets(car);
    const bike = runTerrainProbe(VEHICLE_CATALOG[5], { ...TERRAIN_CASES.crestCoast, hz });
    assert.equal(bike.completed, false);
    assert.equal(bike.error, null);
    assert.equal(bike.overturned, true);
    assert.ok(bike.airborneTime > 0 && bike.recontacts > 0);
    assertBudgets(bike);
  });
}

test('M9.21 terrain diagnostics retain moving-beta information and distinguish it from near-stop angle', () => {
  const run = runTerrainProbe(VEHICLE_CATALOG[5], { ...TERRAIN_CASES.lowGripReversal });
  assertCompleted(run);
  assert.ok(run.speedAtMaxMovingBeta > 5);
  assert.ok(run.timeAtMaxMovingBeta > 0 && run.timeAtMaxMovingBeta <= run.seconds);
  assert.ok(run.maxAbsBetaAbove15 <= run.maxAbsMovingBeta);
  assert.ok(run.maxAbsMovingBeta <= run.maxAbsBeta);
});
test('M9.21 terrain fixture preserves exact grade, material isolation and explicit policy', () => {
  const p = createTerrainProbe(VEHICLE_CATALOG[5], { grade: .1, grip: .25 });
  assert.equal(p.height.samplePhysicsDifferential(1050).dYdS, .1);
  assert.equal(p.height.samplePhysicsDifferential(1050).y, 5);
  assert.equal(p.surface.sample(1050, 0).material.rollingResistance, .014);
  assert.equal(p.surface.sample(1050, 0).material.gripFactor, .25);
  assert.equal(p.surface.sample(1050, 501).material.supported, false);
  assert.equal(p.surface.sample(1050, 501).material.gripFactor, 0);
  assert.equal(p.vehicle.torqueProtection.supportReserve, .08);
  const stock = createTerrainProbe(VEHICLE_CATALOG[0], { calibration: 'stock' });
  assert.equal(stock.vehicle.tireFrictionCalibration.front.muX, VEHICLE_CATALOG[0].profile.frontStation.tire.muX);
});
test('M9.21 terrain probe rejects malformed domains and never imports recovery or overwrites motion', async () => {
  for (const options of [{ hz: 90 }, { seconds: 0 }, { seconds: .0001 }, { kind: 'unknown' },
    { direction: 0 }, { grip: -1 }, { speed: NaN }, { calibration: 'unknown' }, { terrain: 'unknown' }]) {
    assert.throws(() => runTerrainProbe(VEHICLE_CATALOG[0], options), RangeError);
  }
  assert.deepEqual(terrainInput(0, 'drive'), { steering: 0, throttle: false, brake: false });
  assert.equal(terrainInput(2, 'reversal', -1).steering, .35);
  const source = await readFile(new URL('../tools/torque-protection-terrain-probe.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from .*recovery|recoverM5|v\.(?:x|y|z|yaw|pitch|velocityX|velocityY|velocityZ|frontWheelOmega|rearWheelOmega)\s*=/);
  assert.match(source, /updateArcadeVehicle/);
  assert.match(source, /evaluateTireForce/);
});
