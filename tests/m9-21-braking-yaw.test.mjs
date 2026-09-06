import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { updateArcadeVehicle, arcadeBodyKinematics } from '../dist/physics/arcade-vehicle-physics.js';
import { deriveContactObservation, contactForceWorld, momentAboutCg } from '../dist/physics/vehicle-dynamics.js';
import { createTerrainProbe, runTerrainProbe, TERRAIN_CASES } from '../tools/torque-protection-terrain-probe.mjs';
import { forkProbe } from '../tools/drift-control-probe.mjs';
import { BRAKING_ACTIONS, brakingInput, brakingStateFingerprint, observeBrakingState,
  decomposeContactYawChange, runBrakingComparison } from '../tools/braking-yaw-probe.mjs';
const car = VEHICLE_CATALOG[0], bike = VEHICLE_CATALOG[5];
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const byAction = report => Object.fromEntries(report.results.map(row => [row.action, row]));
function mechanical(result) {
  assert.equal(result.error, null);
  assert.equal(result.completed, true);
  assert.equal(result.maxTorqueBudgetViolation, 0);
  assert.ok(result.maxEllipse <= 1 + 1e-10);
  assert.equal(result.maxPositiveSlipPower, 0);
  assert.equal(result.liftTime, 0);
  assert.equal(result.infeasibleTime, 0);
}

