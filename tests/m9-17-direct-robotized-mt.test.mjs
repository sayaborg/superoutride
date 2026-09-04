import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createAutomaticPowertrainState, updateAutomaticPowertrain,
  validateAutomaticPowertrainProfile, sampleEngineTorque, engineRevLimiterScale,
  setEngineTorqueMultiplier,
} from '../dist/physics/automatic-powertrain.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { FERRARI_TESTAROSSA_VEHICLE_PROFILE as car } from '../dist/physics/vehicle-profiles.js';
import { compileRasterPath } from '../dist/core/course.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';

const dt = 1 / 60;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const omegaAt = (p, rpm, gear) => rpm * 2 * Math.PI / (60 * p.finalDriveRatio * p.gearRatios[gear - 1]);
const rpmAt = (p, omega, gear) => Math.abs(omega) * p.gearRatios[gear - 1] * p.finalDriveRatio * 60 / (2 * Math.PI);
const guide = compileGuidePath(compileRasterPath([{ x: 0, z: -10000 }, { x: 0, z: 10000 }]), { lMax: 5000, mMin: 0.25, dCam: 5 });
const height = new HeightProfile(guide.length, [{ s: 0, y: 0 }, { s: guide.length, y: 0 }]);
const surface = new SurfaceMap(guide.length, [{ sStart: 0, name: 'M9.17 FLAT DRIVE PROBE', bands: [{ lMin: -5000, lMax: 5000, type: 'ASPHALT' }] }]);
const tire = { referenceFrictionMultiplier: 2 / 1.35, linearStiffnessMultiplier: 1.26 * 2 / (9.75 * 0.24), slidingFrictionRatio: 1 };
const steering = { maxRoadWheelSteer: Math.PI / 3, steeringOffsetMax: 12 * Math.PI / 180, steeringActuatorResponse: { applyRate: 4, releaseRate: 4 } };
const makeVehicle = (profile = car, speed = 10) => createArcadeVehicle(profile, guide, height, surface, 10000, 0, speed, steering, tire);

test('M9.17 all nine profiles retain separate ratio-safe thresholds and remove artificial coupling fields', () => {
  for (const { profile: { powertrain: p } } of VEHICLE_CATALOG) {
    validateAutomaticPowertrainProfile(p);
    for (const name of ['shiftDuration', 'engineResponseTau', 'launchCouplingSlipRpm']) assert.equal(name in p, false);
    for (let i = 1; i < p.gearRatios.length; i++) assert.ok(p.downshiftRpm < p.upshiftRpm * p.gearRatios[i] / p.gearRatios[i - 1]);
    const s = createAutomaticPowertrainState(p);
    assert.deepEqual(Object.keys(s).sort(), ['engineTorqueMultiplier', 'gear', 'engineRpm', 'engineTorqueNewtonMeters', 'outputDriveTorque'].sort());
  }
});

test('M9.17 RPM is direct wheel-ratio algebra and stale observation caches are never authority', () => {
  const p = car.powertrain;
  const omega = omegaAt(p, 4000, 2);
  const a = createAutomaticPowertrainState(p, omega);
  a.gear = 2;
  const b = { ...a, engineRpm: -12345, engineTorqueNewtonMeters: -42, outputDriveTorque: 1234 };
  updateAutomaticPowertrain(a, p, omega, 0.25, dt);
  updateAutomaticPowertrain(b, p, omega, 0.25, dt);
  assert.deepEqual(b, a);
  near(a.engineRpm, 4000);
  const c = { ...a };
  updateAutomaticPowertrain(c, p, omega, 1, dt / 12);
  assert.equal(c.engineRpm, a.engineRpm);
  near(c.outputDriveTorque, a.outputDriveTorque * 4);
});

test('M9.17 zero-speed launch has zero derived RPM, finite idle-floor torque and no zero-throttle creep', () => {
  for (const { profile: { powertrain: p } } of VEHICLE_CATALOG) {
    const s = createAutomaticPowertrainState(p, 0, 3);
    assert.equal(s.engineRpm, 0);
    assert.equal(updateAutomaticPowertrain(s, p, 0, 0, dt), 0);
    assert.ok(updateAutomaticPowertrain(s, p, 0, 1, dt) > 0);
    assert.equal(s.engineRpm, 0);
    near(s.engineTorqueNewtonMeters, sampleEngineTorque(p, p.idleRpm) * 3);
    const omega = omegaAt(p, p.idleRpm / 2, 1);
    updateAutomaticPowertrain(s, p, -omega, 1, dt);
    near(s.engineRpm, p.idleRpm / 2);
    near(s.engineTorqueNewtonMeters, sampleEngineTorque(p, p.idleRpm) * 3);
  }
});

