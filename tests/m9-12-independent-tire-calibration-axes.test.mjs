import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mountBrowserTireFrictionControls } from '../dist/browser/tire-friction-controls.js';
import {
  BROWSER_TIRE_GRIPS,
  BROWSER_TIRE_PEAKS,
  BROWSER_TIRE_SLIDES,
  BROWSER_TIRE_GRIP_CYCLE_CODE,
  BROWSER_TIRE_PEAK_CYCLE_CODE,
  BROWSER_TIRE_SLIDE_CYCLE_CODE,
  DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  browserTireCalibrationForGrip,
  browserTireCalibrationForPeak,
  browserTireCalibrationForSlide,
  browserTireEffectiveGrip,
  browserTireEffectiveSlideGrip,
  browserTireGripIdForCalibration,
  browserTirePeakIdForCalibration,
  browserTirePeakSlipRatio,
  browserTireSlideIdForCalibration,
  formatTireGripSelector,
  formatTirePeakSelector,
  formatTireSlideSelector,
  nextBrowserTireGripId,
  nextBrowserTirePeakId,
  nextBrowserTireSlideId,
} from '../dist/browser/tire-friction-selection.js';
import { createMobileTireCalibrationSelectorModel } from '../dist/browser/mobile-selector-controls.js';
import { evaluateTireForce, solveWheelOmega } from '../dist/physics/tire-wheel.js';
import { FERRARI_TESTAROSSA_VEHICLE_PROFILE } from '../dist/physics/vehicle-profiles.js';
import { VEHICLE_GRAVITY } from '../dist/physics/vehicle-dynamics.js';

class FakeButton {
  type = '';
  className = '';
  textContent = '';
  attributes = new Map();
  listeners = new Map();
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.(); }
}

class FakeContainer {
  children = [];
  replaceChildren(...children) { this.children = children; }
}

class FakeDocument {
  createElement(name) {
    assert.equal(name, 'button');
    return new FakeButton();
  }
}

const tire = FERRARI_TESTAROSSA_VEHICLE_PROFILE.frontStation.tire;
const profile = FERRARI_TESTAROSSA_VEHICLE_PROFILE;
const normalLoad = profile.mass * VEHICLE_GRAVITY * profile.rearAxle / (profile.frontAxle + profile.rearAxle);

function calibrationFor(gripId, peakId, slideId) {
  let calibration = { ...DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION };
  calibration = { ...browserTireCalibrationForGrip(gripId, calibration) };
  calibration = { ...browserTireCalibrationForPeak(peakId, calibration) };
  calibration = { ...browserTireCalibrationForSlide(slideId, calibration) };
  return calibration;
}

function lateralForceAtSlip(calibration, slipRatio) {
  const longitudinalVelocity = 30;
  const referenceSpeed = Math.sqrt(
    longitudinalVelocity ** 2 + tire.lowSpeedRegularization ** 2,
  );
  return evaluateTireForce(
    longitudinalVelocity / 0.33,
    0.33,
    longitudinalVelocity,
    -referenceSpeed * slipRatio,
    normalLoad,
    1,
    tire,
    calibration.referenceFrictionMultiplier,
    calibration.linearStiffnessMultiplier,
    calibration.slidingFrictionRatio,
  );
}

test('M9.19 exposes lower G/P while retaining all historical tire comparisons', () => {
  assert.deepEqual(BROWSER_TIRE_GRIPS.map(({ id }) => id), [
    '1.20', '1.40', '1.50', '1.60', '1.80', '2.00', '2.20', '2.40', '2.60', '2.80', '3.00', '3.20', '3.40', '3.60', '3.80', '4.00',
  ]);
  assert.deepEqual(BROWSER_TIRE_PEAKS.map(({ id }) => id), [
    '6', '8', '10', '12', '14', '16', '18', '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40',
    '42', '44', '46', '48', '50', '52', '54', '56', '58', '60',
  ]);
  assert.deepEqual(BROWSER_TIRE_SLIDES.map(({ id }) => id), [
    '1.00', '1.20', '1.40', '1.60', '1.80', '2.00',
  ]);
  assert.equal(BROWSER_TIRE_GRIP_CYCLE_CODE, 'KeyH');
  assert.equal(BROWSER_TIRE_PEAK_CYCLE_CODE, 'KeyJ');
  assert.equal(BROWSER_TIRE_SLIDE_CYCLE_CODE, 'KeyG');
});