test('M9.21 replay fork preserves non-flat world readers and independent normally-reached state', () => {
  const p = createTerrainProbe(bike, { grip: .25, grade: .1 });
  const input = { steering: .1, throttle: false, brake: false };
  for (let i = 0; i < 30; i++) updateArcadeVehicle(p.guide, p.height, p.surface, p.vehicle, input, 1 / 120);
  const before = brakingStateFingerprint(p.vehicle), q = forkProbe(p);
  for (const reader of ['guide', 'height', 'surface']) assert.equal(q[reader], p[reader]);
  assert.equal(brakingStateFingerprint(q.vehicle), before);
  assert.equal(q.vehicle.torqueProtection, p.vehicle.torqueProtection);
  assert.notEqual(q.vehicle.actuator, p.vehicle.actuator);
  assert.notEqual(q.vehicle.powertrain, p.vehicle.powertrain);
  updateArcadeVehicle(q.guide, q.height, q.surface, q.vehicle, input, 1 / 120);
  assert.equal(brakingStateFingerprint(p.vehicle), before);
  updateArcadeVehicle(p.guide, p.height, p.surface, p.vehicle, input, 1 / 120);
  assert.equal(brakingStateFingerprint(q.vehicle), brakingStateFingerprint(p.vehicle));
});
test('M9.21 read-only contact yaw attribution sums existing contact moment without feedback', () => {
  const p = createTerrainProbe(bike), v = p.vehicle;
  for (let n = 0; n < 180; n++) updateArcadeVehicle(p.guide, p.height, p.surface, v,
    { steering: .35, throttle: false, brake: n > 150 }, 1 / 120);
  const before = brakingStateFingerprint(v), row = observeBrakingState(p, 0), body = arcadeBodyKinematics(v);
  for (const side of ['front', 'rear']) {
    const station = v.profile[side + 'Station'];
    const c = deriveContactObservation(p.guide, p.height, p.surface, body, station,
      side === 'front' ? v.frontSteerAngle : 0, v.course.segmentIndex);
    close(row[side].yawContact, momentAboutCg(c, body.position,
      contactForceWorld(c, row[side].fx, row[side].fy)).y);
  }
  assert.equal(brakingStateFingerprint(v), before);
});
for (const hz of [60, 120, 240]) for (const entry of [car, bike]) {
  test(`M9.21 ${entry.profile.id} matched braking forks preserve causal comparison at ${hz}Hz`, () => {
    const options = { hz, actions: ['holdCoast', 'holdBrake100', 'releaseBrake'] };
    const right = runBrakingComparison(entry, options), left = runBrakingComparison(entry, { ...options, direction: -1 });
    for (let i = 0; i < right.results.length; i++) {
      const a = right.results[i], b = left.results[i];
      mechanical(a); mechanical(b);
      assert.equal(a.initialFingerprint, right.initialFingerprint);
      close(a.maxAbsBetaAbove15, b.maxAbsBetaAbove15, 1e-7);
      close(a.peakAbove15.beta, -b.peakAbove15.beta, 1e-7);
      close(a.peakAbove15.yawRate, -b.peakAbove15.yawRate, 1e-7);
      assert.equal(a.lockTimeBefore45, 0);
    }
    // Retained current-model causal counterexample, not a permanent desired spin response.
    // A future authorized handling change must explicitly supersede this comparison evidence.
    const results = byAction(right);
    assert.ok(results.holdCoast.maxAbsBetaAbove15 < 5);
    assert.ok(results.releaseBrake.maxAbsBetaAbove15 < 5);
    assert.ok(results.holdBrake100.maxAbsBetaAbove15 > 15);
  });
}
test('M9.21 VFR initial braking yaw growth precedes rack saturation and wheel lock', () => {
  const report = runBrakingComparison(bike, { actions: ['holdBrake100'] });
  const run = report.results[0], early = run.samples.find(row => row.t === .2);
  mechanical(run);
  assert.equal(early.automaticLimited, false);
  assert.equal(early.control.frontWheelLocked, false);
  assert.equal(early.control.rearWheelLocked, false);
  assert.ok(early.rear.load < report.initial.rear.load * .4);
  assert.ok(early.rear.fy / early.rear.load > report.initial.rear.fy / report.initial.rear.load);
  assert.ok(Math.abs(early.rear.fy) < Math.abs(report.initial.rear.fy) * .4);
  assert.ok(run.firstBeta15.t < run.firstAutomaticLimit.t);
  const d = decomposeContactYawChange(report.initial, early);
  close(d.delta, d.loadContribution + d.responseAndGeometryContribution);
  assert.ok(d.loadContribution > d.delta && d.responseAndGeometryContribution < 0);
  assert.equal(decomposeContactYawChange(report.initial,
    { ...early, rear: { ...early.rear, load: 0 } }), null);
});
test('M9.21 all-nine low-grip forks retain budgets and partial brake demand need not reduce delivered slip-limited braking', () => {
  for (const entry of VEHICLE_CATALOG) {
    const report = runBrakingComparison(entry, { grip: .25, actions: ['holdBrake25', 'holdBrake100', 'releaseBrake'] });
    for (const result of report.results) mechanical(result);
    const r = byAction(report);
    assert.ok(r.releaseBrake.maxAbsBetaAbove15 < r.holdBrake100.maxAbsBetaAbove15);
    close(r.holdBrake25.maxAbsBetaAbove15, r.holdBrake100.maxAbsBetaAbove15, .01);
  }
});
test('M9.21 matched full-brake branch reproduces the earlier unforked terrain probe', () => {
  for (const entry of [car, bike]) {
    const earlier = runTerrainProbe(entry, TERRAIN_CASES.turnBrake);
    const later = runBrakingComparison(entry, { actions: ['holdBrake100'] }).results[0];
    close(earlier.finalSpeed, later.finalSpeed);
    close(earlier.maxAbsBetaAbove15, later.maxAbsBetaAbove15);
  }
});
test('M9.21 braking comparison is deterministic and action order does not mutate the parent', () => {
  const options = { seconds: .5, actions: ['holdBrake100', 'releaseBrake'], capture: true };
  const a = runBrakingComparison(car, options), b = runBrakingComparison(car, options);
  assert.deepEqual(a, b);
  const c = runBrakingComparison(car, { ...options, actions: [...options.actions].reverse() });
  assert.deepEqual(a.results, [...c.results].reverse());
  const slow = runBrakingComparison(car, { speed: 0, seconds: .1, actions: ['holdCoast'] }).results[0];
  assert.equal(slow.maxAbsBetaAbove15, null); assert.equal(slow.peakAbove15, null);
});
test('M9.21 input schedules and validation add no recovery, pose correction or closed-loop controller', async () => {
  assert.equal(new Set(BRAKING_ACTIONS).size, BRAKING_ACTIONS.length);
  assert.equal(brakingInput(.1, 'delayedReleaseBrake').steering, .35);
  assert.equal(brakingInput(.3, 'delayedReleaseBrake').steering, 0);
  assert.equal(brakingInput(.1, 'counterPulseBrake', { direction: -1 }).steering, .35);
  for (const opts of [{ hz: 90 }, { seconds: 0 }, { seconds: .0001 }, { direction: 0 },
    { actions: [] }, { actions: ['unknown'] }, { actions: ['holdCoast', 'holdCoast'] },
    { applyMode: 'unknown' }, { correctionSeconds: -1 }, { grip: NaN }, { speed: NaN }]) {
    assert.throws(() => runBrakingComparison(car, opts), RangeError);
  }
  const source = await readFile(new URL('../tools/braking-yaw-probe.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from .*recovery|recoverM5|v\.(?:x|y|z|yaw|pitch|velocityX|velocityY|velocityZ|frontWheelOmega|rearWheelOmega)\s*=/);
  assert.match(source, /forkProbe\(parent\)/);
  assert.match(source, /evaluateTireForce/);
  assert.match(source, /momentAboutCg/);
});