test('M9.17 every adjacent threshold shift delivers new-ratio torque immediately without inverse hunting', () => {
  for (const { profile: { powertrain: p } } of VEHICLE_CATALOG) {
    for (let lower = 1; lower < p.gearRatios.length; lower++) {
      for (const up of [true, false]) {
        const gear = up ? lower : lower + 1;
        const omega = omegaAt(p, up ? p.upshiftRpm + 1e-6 : p.downshiftRpm - 1e-6, gear);
        const s = createAutomaticPowertrainState(p, omega, 3);
        s.gear = gear;
        const expected = up ? gear + 1 : gear - 1;
        for (let tick = 0; tick < 100; tick++) {
          const output = updateAutomaticPowertrain(s, p, omega, 1, dt);
          assert.equal(s.gear, expected);
          assert.ok(output > 0);
          near(s.engineRpm, rpmAt(p, omega, expected));
          near(output, sampleEngineTorque(p, s.engineRpm) * 3 * p.gearRatios[expected - 1] * p.finalDriveRatio * p.efficiency);
        }
      }
    }
  }
});

test('M9.17 invalid ratio gaps and nonpositive engine curves fail compilation', () => {
  const p = car.powertrain;
  for (const bad of [
    { ...p, gearRatios: [1, 2] },
    { ...p, gearRatios: [10, 1] },
    { ...p, downshiftRpm: p.upshiftRpm },
    { ...p, torqueCurve: [...p.torqueCurve, { rpm: p.redlineRpm, torqueNewtonMeters: 0 }] },
    { ...p, torqueCurve: [{ rpm: p.idleRpm, torqueNewtonMeters: 1 }, { rpm: p.upshiftRpm - 1, torqueNewtonMeters: 1 }] },
  ]) assert.throws(() => validateAutomaticPowertrainProfile(bad), RangeError);
  const s = createAutomaticPowertrainState(p);
  for (const [omega, pedal, h] of [[NaN, 1, dt], [0, NaN, dt], [0, 1, 0]]) {
    const before = { ...s };
    assert.throws(() => updateAutomaticPowertrain(s, p, omega, pedal, h), RangeError);
    assert.deepEqual(s, before);
  }
});

test('M9.17 all positive engine samples survive and the curve itself does not collapse at redline', () => {
  for (const { profile: { powertrain: p } } of VEHICLE_CATALOG) {
    for (const point of p.torqueCurve) {
      assert.ok(point.torqueNewtonMeters > 0);
      near(sampleEngineTorque(p, point.rpm), point.torqueNewtonMeters);
    }
    near(sampleEngineTorque(p, p.redlineRpm), p.torqueCurve.at(-1).torqueNewtonMeters);
  }
  near(sampleEngineTorque(car.powertrain, 4500), 470);
  near(sampleEngineTorque(car.powertrain, 6800), 420);
});

test('M9.17 one averaged rev limiter is monotone, bounded and C1 at both endpoints', () => {
  for (const { profile: { powertrain: p } } of VEHICLE_CATALOG) {
    const span = p.redlineRpm - p.upshiftRpm;
    near(engineRevLimiterScale(p, 0), 1);
    near(engineRevLimiterScale(p, p.upshiftRpm), 1);
    near(engineRevLimiterScale(p, (p.upshiftRpm + p.redlineRpm) / 2), 0.5);
    near(engineRevLimiterScale(p, p.redlineRpm), 0);
    near(engineRevLimiterScale(p, p.redlineRpm * 2), 0);
    let previous = 1;
    for (let i = 0; i <= 100; i++) {
      const value = engineRevLimiterScale(p, p.upshiftRpm + span * i / 100);
      assert.ok(value >= 0 && value <= previous + 1e-12);
      previous = value;
    }
    const e = 1e-5;
    assert.ok(Math.abs((engineRevLimiterScale(p, p.upshiftRpm + e * span) - 1) / e) < 1e-4);
    assert.ok(Math.abs(engineRevLimiterScale(p, p.redlineRpm - e * span) / e) < 1e-4);
  }
});

