import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mountBrowserTireFrictionControls } from '../dist/browser/tire-friction-controls.js';
import {
  BROWSER_TIRE_CHARACTERISTIC_PRESETS,
  BROWSER_TIRE_FRICTION_CYCLE_CODE,
  DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  browserTirePresetCalibration,
  browserTirePresetIdForCalibration,
  formatTirePresetSelector,
  nextBrowserTirePresetId,
} from '../dist/browser/tire-friction-selection.js';
import {
  createMobileTireFrictionSelectorModel,
  mountMobileTireFrictionSelector,
} from '../dist/browser/mobile-selector-controls.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import {
  createArcadeTireFrictionCalibration,
  setArcadeVehicleTireFrictionCalibration,
} from '../dist/physics/tire-friction-calibration.js';
import { evaluateTireForce } from '../dist/physics/tire-wheel.js';
import { FERRARI_TESTAROSSA_VEHICLE_PROFILE, PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE } from '../dist/physics/vehicle-profiles.js';
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
  name: 'M9.5 DEBUG TIRE PRESET TEST',
  bands: [{ lMin: -100, lMax: 100, type: 'ASPHALT' }],
}]);

function forceAtSlipAngle(tire, calibration, angleDegrees, gripFactor = 1) {
  const longitudinalVelocity = 30;
  const referenceSpeed = Math.sqrt(
    longitudinalVelocity ** 2 + tire.lowSpeedRegularization ** 2,
  );
  const lateralVelocity = -referenceSpeed * Math.tan(angleDegrees * Math.PI / 180);
  const normalLoad = tire.cornerStiffness / tire.normalizedStiffness;
  return evaluateTireForce(
    longitudinalVelocity / 0.33,
    0.33,
    longitudinalVelocity,
    lateralVelocity,
    normalLoad,
    gripFactor,
    tire,
    calibration.referenceFrictionMultiplier,
    calibration.linearStiffnessMultiplier,
  );
}

test('one debug browser authority owns exact tire presets 1, 2 and 3 with default 1', () => {
  assert.deepEqual(BROWSER_TIRE_CHARACTERISTIC_PRESETS.map(({ id, label }) => ({ id, label })), [
    { id: '1', label: '1' },
    { id: '2', label: '2' },
    { id: '3', label: '3' },
  ]);
  const [preset1, preset2, preset3] = BROWSER_TIRE_CHARACTERISTIC_PRESETS;
  assert.deepEqual(preset1.calibration, {
    referenceFrictionMultiplier: 1,
    linearStiffnessMultiplier: 1,
  });
  assert.deepEqual(DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION, preset1.calibration);
  assert.ok(Math.abs(preset2.calibration.linearStiffnessMultiplier - 10.3 / 9.75) < 1e-15);
  assert.equal(
    preset3.calibration.linearStiffnessMultiplier,
    preset2.calibration.linearStiffnessMultiplier,
  );
  assert.ok(Math.abs(
    preset2.calibration.referenceFrictionMultiplier
      - (10.3 * Math.tan(12 * Math.PI / 180) / 1.26) / 1.35,
  ) < 1e-15);
  assert.ok(Math.abs(
    preset3.calibration.referenceFrictionMultiplier
      - (10.3 * Math.tan(15 * Math.PI / 180) / 1.26) / 1.35,
  ) < 1e-15);
  assert.equal(BROWSER_TIRE_FRICTION_CYCLE_CODE, 'KeyG');
  assert.equal(nextBrowserTirePresetId(preset1.calibration), '2');
  assert.equal(nextBrowserTirePresetId(preset2.calibration), '3');
  assert.equal(nextBrowserTirePresetId(preset3.calibration), '1');
  assert.equal(formatTirePresetSelector(preset1.calibration), 'TIRE [G] 1');
});

