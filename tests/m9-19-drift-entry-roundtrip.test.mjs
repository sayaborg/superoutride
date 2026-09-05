import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  runDriftInputSchedule, entryHoldInput, roundTripInput, summarizeDriftWindow,
} from '../tools/drift-entry-probe.mjs';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import {
  DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION as calibration,
  browserTireCalibrationForGrip, browserTireCalibrationForPeak, browserTireCalibrationForSlide,
  browserTireEffectiveGrip, browserTireEffectiveSlideGrip, browserTirePeakSlipRatio,
  nextBrowserTireGripId, nextBrowserTireSlideId,
} from '../dist/browser/tire-friction-selection.js';

function finiteSupported(rows) {
  for (const r of rows) {
    for (const k of ['beta', 'speed', 'yawRate', 'rpm', 'steer', 'frontLoad', 'rearLoad',
      'frontWheelOmega', 'rearWheelOmega', 'pitch', 'distance']) assert.ok(Number.isFinite(r[k]), k);
    assert.equal(r.surfaceType, 'ASPHALT');
    assert.equal(r.supported, true);
  }
}
function hold(rows, from, to, magnitude, sign = 1, tolerance = 0.5) {
  const w = summarizeDriftWindow(rows, from, to);
  assert.ok(Math.abs(w.beta.mean + magnitude * sign) < tolerance, JSON.stringify(w));
  assert.ok(w.beta.max - w.beta.min < 0.35, JSON.stringify(w));
  assert.ok(Math.abs(w.speed.mean - 15) < 0.25, JSON.stringify(w));
  assert.ok(w.speed.max - w.speed.min < 0.15, JSON.stringify(w));
  return w;
}

test('M9.19 ordinary input enters, traverses 10-15-10 degrees and exits in both directions at refined steps', () => {
  const evidence = [];
  for (const dt of [1 / 60, 1 / 120, 1 / 240]) for (const sign of [1, -1]) {
    const { rows } = runDriftInputSchedule(roundTripInput, { dt, sign });
    finiteSupported(rows);
    const preparation = summarizeDriftWindow(rows, 25, 30);
    assert.ok(Math.abs(preparation.beta.mean) < 3);
    const low = hold(rows, 45, 50, 10, sign);
    const high = hold(rows, 70, 75, 15, sign);
    const back = hold(rows, 100, 105, 10, sign);
    assert.ok(rows.filter(r => r.t >= 50 && r.t <= 105).every(r => Math.abs(r.beta) > 7));
    assert.ok(rows.every(r => !r.rearWheelLocked));
    const exit = rows.find(r => r.t >= 106);
    assert.ok(Math.abs(exit.beta) < 1 && Math.abs(exit.yawRate) < 0.05);
    assert.ok(exit.speed > 14);
    evidence.push({ dt, sign, low, high, returnedLow: back, exitSpeed: exit.speed });
  }
  console.log('M9.19 INPUT-ONLY ROUND TRIP', JSON.stringify(evidence));
});

test('M9.19 entry succeeds across a sampled partial-brake amplitude/duration rectangle', () => {
  for (const amount of [0.2, 0.25, 0.3, 0.35]) for (const duration of [0.2, 0.3, 0.4]) {
    const { rows } = runDriftInputSchedule(t => entryHoldInput(t, amount, duration), { duration: 65 });
    finiteSupported(rows);
    hold(rows, 60, 65, 10);
    assert.ok(rows.every(r => Math.abs(r.beta) < 25));
    assert.ok(rows.every(r => !r.rearWheelLocked));
  }
});

test('M9.19 one-second two-percentage-point steering and throttle errors recover without state correction', () => {
  for (const axis of ['steering', 'throttle']) for (const delta of [-0.02, 0.02]) {
    const { rows } = runDriftInputSchedule(t => {
      const input = entryHoldInput(t);
      return t >= 45 && t < 46 ? { ...input, [axis]: input[axis] + delta } : input;
    }, { duration: 70 });
    finiteSupported(rows);
    assert.ok(rows.filter(r => r.t >= 45).every(r => Math.abs(r.beta) > 7));
    hold(rows, 65, 70, 10);
  }
});

test('M9.19 valid G/S cycling preserves the other displayed axes and invalid selections remain atomic', () => {
  const highSlide = browserTireCalibrationForSlide('2.00', browserTireCalibrationForGrip('4.00', calibration));
  assert.equal(nextBrowserTireGripId(highSlide), '2.00');
  const lowGrip = browserTireCalibrationForGrip('1.20', calibration);
  assert.equal(nextBrowserTireSlideId(lowGrip), '1.00');
  const oneFour = browserTireCalibrationForSlide('1.40', calibration);
  assert.equal(nextBrowserTireSlideId(oneFour), '1.00');
  for (const state of [calibration, lowGrip, oneFour, highSlide]) {
    const before = { ...state };
    const nextG = browserTireCalibrationForGrip(nextBrowserTireGripId(state), state);
    const nextS = browserTireCalibrationForSlide(nextBrowserTireSlideId(state), state);
    assert.ok(Math.abs(browserTirePeakSlipRatio(nextG) - browserTirePeakSlipRatio(state)) < 1e-12);
    assert.ok(Math.abs(browserTireEffectiveSlideGrip(nextG) - browserTireEffectiveSlideGrip(state)) < 1e-12);
    assert.ok(Math.abs(browserTireEffectiveGrip(nextS) - browserTireEffectiveGrip(state)) < 1e-12);
    assert.throws(() => browserTireCalibrationForGrip('1.20', highSlide), /must not exceed/);
    assert.throws(() => browserTireCalibrationForSlide('2.00', lowGrip), /must not exceed/);
    assert.deepEqual(state, before);
  }
  assert.equal(browserTirePeakSlipRatio(browserTireCalibrationForPeak('8', calibration)), browserTirePeakSlipRatio(calibration));
});

test('M9.19 browser calibration uses the common unchanged solver for every production profile', () => {
  for (const { profile } of VEHICLE_CATALOG) {
    const { rows } = runDriftInputSchedule(t => ({
      steering: t < 1 ? 0.2 : t < 2 ? -0.2 : 0,
      throttle: t < 2 ? 0.3 : 0, brake: t >= 3 ? 0.2 : 0,
    }), { profile, duration: 4 });
    finiteSupported(rows);
  }
});

test('M9.19 diagnostic is a consumer with no feedback state or product solver import of its schedule', async () => {
  const tool = await readFile(new URL('../tools/drift-entry-probe.mjs', import.meta.url), 'utf8');
  assert.match(tool, /const command = inputAtTime\(i \* dt\)/);
  assert.doesNotMatch(tool, /vehicle\.(?:yaw|velocityX|velocityZ|frontWheelOmega|rearWheelOmega)\s*=/);
  assert.doesNotMatch(tool, /powertrain\.gear\s*=/);
  for (const name of ['arcade-vehicle-physics', 'tire-wheel', 'automatic-powertrain']) {
    const source = await readFile(new URL(`../src/physics/${name}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /drift-entry-probe|DRIFT_PROBE_|targetSideslip|driftMode/);
  }
});
