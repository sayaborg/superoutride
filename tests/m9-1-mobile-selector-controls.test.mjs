import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { VEHICLE_CATALOG, compileVehicleCatalog } from '../dist/vehicle/vehicle-catalog.js';
import { compileArcadeVehicleProfile } from '../dist/physics/vehicle-profiles.js';
import { FERRARI_TESTAROSSA_VEHICLE_AUTHORING } from '../dist/vehicle/production-vehicle-profiles.js';
import { createBrowserVehicleProfileSelections, browserVehicleProfileForKey } from '../dist/browser/vehicle-profile-selection.js';
import { BROWSER_COURSE_MODES, compileBrowserCourseModes, selectBrowserCourseMode, browserCourseModeForKey } from '../dist/browser/course-mode-selection.js';

import {
  createMobileCourseSelectorModel,
  createMobileCameraYawSelectorModel,
  createMobileVehicleSelectorModel,
  createMobileMaxRoadWheelSteerSelectorModel,
  createMobileSteeringOffsetSelectorModel,
  createMobileSteeringResponseSelectorModel,
  mountMobileCameraYawSelector,
  mountMobileCourseSelector,
  mountMobileVehicleSelector,
  mountMobileMaxRoadWheelSteerSelector,
  mountMobileSteeringOffsetSelector,
  mountMobileSteeringResponseSelector,
} from '../dist/browser/mobile-selector-controls.js';
import { mountBrowserSteeringCalibrationControls } from '../dist/browser/steering-calibration-controls.js';
import {
  TOUCH_INTERFACE_MAX_SHORT_SIDE_PX,
  isTouchInterface,
} from '../dist/browser/touch-interface.js';

const DEG = Math.PI / 180;

