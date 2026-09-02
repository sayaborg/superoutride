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

test('M9.12 exposes centered GRIP PEAK and retained SLIDE comparison tables', () => {
  assert.deepEqual(BROWSER_TIRE_GRIPS.map(({ id }) => id), ['1.60', '1.80', '2.00', '2.20', '2.40']);
  assert.deepEqual(BROWSER_TIRE_PEAKS.map(({ id }) => id), ['16', '18', '20', '22', '24']);
  assert.deepEqual(BROWSER_TIRE_SLIDES.map(({ id }) => id), ['70', '75', '80', '85', '90']);
  assert.equal(BROWSER_TIRE_GRIP_CYCLE_CODE, 'KeyH');
  assert.equal(BROWSER_TIRE_PEAK_CYCLE_CODE, 'KeyJ');
  assert.equal(BROWSER_TIRE_SLIDE_CYCLE_CODE, 'KeyG');
});

test('M9.12 browser default is GRIP 2.00 PEAK 20 SLIDE 80', () => {
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

test('each M9.12 axis changes only its displayed physical characteristic', () => {
  const start = { ...DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION };
  const startPeak = browserTirePeakSlipRatio(start);
  const startSlide = start.slidingFrictionRatio;

  const highGrip = browserTireCalibrationForGrip('2.40', start);
  assert.ok(Math.abs(browserTireEffectiveGrip(highGrip) - 2.40) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(highGrip) - startPeak) < 1e-12);
  assert.equal(highGrip.slidingFrictionRatio, startSlide);

  const latePeak = browserTireCalibrationForPeak('24', highGrip);
  assert.ok(Math.abs(browserTireEffectiveGrip(latePeak) - 2.40) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(latePeak) - 0.24) < 1e-12);
  assert.equal(latePeak.slidingFrictionRatio, startSlide);

  const highSlide = browserTireCalibrationForSlide('90', latePeak);
  assert.ok(Math.abs(browserTireEffectiveGrip(highSlide) - 2.40) < 1e-12);
  assert.ok(Math.abs(browserTirePeakSlipRatio(highSlide) - 0.24) < 1e-12);
  assert.equal(highSlide.slidingFrictionRatio, 0.90);
});

test('GRIP changes peak force height while PEAK changes location and SLIDE changes only deep lateral plateau', () => {
  const base = calibrationFor('2.00', '20', '80');
  const highGrip = calibrationFor('2.40', '20', '80');
  const latePeak = calibrationFor('2.00', '24', '80');
  const highSlide = calibrationFor('2.00', '20', '90');

  const basePeak = lateralForceAtSlip(base, browserTirePeakSlipRatio(base));
  const highGripPeak = lateralForceAtSlip(highGrip, browserTirePeakSlipRatio(highGrip));
  assert.ok(Math.abs(Math.abs(basePeak.fy) - basePeak.fmax) < 1e-9);
  assert.ok(Math.abs(Math.abs(highGripPeak.fy) - highGripPeak.fmax) < 1e-9);
  assert.ok(highGripPeak.fmax > basePeak.fmax);

  const latePeakForce = lateralForceAtSlip(latePeak, 0.24);
  assert.ok(Math.abs(Math.abs(latePeakForce.fy) - latePeakForce.fmax) < 1e-9);
  assert.ok(Math.abs(latePeakForce.fmax - basePeak.fmax) < 1e-9);

  const baseDeep = lateralForceAtSlip(base, 1);
  const highSlideDeep = lateralForceAtSlip(highSlide, 1);
  assert.ok(Math.abs(Math.abs(baseDeep.fy) / baseDeep.fmax - 0.80) < 1e-12);
  assert.ok(Math.abs(Math.abs(highSlideDeep.fy) / highSlideDeep.fmax - 0.90) < 1e-12);
});

test('complete GRIP x PEAK x SLIDE product stays finite in the retained scalar wheel solve', () => {
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

test('M9.12 selector layer adds no tire state or vehicle/drift branch', async () => {
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

test('selector cycles wrap deterministically', () => {
  let calibration = calibrationFor('2.40', '24', '90');
  assert.equal(nextBrowserTireGripId(calibration), '1.60');
  assert.equal(nextBrowserTirePeakId(calibration), '16');
  assert.equal(nextBrowserTireSlideId(calibration), '70');
});
