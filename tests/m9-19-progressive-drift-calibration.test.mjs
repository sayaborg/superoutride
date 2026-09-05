import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_TIRE_GRIPS, BROWSER_TIRE_PEAKS, BROWSER_TIRE_SLIDES,
  DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION as calibration,
  browserTireCalibrationForGrip, browserTireCalibrationForPeak, browserTireCalibrationForSlide,
  browserTireEffectiveGrip, browserTireEffectiveSlideGrip, browserTirePeakSlipRatio,
  nextBrowserTireGripId, nextBrowserTireSlideId,
} from '../dist/browser/tire-friction-selection.js';
import { evaluateTireForce } from '../dist/physics/tire-wheel.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createM5RecoveryState, updateM5Recovery } from '../dist/gameplay/recovery.js';
import { updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createFlatProbe, forkProbe, cycleInput, directInput, runProbe, summarizeWindow } from '../tools/drift-control-probe.mjs';

const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test('M9.19 preserves old G3/P20 small-slip response while lowering peak, not changing deep S', () => {
  const old = browserTireCalibrationForPeak('20', browserTireCalibrationForGrip('3.00', calibration));
  near(browserTireEffectiveGrip(calibration), 1.2);
  near(browserTirePeakSlipRatio(calibration), 0.08);
  near(browserTireEffectiveSlideGrip(calibration), 1);
  near(calibration.linearStiffnessMultiplier, old.linearStiffnessMultiplier);
  for (const { profile } of VEHICLE_CATALOG) for (const station of [profile.frontStation, profile.rearStation]) {
    const tire = station.tire, R = station.rollingRadius, vx = 30, ref = Math.hypot(vx, tire.lowSpeedRegularization);
    for (const N of [100, 3000, 15000]) for (const sx of [-0.01, 0, 0.01]) {
      const force = c => evaluateTireForce((vx + sx * ref) / R, R, vx, -0.01 * ref, N, 1, tire,
        c.referenceFrictionMultiplier, c.linearStiffnessMultiplier, c.slidingFrictionRatio);
      const f = force(calibration), o = force(old);
      near(f.fx, o.fx); near(f.fy, o.fy); near(f.fmax / o.fmax, 0.4);
    }
  }
});

test('M9.19 every valid selector transition preserves the other axes and skips S greater than G', () => {
  let count = 0;
  for (const g of BROWSER_TIRE_GRIPS) for (const p of BROWSER_TIRE_PEAKS) for (const s of BROWSER_TIRE_SLIDES) {
    if (s.effectiveSlideGrip > g.effectiveGrip) continue;
    const current = browserTireCalibrationForSlide(s.id, browserTireCalibrationForPeak(p.id,
      browserTireCalibrationForGrip(g.id, calibration)));
    const snapshot = { ...current };
    const nextG = browserTireCalibrationForGrip(nextBrowserTireGripId(current), current);
    const nextS = browserTireCalibrationForSlide(nextBrowserTireSlideId(current), current);
    near(browserTirePeakSlipRatio(nextG), p.slipRatio);
    near(browserTireEffectiveSlideGrip(nextG), s.effectiveSlideGrip);
    near(browserTireEffectiveGrip(nextS), g.effectiveGrip);
    near(browserTirePeakSlipRatio(nextS), p.slipRatio);
    for (const c of [current, nextG, nextS]) assert.ok(c.slidingFrictionRatio > 0 && c.slidingFrictionRatio <= 1);
    assert.deepEqual(current, snapshot);
    count++;
  }
  assert.equal(count, 2160);
  const highS = browserTireCalibrationForSlide('2.00', browserTireCalibrationForGrip('4.00', calibration));
  assert.equal(nextBrowserTireGripId(highS), '2.00');
  assert.throws(() => browserTireCalibrationForGrip('1.20', highS), /must not exceed/);
  assert.throws(() => browserTireCalibrationForSlide('1.40', calibration), /must not exceed/);
  const equal = browserTireCalibrationForSlide('1.20', calibration);
  near(equal.slidingFrictionRatio, 1);
  assert.equal(nextBrowserTireSlideId(equal), '1.00');
});

function assertCycle(trace, sign) {
  assert.equal(trace.unsupportedTicks, 0);
  assert.equal(trace.rearLockTicks, 0);
  assert.ok(trace.maxAbsBeta < 30);
  assert.ok(trace.minSpeed > 13.5);
  for (const [a, b, target] of [[55, 62, 10], [76, 84, 15], [100, 110, 10]]) {
    const w = summarizeWindow(trace, a, b);
    near(w.beta.mean, -sign * target, 0.08);
    assert.ok(w.speed.min > 14 && w.speed.max < 16);
    assert.ok(w.rearSx.min > 0.025);
    assert.deepEqual(w.gears, [2]); // Observed, never held or rewritten by the probe.
  }
  for (const r of trace.rows.filter(r => r.t >= 84 && r.t <= 110)) {
    assert.ok(-sign * r.beta > 5, 'partial angle reduction must not terminate the slide');
  }
  for (const r of trace.rows.filter(r => r.t >= 111)) {
    assert.ok(Math.abs(r.beta) < 1);
    assert.ok(Math.abs(r.yawRate) < 0.05);
    assert.ok(r.speed > 13.5);
  }
}