class FakeClassList {
  values = new Set();
  toggle(value, force) { if (force) this.values.add(value); else this.values.delete(value); }
  contains(value) { return this.values.has(value); }
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
class FakeContainer { children = []; replaceChildren(...children) { this.children = children; } }
class FakeDocument { createElement(name) { assert.equal(name, 'button'); return new FakeButton(); } }

test('a tenth catalog vehicle without a shortcut remains selectable through the actual mobile control', () => {
  const profile = compileArcadeVehicleProfile({ ...FERRARI_TESTAROSSA_VEHICLE_AUTHORING, id: 'UNBOUND_TEST' });
  const extra = { ...VEHICLE_CATALOG[0], profile, keyCode: undefined, keyLabel: undefined, mobileLabel: 'EXTRA' };
  const catalog = compileVehicleCatalog([...VEHICLE_CATALOG, extra]);
  const choices = createBrowserVehicleProfileSelections(catalog);
  assert.equal(choices.length, 10);
  assert.equal(browserVehicleProfileForKey('Unassigned', choices), null);
  assert.equal(browserVehicleProfileForKey('KeyQ', choices), VEHICLE_CATALOG[0].profile);
  const container = new FakeContainer();
  let selected;
  const control = mountMobileVehicleSelector(container, 'TESTAROSSA', value => { selected = value; },
    new FakeDocument(), choices);
  assert.equal(container.children.length, 10);
  assert.equal(container.children[9].textContent, 'EXTRA');
  container.children[9].click();
  assert.equal(selected, profile);
  control.setActive(profile.id);
  assert.equal(container.children[9].attributes.get('aria-pressed'), 'true');
  assert.throws(() => compileVehicleCatalog([...VEHICLE_CATALOG, VEHICLE_CATALOG[0]]), /duplicate vehicle id/);
  assert.throws(() => compileVehicleCatalog([...VEHICLE_CATALOG, { ...extra, keyCode: 'KeyQ', keyLabel: 'Q' }]), /duplicate vehicle shortcut/);
  for (const invalid of [{ keyCode: 'KeyZ' }, { keyLabel: 'Z' }, { keyCode: '', keyLabel: 'Z' }]) {
    assert.throws(() => compileVehicleCatalog([{ ...extra, ...invalid }]), /shortcut/);
  }
  assert.throws(() => compileVehicleCatalog([{ ...extra, presentationFamily: 'UNKNOWN' }]), /presentation family/);
  assert.equal(Object.hasOwn(profile, 'presentationFamily'), false);
});

test('mobile course buttons derive labels and active state from the canonical course authority', () => {
  assert.deepEqual(createMobileCourseSelectorModel('circuit'), [
    { value: 'linear', label: '1', ariaLabel: 'Select LINEAR course', active: false },
    { value: 'branching', label: '2', ariaLabel: 'Select BRANCHING course', active: false },
    { value: 'circuit', label: '3', ariaLabel: 'Select TSUKUBA course', active: true },
    { value: 'fisco', label: '4', ariaLabel: 'Select FISCO course', active: false },
  ]);
});

test('additional unbound courses use the existing route runner and actual mobile selector', () => {
  const extra = { query: 'additional-circuit', label: 'EXTRA', routeKind: 'CIRCUIT' };
  const choices = compileBrowserCourseModes([...BROWSER_COURSE_MODES, extra]);
  assert.equal(selectBrowserCourseMode(extra.query, choices).entryName, 'main-circuit.js');
  assert.equal(browserCourseModeForKey('Unassigned', choices), null);
  const container = new FakeContainer();
  let selected;
  mountMobileCourseSelector(container, 'linear', value => { selected = value; }, new FakeDocument(), choices);
  assert.equal(container.children.length, 5);
  assert.equal(container.children[4].textContent, 'EXTRA');
  container.children[4].click();
  assert.equal(selected.query, extra.query);
  assert.equal(selected.entryName, 'main-circuit.js');
  assert.throws(() => compileBrowserCourseModes([extra, extra]), /duplicate course query/);
  assert.throws(() => compileBrowserCourseModes([...BROWSER_COURSE_MODES, { ...extra, digitCode: 'Digit1' }]), /duplicate course shortcut/);
  assert.throws(() => compileBrowserCourseModes([{ ...extra, routeKind: 'UNKNOWN' }]), /route kind/);
  assert.throws(() => compileBrowserCourseModes([{ ...extra, query: ' ' }]), /query/);
});

test('touch layout uses touch hardware or a phone-size fallback from one browser authority', () => {
  assert.equal(TOUCH_INTERFACE_MAX_SHORT_SIDE_PX, 720);
  assert.equal(isTouchInterface(1, false, 1200, 800), true);
  assert.equal(isTouchInterface(0, true, 1200, 800), true);
  assert.equal(isTouchInterface(0, false, 390, 844), true);
  assert.equal(isTouchInterface(0, false, 844, 390), true);
  assert.equal(isTouchInterface(0, false, 1200, 721), false);
});

test('mobile vehicle buttons derive all nine entries from the canonical catalog authority', () => {
  assert.deepEqual(
    createMobileVehicleSelectorModel('DELTA_HF_INTEGRALE').map(({ value, label, active }) => ({ value, label, active })),
    [
      { value: 'TESTAROSSA', label: 'F110', active: false },
      { value: '911_TURBO_3_3', label: '930', active: false },
      { value: 'CORVETTE_C4', label: 'C4', active: false },
      { value: 'GOLF_GTI_16V', label: 'GTI', active: false },
      { value: 'DELTA_HF_INTEGRALE', label: 'DELTA', active: true },
      { value: 'VFR750R', label: 'RC30', active: false },
      { value: 'R80_GS_PARIS_DAKAR', label: 'R80', active: false },
      { value: 'FXRT_SPORT_GLIDE', label: 'FXRT', active: false },
      { value: 'PX200E_ARCOBALENO', label: 'PX200', active: false },
    ],
  );
});

test('mobile camera buttons expose body-fixed default and movement-follow alternate', () => {
  assert.deepEqual(createMobileCameraYawSelectorModel('BODY_FIXED'), [
    { value: 'BODY_FIXED', label: 'BODY', ariaLabel: 'Lock camera yaw to vehicle body', active: true },
    { value: 'MOVEMENT_FOLLOW', label: 'MOVE', ariaLabel: 'Follow vehicle movement direction with camera yaw', active: false },
  ]);
});

test('mobile M D and symmetric-response buttons expose the current M9.14 choices', () => {
  const offsets = createMobileSteeringOffsetSelectorModel(12 * DEG);
  assert.deepEqual(offsets.map(({ label, active }) => ({ label, active })), [
    { label: '10', active: false },
    { label: '11', active: false },
    { label: '12', active: true },
    { label: '13', active: false },
    { label: '14', active: false },
    { label: '15', active: false },
    { label: '16', active: false },
    { label: '17', active: false },
    { label: '18', active: false },
    { label: '19', active: false },
    { label: '20', active: false },
  ]);
  const maxima = createMobileMaxRoadWheelSteerSelectorModel(60 * DEG);
  assert.deepEqual(maxima.map(({ label, active }) => ({ label, active })), [
    { label: '50', active: false },
    { label: '55', active: false },
    { label: '60', active: true },
    { label: '65', active: false },
    { label: '70', active: false },
  ]);
  assert.deepEqual(
    createMobileSteeringResponseSelectorModel(4).map(({ value, label, active }) => ({ value, label, active })),
    [
      { value: 5, label: '0.20', active: false },
      { value: 1 / 0.225, label: '0.225', active: false },
      { value: 4, label: '0.25', active: true },
      { value: 1 / 0.275, label: '0.275', active: false },
      { value: 1 / 0.3, label: '0.30', active: false },
    ],
  );
});

test('mobile selector taps publish canonical selections and expose exactly one active button', () => {
  const fakeDocument = new FakeDocument();
  const courseContainer = new FakeContainer();
  let selectedCourse = null;
  mountMobileCourseSelector(courseContainer, 'branching', (selection) => { selectedCourse = selection; }, fakeDocument);
  assert.equal(courseContainer.children.length, 4);
  assert.equal(courseContainer.children[1].attributes.get('aria-pressed'), 'true');
  courseContainer.children[2].click();
  assert.equal(selectedCourse.query, 'circuit');

  const vehicleContainer = new FakeContainer();
  let selectedVehicle = null;
  const vehicleController = mountMobileVehicleSelector(vehicleContainer, 'TESTAROSSA', (profile) => { selectedVehicle = profile; }, fakeDocument);
  vehicleContainer.children[4].click();
  assert.equal(selectedVehicle.id, 'DELTA_HF_INTEGRALE');
  vehicleController.setActive(selectedVehicle.id);
  assert.equal(vehicleContainer.children[4].attributes.get('aria-pressed'), 'true');

  const offsetContainer = new FakeContainer();
  let selectedOffset = null;
  const offsetController = mountMobileSteeringOffsetSelector(offsetContainer, 12 * DEG, (radians) => { selectedOffset = radians; }, fakeDocument);
  offsetContainer.children[10].click();
  assert.ok(Math.abs(selectedOffset - 20 * DEG) < 1e-12);
  offsetController.setActive(selectedOffset);
  assert.equal(offsetContainer.children[10].attributes.get('aria-pressed'), 'true');

  const maxContainer = new FakeContainer();
  let selectedMax = null;
  const maxController = mountMobileMaxRoadWheelSteerSelector(maxContainer, 60 * DEG, (radians) => { selectedMax = radians; }, fakeDocument);
  maxContainer.children[4].click();
  assert.ok(Math.abs(selectedMax - 70 * DEG) < 1e-12);
  maxController.setActive(selectedMax);
  assert.equal(maxContainer.children[4].attributes.get('aria-pressed'), 'true');

  const responseContainer = new FakeContainer();
  let selectedResponseRate = null;
  const responseController = mountMobileSteeringResponseSelector(responseContainer, 4, (rate) => { selectedResponseRate = rate; }, fakeDocument);
  responseContainer.children[4].click();
  assert.equal(selectedResponseRate, 1 / 0.3);
  responseController.setActive(selectedResponseRate);
  assert.equal(responseContainer.children[4].attributes.get('aria-pressed'), 'true');

  const cameraContainer = new FakeContainer();
  let selectedCameraMode = null;
  const cameraController = mountMobileCameraYawSelector(cameraContainer, 'BODY_FIXED', (mode) => { selectedCameraMode = mode; }, fakeDocument);
  cameraContainer.children[1].click();
  assert.equal(selectedCameraMode, 'MOVEMENT_FOLLOW');
  cameraController.setActive(selectedCameraMode);
  assert.equal(cameraContainer.children[1].attributes.get('aria-pressed'), 'true');
});

test('one browser steering adapter owns keyboard touch and the current vehicle M D T instance', () => {
  const fakeDocument = new FakeDocument();
  const containers = {
    steeringOffset: new FakeContainer(),
    maxRoadWheelSteer: new FakeContainer(),
    steeringResponse: new FakeContainer(),
  };
  let vehicle = {
    steeringCalibration: {
      maxRoadWheelSteer: 45 * DEG,
      steeringOffsetMax: 9.5 * DEG,
      steeringActuatorResponse: { applyRate: 4, releaseRate: 4 },
    },
  };
  const controls = mountBrowserSteeringCalibrationControls(containers, () => vehicle, fakeDocument);
  assert.ok(Math.abs(vehicle.steeringCalibration.steeringOffsetMax - 12 * DEG) < 1e-12);
  assert.ok(Math.abs(vehicle.steeringCalibration.maxRoadWheelSteer - 60 * DEG) < 1e-12);
  assert.deepEqual(vehicle.steeringCalibration.steeringActuatorResponse, { applyRate: 4, releaseRate: 4 });

  assert.equal(controls.handleKey('KeyY'), true);
  assert.ok(Math.abs(vehicle.steeringCalibration.steeringOffsetMax - 13 * DEG) < 1e-12);
  assert.equal(controls.handleKey('KeyU'), true);
  assert.ok(Math.abs(vehicle.steeringCalibration.maxRoadWheelSteer - 65 * DEG) < 1e-12);
  assert.equal(controls.handleKey('KeyT'), true);
  assert.deepEqual(vehicle.steeringCalibration.steeringActuatorResponse, { applyRate: 1 / 0.275, releaseRate: 1 / 0.275 });
  assert.equal(controls.handleKey('KeyV'), false);

  vehicle = {
    steeringCalibration: {
      maxRoadWheelSteer: vehicle.steeringCalibration.maxRoadWheelSteer,
      steeringOffsetMax: vehicle.steeringCalibration.steeringOffsetMax,
      steeringActuatorResponse: vehicle.steeringCalibration.steeringActuatorResponse,
    },
  };
  containers.steeringOffset.children[0].click();
  containers.maxRoadWheelSteer.children[0].click();
  containers.steeringResponse.children[4].click();
  assert.ok(Math.abs(vehicle.steeringCalibration.steeringOffsetMax - 10 * DEG) < 1e-12);
  assert.ok(Math.abs(vehicle.steeringCalibration.maxRoadWheelSteer - 50 * DEG) < 1e-12);
  assert.deepEqual(vehicle.steeringCalibration.steeringActuatorResponse, { applyRate: 1 / 0.3, releaseRate: 1 / 0.3 });
});

test('browser compositions mount shared M D T selectors without duplicating choices in HTML', async () => {
  const [index, boot, linear, branching, circuit] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/boot.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(index, /id="course-selector-buttons"/);
  assert.match(index, /id="vehicle-selector-buttons"/);
  assert.match(index, /id="camera-selector-buttons"/);
  assert.match(index, /id="steering-offset-selector-buttons"/);
  assert.match(index, /id="max-steer-selector-buttons"/);
  assert.match(index, /id="steering-response-selector-buttons"/);
  assert.match(index, /id="tire-friction-selector-buttons"/);
  assert.doesNotMatch(index, /yaw-transient|yaw-washout|self-steer|yaw-preview/i);
  assert.match(boot, /mountMobileCourseSelector/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /createBrowserDrivingShell/);
    assert.match(source, /shell\.mountControls/);
  }
  const source = await readFile(new URL('../src/browser/driving-shell.ts', import.meta.url), 'utf8');
  {
    assert.match(source, /mountMobileVehicleSelector/);
    assert.match(source, /selectVehicleProfile\(selectedProfile\)/);
    assert.match(source, /mountBrowserSteeringCalibrationControls/);
    assert.match(source, /steeringCalibrationControls\.handleKey/);
    assert.match(source, /mountBrowserTireFrictionControls/);
    assert.match(source, /tireFrictionControls\.handleKey/);
    assert.match(source, /steeringOffset: mustGet\('steering-offset-selector-buttons'\)/);
    assert.match(source, /maxRoadWheelSteer: mustGet\('max-steer-selector-buttons'\)/);
    assert.doesNotMatch(source, /yawTransient|yawWashout/);
  }
});
