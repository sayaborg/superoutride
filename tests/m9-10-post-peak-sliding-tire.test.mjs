import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mountBrowserTireFrictionControls } from '../dist/browser/tire-friction-controls.js';
import {
  BROWSER_TIRE_CHARACTERISTIC_PRESETS,
  BROWSER_TIRE_FRICTION_CYCLE_CODE,
  DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER,
  M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER,
  browserTirePresetCalibration,
  browserTirePresetIdForCalibration,
  formatTirePresetSelector,
  nextBrowserTirePresetId,
} from '../dist/browser/tire-friction-selection.js';
import {
  createMobileTireFrictionSelectorModel,
} from '../dist/browser/mobile-selector-controls.js';
import {
  createArcadeTireFrictionCalibration,
  setArcadeVehicleTireFrictionCalibration,
} from '../dist/physics/tire-friction-calibration.js';
import {
  evaluateTireForce,
  lateralPostPeakScale,
  solveWheelOmega,
} from '../dist/physics/tire-wheel.js';
import {
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
} from '../dist/physics/vehicle-profiles.js';

class FakeClassList {
  values = new Set();
  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
  }
}

class FakeButton {
  type = '';
  className = '';
  textContent = '';
  classList = new FakeClassList();
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

function forceAtSlipAngle(calibration, angleDegrees, wheelSlipSpeed = 0) {
  const longitudinalVelocity = 30;
  const referenceSpeed = Math.sqrt(
    longitudinalVelocity ** 2 + tire.lowSpeedRegularization ** 2,
  );
  const lateralVelocity = -referenceSpeed * Math.tan(angleDegrees * Math.PI / 180);
  const normalLoad = tire.cornerStiffness / tire.normalizedStiffness;
  const rollingRadius = 0.33;
  const omega = (longitudinalVelocity + wheelSlipSpeed) / rollingRadius;
  return evaluateTireForce(
    omega,
    rollingRadius,
    longitudinalVelocity,
    lateralVelocity,
    normalLoad,
    1,
    tire,
    calibration.referenceFrictionMultiplier,
    calibration.linearStiffnessMultiplier,
    calibration.slidingFrictionRatio,
  );
}

test('M9.10 browser choices share the exact former TIRE 2 peak and vary only sliding plateau', () => {
  assert.deepEqual(
    BROWSER_TIRE_CHARACTERISTIC_PRESETS.map(({ id, label, calibration }) => ({
      id,
      label,
      slidingFrictionRatio: calibration.slidingFrictionRatio,
    })),
    [
      { id: '100', label: '100', slidingFrictionRatio: 1.00 },
      { id: '85', label: '85', slidingFrictionRatio: 0.85 },
      { id: '80', label: '80', slidingFrictionRatio: 0.80 },
      { id: '75', label: '75', slidingFrictionRatio: 0.75 },
      { id: '70', label: '70', slidingFrictionRatio: 0.70 },
    ],
  );
  for (const { calibration } of BROWSER_TIRE_CHARACTERISTIC_PRESETS) {
    assert.equal(
      calibration.referenceFrictionMultiplier,
      M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER,
    );
    assert.equal(
      calibration.linearStiffnessMultiplier,
      M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER,
    );
  }
  assert.deepEqual(
    DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
    browserTirePresetCalibration('100'),
  );
  assert.equal(BROWSER_TIRE_FRICTION_CYCLE_CODE, 'KeyG');
  assert.equal(nextBrowserTirePresetId(browserTirePresetCalibration('100')), '85');
  assert.equal(nextBrowserTirePresetId(browserTirePresetCalibration('85')), '80');
  assert.equal(nextBrowserTirePresetId(browserTirePresetCalibration('80')), '75');
  assert.equal(nextBrowserTirePresetId(browserTirePresetCalibration('75')), '70');
  assert.equal(nextBrowserTirePresetId(browserTirePresetCalibration('70')), '100');
  assert.equal(formatTirePresetSelector(browserTirePresetCalibration('75')), 'SLIDE [G] 75%');
  assert.equal(
    formatTirePresetSelector(createArcadeTireFrictionCalibration()),
    'SLIDE [G] 100%',
  );
});

test('M9.10 preserves the 12 degree TIRE 2 peak for every slide choice', () => {
  const peakForces = BROWSER_TIRE_CHARACTERISTIC_PRESETS.map(({ calibration }) => (
    forceAtSlipAngle(calibration, 12)
  ));
  const reference = peakForces[0];
  assert.ok(Math.abs(reference.rho - 1.26) < 1e-12);
  assert.ok(Math.abs(Math.abs(reference.fy) - reference.fmax) < 1e-9);
  for (const force of peakForces.slice(1)) {
    assert.ok(Math.abs(force.rho - reference.rho) < 1e-12);
    assert.ok(Math.abs(force.fmax - reference.fmax) < 1e-9);
    assert.ok(Math.abs(force.fy - reference.fy) < 1e-9);
  }
});

test('M9.10 falls C1 from peak to the selected large-angle sliding plateau', () => {
  const peak = 2 - tire.rhoKnee;
  const width = peak - tire.rhoKnee;
  const plateau = peak + width;
  assert.equal(lateralPostPeakScale(peak, tire.rhoKnee, 0.70), 1);
  const midway = lateralPostPeakScale(peak + width * 0.5, tire.rhoKnee, 0.70);
  assert.ok(Math.abs(midway - 0.85) < 1e-12);
  assert.equal(lateralPostPeakScale(plateau, tire.rhoKnee, 0.70), 0.70);
  assert.equal(lateralPostPeakScale(plateau + 5, tire.rhoKnee, 0.70), 0.70);

  const deep100 = forceAtSlipAngle(browserTirePresetCalibration('100'), 30);
  for (const id of ['85', '80', '75', '70']) {
    const deep = forceAtSlipAngle(browserTirePresetCalibration(id), 30);
    const expectedRatio = Number(id) / 100;
    assert.ok(Math.abs(Math.abs(deep.fy) / Math.abs(deep100.fy) - expectedRatio) < 1e-12);
    assert.ok(Math.abs(deep.fx) < 1e-12);
  }
});

test('M9.10 lateral post-peak scale leaves pure longitudinal tire behavior unchanged', () => {
  const forces = BROWSER_TIRE_CHARACTERISTIC_PRESETS.map(({ calibration }) => (
    forceAtSlipAngle(calibration, 0, 25)
  ));
  const reference = forces[0];
  assert.ok(Math.abs(reference.fx) > 0);
  for (const force of forces.slice(1)) {
    assert.ok(Math.abs(force.fx - reference.fx) < 1e-9);
    assert.ok(Math.abs(force.fy) < 1e-12);
  }
});

test('M9.10 slide ratio remains compatible with the unique scalar implicit wheel solve', () => {
  const normalLoad = tire.cornerStiffness / tire.normalizedStiffness;
  for (const { calibration } of BROWSER_TIRE_CHARACTERISTIC_PRESETS) {
    const input = {
      omegaPrevious: 125,
      inertia: 3.4,
      rollingRadius: 0.331,
      longitudinalVelocity: 30,
      lateralVelocity: -22,
      normalLoad,
      gripFactor: 1,
      referenceFrictionMultiplier: calibration.referenceFrictionMultiplier,
      linearStiffnessMultiplier: calibration.linearStiffnessMultiplier,
      slidingFrictionRatio: calibration.slidingFrictionRatio,
      rollingResistance: 0,
      driveTorque: 2200,
      brakeTorque: 0,
      dt: 1 / 720,
      tire,
    };
    const a = solveWheelOmega(input);
    const b = solveWheelOmega(input);
    for (const value of [a.omega, a.omegaDot, a.tire.fx, a.tire.fy, a.tire.rho]) {
      assert.ok(Number.isFinite(value));
    }
    assert.deepEqual(a, b);
  }
});

test('M9.10 calibration is atomic and rejects invalid sliding ratios without partial mutation', () => {
  const owner = {
    tireFrictionCalibration: createArcadeTireFrictionCalibration(
      browserTirePresetCalibration('75'),
    ),
  };
  const before = { ...owner.tireFrictionCalibration };
  for (const invalid of [0, -0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleTireFrictionCalibration(owner, {
        ...browserTirePresetCalibration('70'),
        slidingFrictionRatio: invalid,
      }),
      /sliding-friction ratio/,
    );
    assert.deepEqual(owner.tireFrictionCalibration, before);
  }
  assert.deepEqual(createArcadeTireFrictionCalibration(), {
    referenceFrictionMultiplier: 1,
    linearStiffnessMultiplier: 1,
    slidingFrictionRatio: 1,
  });
});

test('M9.10 keyboard and direct selector expose all five slide ratios from one table', () => {
  const fakeDocument = new FakeDocument();
  const container = new FakeContainer();
  let vehicle = {
    tireFrictionCalibration: { ...browserTirePresetCalibration('100') },
  };
  const controls = mountBrowserTireFrictionControls(container, () => vehicle, fakeDocument);
  assert.equal(container.children.length, 5);
  assert.equal(controls.handleKey('KeyG'), true);
  assert.equal(browserTirePresetIdForCalibration(vehicle.tireFrictionCalibration), '85');
  assert.equal(controls.handleKey('KeyT'), false);

  vehicle = { tireFrictionCalibration: { ...browserTirePresetCalibration('80') } };
  container.children[4].click();
  assert.equal(browserTirePresetIdForCalibration(vehicle.tireFrictionCalibration), '70');
  assert.equal(container.children[4].attributes.get('aria-pressed'), 'true');

  assert.deepEqual(
    createMobileTireFrictionSelectorModel('75').map(({ value, label, active }) => ({
      value,
      label,
      active,
    })),
    [
      { value: '100', label: '100', active: false },
      { value: '85', label: '85', active: false },
      { value: '80', label: '80', active: false },
      { value: '75', label: '75', active: true },
      { value: '70', label: '70', active: false },
    ],
  );
});

test('M9.10 post-peak law is tire constitutive behavior, not a drift or vehicle mode', async () => {
  const [tireSource, solverSource, calibrationSource, selectionSource] = await Promise.all([
    readFile(new URL('../src/physics/tire-wheel.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/tire-friction-calibration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/tire-friction-selection.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(tireSource, /Math\.abs\(demand\.dy\) \/ fmax/);
  assert.match(tireSource, /lateralPostPeakScale/);
  assert.match(solverSource, /vehicle\.tireFrictionCalibration\.slidingFrictionRatio/);
  for (const source of [tireSource, solverSource, calibrationSource, selectionSource]) {
    assert.doesNotMatch(source, /driftMode|driftAssist|targetSideslip/);
  }
  for (const source of [tireSource, calibrationSource, selectionSource]) {
    assert.doesNotMatch(source, /profile\.id|frontDriveTorqueFraction/);
  }
  assert.doesNotMatch(solverSource, /if\s*\([^)]*frontDriveTorqueFraction/);
  assert.doesNotMatch(tireSource, /yawRate|betaTravel|bodyTravelDirection/);
});
