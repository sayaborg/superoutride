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
const normalLoad = tire.cornerStiffness / tire.normalizedStiffness;

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

test('M9.14 expands GRIP PEAK and SLIDE diagnostic ranges without changing axis ownership', () => {
  assert.deepEqual(BROWSER_TIRE_GRIPS.map(({ id }) => id), [
    '2.00', '2.20', '2.40', '2.60', '2.80', '3.00', '3.20', '3.40', '3.60', '3.80', '4.00',
  ]);
  assert.deepEqual(BROWSER_TIRE_PEAKS.map(({ id }) => id), [
    '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40',
    '42', '44', '46', '48', '50', '52', '54', '56', '58', '60',
  ]);
  assert.deepEqual(BROWSER_TIRE_SLIDES.map(({ id }) => id), [
    '60', '65', '70', '75', '80', '85', '90', '95', '100',
  ]);
  assert.equal(BROWSER_TIRE_GRIP_CYCLE_CODE, 'KeyH');
  assert.equal(BROWSER_TIRE_PEAK_CYCLE_CODE, 'KeyJ');
  assert.equal(BROWSER_TIRE_SLIDE_CYCLE_CODE, 'KeyG');
});

test('M9.14 browser default remains GRIP 2.00 PEAK 20 SLIDE 80', () => {
  const calibration = DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION;
  assert.ok(Math.abs(browserTireEffectiveGrip(calibration) - 2.00) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(calibration) - 0.20) < 1e-12);
  assert.equal(calibration.slidingFrictionRatio, 0.80);
  assert.equal(browserTireGripIdForCalibration(calibration), '2.00');
  assert.equal(browserTirePeakIdForCalibration(calibration), '20');
  assert.equal(browserTireSlideIdForCalibration(calibration), '80');
  assert.equal(formatTireGripSelector(calibration), 'GRIP [H] 2.00');
  assert.equal(formatTirePeakSelector(calibration), 'PEAK [J] 20%/11.3°');
  assert.equal(formatTireSlideSelector(calibration), 'SLIDE [G] 80%');
});

test('each M9.12 axis remains independent at the M9.14 diagnostic extremes', () => {
  const start = { ...DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION };
  const startPeak = browserTirePeakSlipRatio(start);
  const startSlide = start.slidingFrictionRatio;

  const highGrip = browserTireCalibrationForGrip('4.00', start);
  assert.ok(Math.abs(browserTireEffectiveGrip(highGrip) - 4.00) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(highGrip) - startPeak) < 1e-12);
  assert.equal(highGrip.slidingFrictionRatio, startSlide);

  const latePeak = browserTireCalibrationForPeak('60', highGrip);
  assert.ok(Math.abs(browserTireEffectiveGrip(latePeak) - 4.00) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(latePeak) - 0.60) < 1e-12);
  assert.equal(latePeak.slidingFrictionRatio, startSlide);

  const highSlide = browserTireCalibrationForSlide('100', latePeak);
  assert.ok(Math.abs(browserTireEffectiveGrip(highSlide) - 4.00) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(highSlide) - 0.60) < 1e-12);
  assert.equal(highSlide.slidingFrictionRatio, 1.00);
});

test('GRIP changes peak force height while PEAK changes location and SLIDE spans 60 to 100 percent plateau', () => {
  const base = calibrationFor('2.00', '20', '80');
  const highGrip = calibrationFor('4.00', '20', '80');
  const latePeak = calibrationFor('2.00', '60', '80');
  const lowSlide = calibrationFor('2.00', '20', '60');
  const fullSlide = calibrationFor('2.00', '20', '100');

  const basePeak = lateralForceAtSlip(base, browserTirePeakSlipRatio(base));
  const highGripPeak = lateralForceAtSlip(highGrip, browserTirePeakSlipRatio(highGrip));
  assert.ok(Math.abs(Math.abs(basePeak.fy) - basePeak.fmax) < 1e-9);
  assert.ok(Math.abs(Math.abs(highGripPeak.fy) - highGripPeak.fmax) < 1e-9);
  assert.ok(highGripPeak.fmax > basePeak.fmax);

  const latePeakForce = lateralForceAtSlip(latePeak, 0.60);
  assert.ok(Math.abs(Math.abs(latePeakForce.fy) - latePeakForce.fmax) < 1e-9);
  assert.ok(Math.abs(latePeakForce.fmax - basePeak.fmax) < 1e-9);

  const lowSlideDeep = lateralForceAtSlip(lowSlide, 1);
  const fullSlideDeep = lateralForceAtSlip(fullSlide, 1);
  assert.ok(Math.abs(Math.abs(lowSlideDeep.fy) / lowSlideDeep.fmax - 0.60) < 1e-12);
  assert.ok(Math.abs(Math.abs(fullSlideDeep.fy) / fullSlideDeep.fmax - 1.00) < 1e-12);
});