test('M9.19 browser starts at G1.50 P8 S1.20', () => {
  const calibration = DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION;
  assert.ok(Math.abs(browserTireEffectiveGrip(calibration) - 1.50) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(calibration) - 0.08) < 1e-12);
  assert.ok(Math.abs(browserTireEffectiveSlideGrip(calibration) - 1.20) < 1e-12);
  assert.ok(Math.abs(calibration.slidingFrictionRatio - 0.8) < 1e-12);
  assert.equal(browserTireGripIdForCalibration(calibration), '1.50');
  assert.equal(browserTirePeakIdForCalibration(calibration), '8');
  assert.equal(browserTireSlideIdForCalibration(calibration), '1.20');
  assert.equal(formatTireGripSelector(calibration), 'GRIP [H] 1.50');
  assert.equal(formatTirePeakSelector(calibration), 'PEAK [J] 8%/4.6°');
  assert.equal(formatTireSlideSelector(calibration), 'SLIDE [G] 1.20');
});

test('G P and absolute S remain independent at the M9.15 diagnostic extremes', () => {
  const start = { ...DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION };
  const startPeak = browserTirePeakSlipRatio(start);
  const startSlide = browserTireEffectiveSlideGrip(start);

  const highGrip = browserTireCalibrationForGrip('4.00', start);
  assert.ok(Math.abs(browserTireEffectiveGrip(highGrip) - 4.00) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(highGrip) - startPeak) < 1e-12);
  assert.ok(Math.abs(browserTireEffectiveSlideGrip(highGrip) - startSlide) < 1e-12);
  assert.ok(Math.abs(highGrip.slidingFrictionRatio - startSlide / 4) < 1e-12);

  const latePeak = browserTireCalibrationForPeak('60', highGrip);
  assert.ok(Math.abs(browserTireEffectiveGrip(latePeak) - 4.00) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(latePeak) - 0.60) < 1e-12);
  assert.ok(Math.abs(browserTireEffectiveSlideGrip(latePeak) - startSlide) < 1e-12);

  const highSlide = browserTireCalibrationForSlide('2.00', latePeak);
  assert.ok(Math.abs(browserTireEffectiveGrip(highSlide) - 4.00) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(highSlide) - 0.60) < 1e-12);
  assert.ok(Math.abs(browserTireEffectiveSlideGrip(highSlide) - 2.00) < 1e-12);
  assert.ok(Math.abs(highSlide.slidingFrictionRatio - 0.50) < 1e-12);
});

test('G changes peak height P changes location and absolute S fixes deep-slide force', () => {
  const base = calibrationFor('3.00', '20', '1.00');
  const highGrip = calibrationFor('4.00', '20', '1.00');
  const latePeak = calibrationFor('3.00', '60', '1.00');
  const highSlide = calibrationFor('3.00', '20', '2.00');

  const basePeak = lateralForceAtSlip(base, browserTirePeakSlipRatio(base));
  const highGripPeak = lateralForceAtSlip(highGrip, browserTirePeakSlipRatio(highGrip));
  assert.ok(Math.abs(Math.abs(basePeak.fy) / normalLoad - 3.00) < 1e-12);
  assert.ok(Math.abs(Math.abs(highGripPeak.fy) / normalLoad - 4.00) < 1e-12);

  const latePeakForce = lateralForceAtSlip(latePeak, 0.60);
  assert.ok(Math.abs(Math.abs(latePeakForce.fy) / normalLoad - 3.00) < 1e-12);

  const baseDeep = lateralForceAtSlip(base, 2);
  const highGripDeep = lateralForceAtSlip(highGrip, 2);
  const highSlideDeep = lateralForceAtSlip(highSlide, 2);
  assert.ok(Math.abs(Math.abs(baseDeep.fy) / normalLoad - 1.00) < 1e-12);
  assert.ok(Math.abs(Math.abs(highGripDeep.fy) / normalLoad - 1.00) < 1e-12);
  assert.ok(Math.abs(Math.abs(highSlideDeep.fy) / normalLoad - 2.00) < 1e-12);
});