test('M9.19 ordinary input enters, traverses 10-15-10 and exits in both directions at refined steps', () => {
  const old = browserTireCalibrationForPeak('20', browserTireCalibrationForGrip('3.00', calibration));
  const control = runProbe(createFlatProbe({ calibration: old }), 113, t => cycleInput(t));
  assert.ok(control.maxAbsBeta < 8, 'the same inputs at the old default never enter the requested drift');
  console.log('M9.19 OLD-DEFAULT CONTROL', JSON.stringify({ maxAbsBeta: control.maxAbsBeta,
    high: summarizeWindow(control, 76, 84) }));
  const evidence = [];
  for (const hz of [60, 120, 240]) for (const direction of [-1, 1]) {
    const probe = createFlatProbe();
    assert.equal(probe.vehicle.yawRate, 0);
    assert.equal(probe.vehicle.lateralSpeed, 0);
    assert.equal(probe.vehicle.powertrain.engineTorqueMultiplier, 1);
    const trace = runProbe(probe, 113, t => cycleInput(t, { direction }), { hz });
    assertCycle(trace, direction);
    evidence.push({ hz, direction, maxAbsBeta: trace.maxAbsBeta,
      low: summarizeWindow(trace, 55, 62), high: summarizeWindow(trace, 76, 84),
      returned: summarizeWindow(trace, 100, 110), exit: summarizeWindow(trace, 111, 113) });
  }
  console.log('M9.19 UNSEEDED ROUND TRIP', JSON.stringify(evidence));
});

test('M9.19 entry tolerates the stated brake rectangle, not only one pulse', () => {
  const prepared = createFlatProbe();
  runProbe(prepared, 40, t => cycleInput(t));
  const outcomes = [];
  for (const brake of [0.10, 0.20, 0.30]) for (const duration of [0.30, 0.40]) {
    const trace = runProbe(forkProbe(prepared), 35,
      t => t < duration ? directInput(0.63, 0, brake) : directInput(0.63, 0.38));
    const w = summarizeWindow(trace, 30, 35);
    assert.ok(w.beta.min > -12 && w.beta.max < -8);
    assert.ok(w.speed.min > 14 && w.speed.max < 16);
    assert.ok(trace.maxAbsBeta < 30);
    assert.equal(trace.rearLockTicks, 0);
    outcomes.push({ brake, duration, window: w });
  }
  console.log('M9.19 ENTRY RECTANGLE', JSON.stringify(outcomes));
});

test('M9.19 reached drift retains bounded slip under +/-2 percentage-point input errors and release decay', () => {
  const reached = createFlatProbe();
  runProbe(reached, 62, t => cycleInput(t));
  for (const du of [-0.02, 0, 0.02]) for (const dth of [-0.02, 0, 0.02]) {
    const trace = runProbe(forkProbe(reached), 20, () => directInput(0.63 + du, 0.38 + dth));
    const w = summarizeWindow(trace, 15, 20);
    assert.ok(w.beta.min > -14 && w.beta.max < -7);
    assert.ok(w.speed.min > 13.5 && w.speed.max < 17);
    assert.ok(trace.rows.every(r => Math.abs(r.beta) > 5 && Math.abs(r.beta) < 25));
  }
  const released = runProbe(forkProbe(reached), 3,
    () => ({ steering: 0, throttle: 0, brake: 0 })); // Real pointer release / ordinary rate-limited neutral.
  assert.ok(released.rows.filter(r => r.t >= 1).every(r => Math.abs(r.beta) < 1 && Math.abs(r.yawRate) < 0.05));
});

test('M9.19 default stays finite on all nine profiles under ordinary digital inputs and recovery', () => {
  for (const { profile } of VEHICLE_CATALOG) {
    const p = createFlatProbe({ profile, initialSpeed: 30 });
    const recovery = createM5RecoveryState(p.vehicle);
    for (let tick = 0; tick < 360; tick++) {
      const input = { steering: tick < 120 ? 0 : tick < 240 ? 1 : -1,
        throttle: tick < 300, brake: tick >= 300 };
      updateArcadeVehicle(p.guide, p.height, p.surface, p.vehicle, input, 1 / 60);
      assert.ok([p.vehicle.speed, p.vehicle.yawRate, p.vehicle.pitch, p.vehicle.y].every(Number.isFinite));
      updateM5Recovery(recovery, p.guide, p.height, p.surface, p.vehicle, 1 / 60);
    }
    assert.equal(p.vehicle.profile, profile);
  }
});