test('presets preserve the one-k law while changing slope and plateau causally', () => {
  const tire = FERRARI_TESTAROSSA_VEHICLE_PROFILE.frontStation.tire;
  const preset1 = browserTirePresetCalibration('1');
  const preset2 = browserTirePresetCalibration('2');
  const preset3 = browserTirePresetCalibration('3');

  const force1AtOneDegree = forceAtSlipAngle(tire, preset1, 1);
  const force2AtOneDegree = forceAtSlipAngle(tire, preset2, 1);
  const force3AtOneDegree = forceAtSlipAngle(tire, preset3, 1);
  const normalLoad = tire.cornerStiffness / tire.normalizedStiffness;
  const normalizedSlope1 = Math.abs(force1AtOneDegree.fy) / normalLoad
    / Math.tan(Math.PI / 180);
  const normalizedSlope2 = Math.abs(force2AtOneDegree.fy) / normalLoad
    / Math.tan(Math.PI / 180);
  const normalizedSlope3 = Math.abs(force3AtOneDegree.fy) / normalLoad
    / Math.tan(Math.PI / 180);
  assert.ok(Math.abs(normalizedSlope1 - 9.75) < 1e-12);
  assert.ok(Math.abs(normalizedSlope2 - 10.3) < 1e-12);
  assert.ok(Math.abs(normalizedSlope3 - normalizedSlope2) < 1e-12);

  const preset1PlateauDegrees = Math.atan(1.26 * 1.35 / 9.75) * 180 / Math.PI;
  const preset1AtPlateau = forceAtSlipAngle(tire, preset1, preset1PlateauDegrees);
  const preset2BeforePlateau = forceAtSlipAngle(tire, preset2, 11.9);
  const preset2AtPlateau = forceAtSlipAngle(tire, preset2, 12);
  const preset3AtTwelve = forceAtSlipAngle(tire, preset3, 12);
  const preset3BeforePlateau = forceAtSlipAngle(tire, preset3, 14.9);
  const preset3AtPlateau = forceAtSlipAngle(tire, preset3, 15);
  assert.ok(Math.abs(preset1PlateauDegrees - 9.89630795243453) < 1e-12);
  assert.ok(Math.abs(preset1AtPlateau.rho - 1.26) < 1e-12);
  assert.ok(Math.abs(preset2AtPlateau.rho - 1.26) < 1e-12);
  assert.ok(Math.abs(Math.abs(preset2AtPlateau.fy) - preset2AtPlateau.fmax) < 1e-9);
  assert.ok(Math.abs(preset2BeforePlateau.fy) < preset2BeforePlateau.fmax);
  assert.ok(Math.abs(preset3AtTwelve.fy) < preset3AtTwelve.fmax);
  assert.ok(Math.abs(preset3AtPlateau.rho - 1.26) < 1e-12);
  assert.ok(Math.abs(Math.abs(preset3AtPlateau.fy) - preset3AtPlateau.fmax) < 1e-9);
  assert.ok(Math.abs(preset3BeforePlateau.fy) < preset3BeforePlateau.fmax);
  assert.ok(preset3AtPlateau.fmax > preset2AtPlateau.fmax);

  const wet = forceAtSlipAngle(tire, preset3, 20, 0.78);
  const dry = forceAtSlipAngle(tire, preset3, 20, 1);
  assert.ok(Math.abs(wet.fmax - dry.fmax * 0.78) < 1e-9);
  assert.equal(tire.muRef, 1.35);
  assert.equal(tire.normalizedStiffness, 9.75);
  assert.equal(tire.rhoKnee, 0.74);
});

test('vehicle-owned tire calibration updates atomically and survives reconstruction', () => {
  const vehicle = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    800,
    0,
    25,
    {},
    DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  );
  const preset3 = browserTirePresetCalibration('3');
  setArcadeVehicleTireFrictionCalibration(vehicle, preset3);
  const recovery = createM5RecoveryState(vehicle);
  recoverM5Vehicle(recovery, highway.guide, height, surface, vehicle);
  assert.deepEqual(vehicle.tireFrictionCalibration, preset3);

  const replacement = createArcadeVehicle(
    PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE,
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
      () => setArcadeVehicleTireFrictionCalibration(vehicle, {
        referenceFrictionMultiplier: 1,
        linearStiffnessMultiplier: invalid,
      }),
      /finite and > 0/,
    );
    assert.deepEqual(vehicle.tireFrictionCalibration, preset3);
    assert.throws(
      () => setArcadeVehicleTireFrictionCalibration(vehicle, {
        referenceFrictionMultiplier: invalid,
        linearStiffnessMultiplier: 1,
      }),
      /finite and > 0/,
    );
    assert.deepEqual(vehicle.tireFrictionCalibration, preset3);
  }
  assert.deepEqual(createArcadeTireFrictionCalibration(), {
    referenceFrictionMultiplier: 1,
    linearStiffnessMultiplier: 1,
  });
});