test('complete admissible M9.19 product stays finite and deterministic and invalid pairs are rejected', () => {
  let count = 0, rejected = 0;
  for (const { id: gripId } of BROWSER_TIRE_GRIPS) {
    for (const { id: peakId } of BROWSER_TIRE_PEAKS) {
      for (const { id: slideId } of BROWSER_TIRE_SLIDES) {
        if (Number(slideId) > Number(gripId)) {
          assert.throws(() => calibrationFor(gripId, peakId, slideId), /must not exceed/);
          rejected += 1;
          continue;
        }
        const calibration = calibrationFor(gripId, peakId, slideId);
        const wheelInput = {
          omegaPrevious: 125,
          inertia: 3.4,
          rollingRadius: 0.331,
          longitudinalVelocity: 30,
          lateralVelocity: -22,
          normalLoad,
          gripFactor: 1,
          ...calibration,
          rollingResistance: 0,
          driveTorque: 2200,
          brakeTorque: 0,
          dt: 1 / 720,
          tire,
        };
        const result = solveWheelOmega(wheelInput);
        assert.deepEqual(result, solveWheelOmega(wheelInput));
        for (const value of [
          result.omega,
          result.omegaDot,
          result.tire.fx,
          result.tire.fy,
          result.tire.rho,
        ]) assert.ok(Number.isFinite(value), `${gripId}/${peakId}/${slideId}`);
        count += 1;
      }
    }
  }
  assert.equal(count, 2324);
  assert.equal(rejected, 364);
});

test('keyboard and compact touch buttons cycle the same three tire authorities', () => {
  const fakeDocument = new FakeDocument();
  const container = new FakeContainer();
  const vehicle = {
    tireFrictionCalibration: { ...DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION },
  };
  const controls = mountBrowserTireFrictionControls(container, () => vehicle, fakeDocument);
  assert.equal(container.children.length, 3);
  assert.deepEqual(container.children.map(({ textContent }) => textContent), ['G 1.50', 'P 8', 'S 1.20']);

  assert.equal(controls.handleKey('KeyH'), true);
  assert.equal(browserTireGripIdForCalibration(vehicle.tireFrictionCalibration), '1.60');
  assert.equal(browserTirePeakIdForCalibration(vehicle.tireFrictionCalibration), '8');
  assert.equal(browserTireSlideIdForCalibration(vehicle.tireFrictionCalibration), '1.20');

  assert.equal(controls.handleKey('KeyJ'), true);
  assert.equal(browserTirePeakIdForCalibration(vehicle.tireFrictionCalibration), '10');
  assert.equal(controls.handleKey('KeyG'), true);
  assert.equal(browserTireSlideIdForCalibration(vehicle.tireFrictionCalibration), '1.40');
  assert.equal(controls.handleKey('KeyT'), false);

  container.children[0].click();
  assert.equal(browserTireGripIdForCalibration(vehicle.tireFrictionCalibration), '1.80');
  assert.equal(browserTireSlideIdForCalibration(vehicle.tireFrictionCalibration), '1.40');
  container.children[1].click();
  assert.equal(browserTirePeakIdForCalibration(vehicle.tireFrictionCalibration), '12');
  container.children[2].click();
  assert.equal(browserTireSlideIdForCalibration(vehicle.tireFrictionCalibration), '1.60');

  assert.deepEqual(
    createMobileTireCalibrationSelectorModel(DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION)
      .map(({ axis, label }) => ({ axis, label })),
    [
      { axis: 'GRIP', label: 'G 1.50' },
      { axis: 'PEAK', label: 'P 8' },
      { axis: 'SLIDE', label: 'S 1.20' },
    ],
  );
});

test('M9.15 selector reuses the existing ratio scalar without tire state or drift branches', async () => {
  const [selection, calibration, tireSource] = await Promise.all([
    readFile(new URL('../src/browser/tire-friction-selection.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/tire-friction-calibration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/tire-wheel.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(calibration, /referenceFrictionMultiplier/);
  assert.match(calibration, /linearStiffnessMultiplier/);
  assert.match(calibration, /slidingFrictionRatio/);
  assert.match(selection, /browserTireEffectiveSlideGrip/);
  assert.match(selection, /slideToPeakRatio/);
  assert.doesNotMatch(calibration, /gripId|peakId|slideId|peakSlip|absoluteSlide/);
  for (const source of [selection, calibration, tireSource]) {
    assert.doesNotMatch(source, /driftMode|driftAssist|targetSideslip|profile\.id/);
  }
});

test('M9.15 selector cycles wrap deterministically from expanded maxima', () => {
  const calibration = calibrationFor('4.00', '60', '2.00');
  assert.equal(nextBrowserTireGripId(calibration), '2.00');
  assert.equal(nextBrowserTirePeakId(calibration), '6');
  assert.equal(nextBrowserTireSlideId(calibration), '1.00');
});
