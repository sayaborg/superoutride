import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mountBrowserTireFrictionControls } from '../dist/browser/tire-friction-controls.js';
import {
  BROWSER_TIRE_FRICTION_CYCLE_CODE,
  BROWSER_TIRE_FRICTION_PROFILES,
  DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  formatTireFrictionSelector,
  nextBrowserTireFrictionMultiplier,
} from '../dist/browser/tire-friction-selection.js';
import {
  createMobileTireFrictionSelectorModel,
  mountMobileTireFrictionSelector,
} from '../dist/browser/mobile-selector-controls.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { setArcadeVehicleReferenceFrictionMultiplier } from '../dist/physics/tire-friction-calibration.js';
import { evaluateTireForce } from '../dist/physics/tire-wheel.js';
import { FR_VEHICLE_PROFILE, MR_VEHICLE_PROFILE } from '../dist/physics/vehicle-profiles.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

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

const highway = createM72DefaultBranchingParent();
const height = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);
const surface = new SurfaceMap(highway.guide.length, [{
  sStart: 0,
  name: 'M9.4 TIRE FRICTION TEST',
  bands: [{ lMin: -100, lMax: 100, type: 'ASPHALT' }],
}]);

test('one browser authority owns the four exact tire-friction profiles', () => {
  assert.deepEqual(BROWSER_TIRE_FRICTION_PROFILES, [
    { multiplier: 1, label: 'SEMI' },
    { multiplier: 1.5, label: '1.5x' },
    { multiplier: 2, label: '2.0x' },
    { multiplier: 2.5, label: '2.5x' },
  ]);
  assert.deepEqual(DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION, {
    referenceFrictionMultiplier: 1,
  });
  assert.equal(BROWSER_TIRE_FRICTION_CYCLE_CODE, 'KeyG');
  assert.equal(nextBrowserTireFrictionMultiplier(1), 1.5);
  assert.equal(nextBrowserTireFrictionMultiplier(2.5), 1);
  assert.equal(formatTireFrictionSelector(1), 'TIRE [G] SEMI');
  assert.equal(formatTireFrictionSelector(2), 'TIRE [G] 2.0x');
});

test('the selected multiplier scales only the existing tire reference-friction capacity', () => {
  const tire = FR_VEHICLE_PROFILE.frontStation.tire;
  const normalLoad = 6_000;
  const base = evaluateTireForce(600, 0.33, 30, 5, normalLoad, 1, tire, 1);
  const oneAndHalf = evaluateTireForce(600, 0.33, 30, 5, normalLoad, 1, tire, 1.5);
  const double = evaluateTireForce(600, 0.33, 30, 5, normalLoad, 1, tire, 2);
  const twoAndHalf = evaluateTireForce(600, 0.33, 30, 5, normalLoad, 1, tire, 2.5);
  assert.ok(Math.abs(oneAndHalf.fmax - base.fmax * 1.5) < 1e-9);
  assert.ok(Math.abs(double.fmax - base.fmax * 2) < 1e-9);
  assert.ok(Math.abs(twoAndHalf.fmax - base.fmax * 2.5) < 1e-9);
  assert.ok(Math.abs(
    evaluateTireForce(600, 0.33, 30, 5, normalLoad, 0.78, tire, 2).fmax
      - double.fmax * 0.78,
  ) < 1e-9);
  assert.equal(tire.muRef, 1.35);
  assert.equal(tire.normalizedStiffness, 9);
  assert.equal(tire.rhoKnee, 0.74);
});

test('vehicle-owned tire calibration survives recovery and profile reconstruction', () => {
  const vehicle = createArcadeVehicle(
    FR_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    800,
    0,
    25,
    {},
    DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  );
  setArcadeVehicleReferenceFrictionMultiplier(vehicle, 2.5);
  const recovery = createM5RecoveryState(vehicle);
  recoverM5Vehicle(recovery, highway.guide, height, surface, vehicle);
  assert.equal(vehicle.tireFrictionCalibration.referenceFrictionMultiplier, 2.5);

  const replacement = createArcadeVehicle(
    MR_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    vehicle.course.s,
    vehicle.course.l,
    vehicle.longitudinalSpeed,
    vehicle.steeringCalibration,
    vehicle.tireFrictionCalibration,
  );
  assert.deepEqual(replacement.tireFrictionCalibration, vehicle.tireFrictionCalibration);
  assert.notEqual(replacement.tireFrictionCalibration, vehicle.tireFrictionCalibration);

  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleReferenceFrictionMultiplier(vehicle, invalid),
      /finite and > 0/,
    );
  }
  assert.equal(vehicle.tireFrictionCalibration.referenceFrictionMultiplier, 2.5);
});