test('M9.17 rev limiting cuts only drive, permits observed overrun and recovers without a timer', () => {
  for (const { profile: { powertrain: p } } of VEHICLE_CATALOG) {
    const top = p.gearRatios.length;
    const omega = omegaAt(p, p.redlineRpm * 1.2, top);
    const s = createAutomaticPowertrainState(p, omega, 4);
    assert.equal(updateAutomaticPowertrain(s, p, omega, 1, dt), 0);
    near(s.engineRpm, p.redlineRpm * 1.2);
    assert.ok(s.engineTorqueNewtonMeters > 0);
    const output = updateAutomaticPowertrain(s, p, omegaAt(p, p.upshiftRpm - 1, top), 1, dt);
    assert.ok(output > 0);
    assert.equal(s.gear, top);
    assert.equal(s.engineTorqueMultiplier, 4);
  }
});

test('M9.17 all nine stock profiles launch through ordinary wheel/contact dynamics and preserve ENG in recovery', () => {
  for (const { profile } of VEHICLE_CATALOG) {
    const v = makeVehicle(profile, 0);
    for (let tick = 0; tick < 120; tick++) updateArcadeVehicle(guide, height, surface, v, { steering: 0, throttle: true, brake: false }, dt);
    assert.ok(v.speed > 0 && Number.isFinite(v.speed), profile.id);
    setEngineTorqueMultiplier(v.powertrain, 3);
    recoverM5Vehicle(createM5RecoveryState(v), guide, height, surface, v);
    assert.equal(v.powertrain.engineTorqueMultiplier, 3);
    assert.equal(v.powertrain.outputDriveTorque, 0);
    assert.equal('shiftTimer' in v.powertrain, false);
  }
});

function huntingProbe() {
  const v = makeVehicle();
  setEngineTorqueMultiplier(v.powertrain, 3);
  const input = { steering: 1, throttle: 1, brake: 0, steeringApplyMode: 'DIRECT', pedalApplyMode: 'DIRECT' };
  let previousGear = 1, changes = 0, downshifts = 0, tailZeros = 0, tailChanges = 0;
  for (let tick = 0; tick < 1200; tick++) {
    updateArcadeVehicle(guide, height, surface, v, input, dt);
    if (v.powertrain.gear !== previousGear) {
      changes++;
      if (v.powertrain.gear < previousGear) downshifts++;
      if (tick >= 900) tailChanges++;
    }
    if (tick >= 900 && v.powertrain.outputDriveTorque === 0) tailZeros++;
    previousGear = v.powertrain.gear;
    for (const value of [v.speed, v.x, v.z, v.yawRate, v.rearWheelOmega, v.powertrain.outputDriveTorque]) assert.ok(Number.isFinite(value));
  }
  return { changes, downshifts, tailZeros, tailChanges, finalSpeed: v.speed, finalYaw: v.yaw, finalGear: v.powertrain.gear };
}

test('M9.17 former ENG3 low-speed hunting case keeps drive through a full 20 seconds without forced state', () => {
  const result = huntingProbe();
  assert.ok(result.changes > 0, 'exercise actual ratio changes, not a locked gear');
  assert.equal(result.downshifts, 0);
  assert.equal(result.tailChanges, 0);
  assert.equal(result.tailZeros, 0);
  console.log('M9.17 NO-CUT HUNTING PROBE', JSON.stringify(result));
});

test('M9.17 complete 20-second drive trace remains deterministic', () => {
  assert.deepEqual(huntingProbe(), huntingProbe());
});

test('M9.17 removes coupling, RPM lag and shift-cut state without introducing a vehicle-specific force path', async () => {
  const source = await readFile(new URL('../src/physics/automatic-powertrain.ts', import.meta.url), 'utf8');
  const profiles = await readFile(new URL('../src/physics/vehicle-profiles.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(`${source}\n${profiles}`, /shiftDuration|shiftTimer|shiftDirection|engineResponseTau|launchCouplingSlipRpm|shiftDriveScale|redlineScale/);
  assert.doesNotMatch(source, /vehicle\.velocity|driftMode|yawRate|Math\.exp|from ['"].*(browser|dev\/)/);
});