test('the common wheel path consumes both calibration values and changes handling causally', () => {
  const vehicles = ['1', '2', '3'].map((id) => createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    800,
    0,
    30,
    {},
    browserTirePresetCalibration(id),
  ));
  for (const vehicle of vehicles) {
    vehicle.velocityX = 30;
    updateArcadeVehicle(
      highway.guide,
      height,
      surface,
      vehicle,
      { steering: 0, throttle: false, brake: false },
      1 / 60,
    );
  }
  assert.ok(Math.abs(vehicles[1].lateralAcceleration) > Math.abs(vehicles[0].lateralAcceleration));
  assert.ok(Math.abs(vehicles[2].lateralAcceleration) > Math.abs(vehicles[1].lateralAcceleration));
  assert.notEqual(vehicles[2].velocityX, vehicles[0].velocityX);
});

test('keyboard touch and HUD use one preset table and one vehicle-owned calibration', () => {
  const fakeDocument = new FakeDocument();
  const container = new FakeContainer();
  let vehicle = {
    tireFrictionCalibration: { ...browserTirePresetCalibration('1') },
  };
  const controls = mountBrowserTireFrictionControls(container, () => vehicle, fakeDocument);
  assert.equal(container.children.length, 3);
  assert.equal(controls.handleKey('KeyG'), true);
  assert.equal(browserTirePresetIdForCalibration(vehicle.tireFrictionCalibration), '2');
  assert.equal(controls.handleKey('KeyT'), false);

  vehicle = { tireFrictionCalibration: { ...browserTirePresetCalibration('2') } };
  container.children[2].click();
  assert.equal(browserTirePresetIdForCalibration(vehicle.tireFrictionCalibration), '3');
  assert.equal(container.children[2].attributes.get('aria-pressed'), 'true');

  assert.deepEqual(
    createMobileTireFrictionSelectorModel('2').map(({ value, label, active }) => ({
      value, label, active,
    })),
    [
      { value: '1', label: '1', active: false },
      { value: '2', label: '2', active: true },
      { value: '3', label: '3', active: false },
    ],
  );

  const directContainer = new FakeContainer();
  let directSelection = null;
  mountMobileTireFrictionSelector(
    directContainer,
    '1',
    (id) => { directSelection = id; },
    fakeDocument,
  );
  directContainer.children[2].click();
  assert.equal(directSelection, '3');
});

test('debug tire presets stay separate from profile surface input camera route and renderer authority', async () => {
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
  assert.match(tire, /tire\.cornerStiffness \* linearStiffnessMultiplier/);
  assert.match(tire, /tire\.muRef\s*\n\s*\* referenceFrictionMultiplier/);
  assert.match(solver, /vehicle\.tireFrictionCalibration\.linearStiffnessMultiplier/);
  assert.match(solver, /vehicle\.tireFrictionCalibration\.referenceFrictionMultiplier/);
  assert.doesNotMatch(calibration, /profile\.id|routeKind|camera|surface/);
  assert.doesNotMatch(selection, /vehicle\.yaw|yawRate|routeKind|camera|SurfaceMap/);
  assert.match(controls, /setArcadeVehicleTireFrictionCalibration/);
  assert.doesNotMatch(surfaceSource, /linearStiffnessMultiplier|referenceFrictionMultiplier|KeyG/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION/);
    assert.match(source, /mountBrowserTireFrictionControls/);
    assert.match(source, /tireFrictionControls\.handleKey/);
    assert.match(source, /const tireFrictionCalibration = vehicle\.tireFrictionCalibration/);
    assert.doesNotMatch(source, /setArcadeVehicleTireFrictionCalibration/);
  }
});