test('the common wheel path consumes tire calibration and changes saturated handling causally', () => {
  const base = createArcadeVehicle(
    FR_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 30,
  );
  const boosted = createArcadeVehicle(
    FR_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 30, {},
    { referenceFrictionMultiplier: 2.5 },
  );
  base.velocityX = 30;
  boosted.velocityX = 30;
  updateArcadeVehicle(
    highway.guide, height, surface, base,
    { steering: 0, throttle: false, brake: false }, 1 / 60,
  );
  updateArcadeVehicle(
    highway.guide, height, surface, boosted,
    { steering: 0, throttle: false, brake: false }, 1 / 60,
  );
  assert.ok(Math.abs(boosted.lateralAcceleration) > Math.abs(base.lateralAcceleration));
  assert.notEqual(boosted.velocityX, base.velocityX);
});

test('keyboard and touch share one adapter and one vehicle-owned active value', () => {
  const fakeDocument = new FakeDocument();
  const container = new FakeContainer();
  let vehicle = { tireFrictionCalibration: { referenceFrictionMultiplier: 1 } };
  const controls = mountBrowserTireFrictionControls(container, () => vehicle, fakeDocument);
  assert.equal(container.children.length, 4);
  assert.equal(controls.handleKey('KeyG'), true);
  assert.equal(vehicle.tireFrictionCalibration.referenceFrictionMultiplier, 1.5);
  assert.equal(controls.handleKey('KeyT'), false);

  vehicle = { tireFrictionCalibration: { referenceFrictionMultiplier: 1.5 } };
  container.children[3].click();
  assert.equal(vehicle.tireFrictionCalibration.referenceFrictionMultiplier, 2.5);
  assert.equal(container.children[3].attributes.get('aria-pressed'), 'true');

  assert.deepEqual(
    createMobileTireFrictionSelectorModel(2).map(({ value, label, active }) => ({
      value, label, active,
    })),
    [
      { value: 1, label: 'SEMI', active: false },
      { value: 1.5, label: '1.5x', active: false },
      { value: 2, label: '2.0x', active: true },
      { value: 2.5, label: '2.5x', active: false },
    ],
  );

  const directContainer = new FakeContainer();
  let directSelection = null;
  mountMobileTireFrictionSelector(
    directContainer,
    1,
    (multiplier) => { directSelection = multiplier; },
    fakeDocument,
  );
  directContainer.children[2].click();
  assert.equal(directSelection, 2);
});

test('tire calibration stays separate from profile surface input camera route and renderer authority', async () => {
  const [solver, tire, calibration, selection, controls, surfaceSource, linear, branching, circuit] =
    await Promise.all([
      readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/physics/tire-wheel.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/physics/tire-friction-calibration.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/browser/tire-friction-selection.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/browser/tire-friction-controls.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/physics/surface-map.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
    ]);
  assert.match(tire, /tire\.muRef\s*\n\s*\* referenceFrictionMultiplier/);
  assert.match(solver, /vehicle\.tireFrictionCalibration\.referenceFrictionMultiplier/);
  assert.doesNotMatch(calibration, /profile\.id|routeKind|camera|surface/);
  assert.doesNotMatch(selection, /vehicle\.yaw|yawRate|routeKind|camera|SurfaceMap/);
  assert.match(controls, /setArcadeVehicleReferenceFrictionMultiplier/);
  assert.doesNotMatch(surfaceSource, /referenceFrictionMultiplier|KeyG/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION/);
    assert.match(source, /mountBrowserTireFrictionControls/);
    assert.match(source, /tireFrictionControls\.handleKey/);
    assert.match(source, /const tireFrictionCalibration = vehicle\.tireFrictionCalibration/);
    assert.doesNotMatch(source, /setArcadeVehicleReferenceFrictionMultiplier/);
  }
});