test('complete M9.14 GRIP x PEAK x SLIDE product stays finite in the retained scalar wheel solve', () => {
  for (const { id: gripId } of BROWSER_TIRE_GRIPS) {
    for (const { id: peakId } of BROWSER_TIRE_PEAKS) {
      for (const { id: slideId } of BROWSER_TIRE_SLIDES) {
        const calibration = calibrationFor(gripId, peakId, slideId);
        const result = solveWheelOmega({
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
        });
        for (const value of [
          result.omega,
          result.omegaDot,
          result.tire.fx,
          result.tire.fy,
          result.tire.rho,
        ]) assert.ok(Number.isFinite(value), `${gripId}/${peakId}/${slideId}`);
      }
    }
  }
});

test('keyboard and compact touch buttons cycle the same three tire authorities', () => {
  const fakeDocument = new FakeDocument();
  const container = new FakeContainer();
  const vehicle = {
    tireFrictionCalibration: { ...DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION },
  };
  const controls = mountBrowserTireFrictionControls(container, () => vehicle, fakeDocument);
  assert.equal(container.children.length, 3);
  assert.deepEqual(container.children.map(({ textContent }) => textContent), ['G 2.00', 'P 20', 'S 80']);

  assert.equal(controls.handleKey('KeyH'), true);
  assert.equal(browserTireGripIdForCalibration(vehicle.tireFrictionCalibration), '2.20');
  assert.equal(browserTirePeakIdForCalibration(vehicle.tireFrictionCalibration), '20');
  assert.equal(browserTireSlideIdForCalibration(vehicle.tireFrictionCalibration), '80');

  assert.equal(controls.handleKey('KeyJ'), true);
  assert.equal(browserTirePeakIdForCalibration(vehicle.tireFrictionCalibration), '22');
  assert.equal(controls.handleKey('KeyG'), true);
  assert.equal(browserTireSlideIdForCalibration(vehicle.tireFrictionCalibration), '85');
  assert.equal(controls.handleKey('KeyT'), false);

  container.children[0].click();
  assert.equal(browserTireGripIdForCalibration(vehicle.tireFrictionCalibration), '2.40');
  container.children[1].click();
  assert.equal(browserTirePeakIdForCalibration(vehicle.tireFrictionCalibration), '24');
  container.children[2].click();
  assert.equal(browserTireSlideIdForCalibration(vehicle.tireFrictionCalibration), '90');

  assert.deepEqual(
    createMobileTireCalibrationSelectorModel(DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION)
      .map(({ axis, label }) => ({ axis, label })),
    [
      { axis: 'GRIP', label: 'G 2.00' },
      { axis: 'PEAK', label: 'P 20' },
      { axis: 'SLIDE', label: 'S 80' },
    ],
  );
});

test('M9.14 selector layer adds no tire state or vehicle/drift branch', async () => {
  const [selection, calibration, tireSource] = await Promise.all([
    readFile(new URL('../src/browser/tire-friction-selection.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/tire-friction-calibration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/tire-wheel.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(calibration, /referenceFrictionMultiplier/);
  assert.match(calibration, /linearStiffnessMultiplier/);
  assert.match(calibration, /slidingFrictionRatio/);
  assert.doesNotMatch(calibration, /gripId|peakId|slideId|peakSlip/);
  for (const source of [selection, calibration, tireSource]) {
    assert.doesNotMatch(source, /driftMode|driftAssist|targetSideslip|profile\.id/);
  }
});

test('M9.14 selector cycles wrap deterministically from expanded maxima', () => {
  const calibration = calibrationFor('4.00', '60', '100');
  assert.equal(nextBrowserTireGripId(calibration), '2.00');
  assert.equal(nextBrowserTirePeakId(calibration), '20');
  assert.equal(nextBrowserTireSlideId(calibration), '60');
});
