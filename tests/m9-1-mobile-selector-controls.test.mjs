import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createMobileCourseSelectorModel,
  createMobileCameraYawSelectorModel,
  createMobileVehicleSelectorModel,
  createMobileSelfSteerGainSelectorModel,
  createMobileSteeringResponseSelectorModel,
  createMobileYawPreviewSelectorModel,
  mountMobileCameraYawSelector,
  mountMobileCourseSelector,
  mountMobileVehicleSelector,
  mountMobileSelfSteerGainSelector,
  mountMobileSteeringResponseSelector,
  mountMobileYawPreviewSelector,
} from '../dist/browser/mobile-selector-controls.js';
import { mountBrowserSteeringCalibrationControls } from '../dist/browser/steering-calibration-controls.js';
import {
  TOUCH_INTERFACE_MAX_SHORT_SIDE_PX,
  isTouchInterface,
} from '../dist/browser/touch-interface.js';

class FakeClassList {
  values = new Set();

  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeButton {
  type = '';
  className = '';
  textContent = '';
  classList = new FakeClassList();
  attributes = new Map();
  listeners = new Map();

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get('click')?.();
  }
}

class FakeContainer {
  children = [];

  replaceChildren(...children) {
    this.children = children;
  }
}

class FakeDocument {
  createElement(name) {
    assert.equal(name, 'button');
    return new FakeButton();
  }
}

test('mobile course buttons derive labels and active state from the canonical course authority', () => {
  assert.deepEqual(createMobileCourseSelectorModel('circuit'), [
    {
      value: 'linear',
      label: '1',
      ariaLabel: 'Select LINEAR course',
      active: false,
    },
    {
      value: 'branching',
      label: '2',
      ariaLabel: 'Select BRANCHING course',
      active: false,
    },
    {
      value: 'circuit',
      label: '3',
      ariaLabel: 'Select CIRCUIT course',
      active: true,
    },
  ]);
});

test('touch layout uses touch hardware or a phone-size fallback from one browser authority', () => {
  assert.equal(TOUCH_INTERFACE_MAX_SHORT_SIDE_PX, 720);
  assert.equal(isTouchInterface(1, false, 1200, 800), true);
  assert.equal(isTouchInterface(0, true, 1200, 800), true);
  assert.equal(isTouchInterface(0, false, 390, 844), true);
  assert.equal(isTouchInterface(0, false, 844, 390), true);
  assert.equal(isTouchInterface(0, false, 1200, 721), false);
});

test('mobile vehicle buttons derive all six profiles from the canonical profile authority', () => {
  assert.deepEqual(
    createMobileVehicleSelectorModel('AWD').map(({ value, label, active }) => ({
      value,
      label,
      active,
    })),
    [
      { value: 'FR', label: 'FR', active: false },
      { value: 'MR', label: 'MR', active: false },
      { value: 'RR', label: 'RR', active: false },
      { value: 'AWD', label: 'AWD', active: true },
      { value: 'BIKE1', label: 'BIKE1', active: false },
      { value: 'BIKE2', label: 'BIKE2', active: false },
    ],
  );
});

test('mobile camera buttons expose body-fixed default and movement-follow alternate', () => {
  assert.deepEqual(createMobileCameraYawSelectorModel('BODY_FIXED'), [
    {
      value: 'BODY_FIXED',
      label: 'BODY',
      ariaLabel: 'Lock camera yaw to vehicle body',
      active: true,
    },
    {
      value: 'MOVEMENT_FOLLOW',
      label: 'MOVE',
      ariaLabel: 'Follow vehicle movement direction with camera yaw',
      active: false,
    },
  ]);
});

test('mobile self-steer buttons expose the five canonical calibration gains', () => {
  assert.deepEqual(createMobileSelfSteerGainSelectorModel(0.7), [
    { value: 0.3, label: '0.3', ariaLabel: 'Set self-steer gain to 0.3', active: false },
    { value: 0.4, label: '0.4', ariaLabel: 'Set self-steer gain to 0.4', active: false },
    { value: 0.5, label: '0.5', ariaLabel: 'Set self-steer gain to 0.5', active: false },
    { value: 0.6, label: '0.6', ariaLabel: 'Set self-steer gain to 0.6', active: false },
    { value: 0.7, label: '0.7', ariaLabel: 'Set self-steer gain to 0.7', active: true },
  ]);
});

test('mobile yaw-preview and symmetric-response buttons expose canonical calibration choices', () => {
  assert.deepEqual(
    createMobileYawPreviewSelectorModel(0.12).map(({ value, label, active }) => ({
      value,
      label,
      active,
    })),
    [
      { value: 0, label: '0.00', active: false },
      { value: 0.06, label: '0.06', active: false },
      { value: 0.09, label: '0.09', active: false },
      { value: 0.12, label: '0.12', active: true },
      { value: 0.15, label: '0.15', active: false },
      { value: 0.18, label: '0.18', active: false },
    ],
  );
  assert.deepEqual(
    createMobileSteeringResponseSelectorModel(8 / 3).map(({ value, label, active }) => ({
      value,
      label,
      active,
    })),
    [
      { value: 4, label: '0.25', active: false },
      { value: 8 / 3, label: '0.375', active: true },
      { value: 2, label: '0.5', active: false },
      { value: 1.6, label: '0.625', active: false },
    ],
  );
});

test('mobile selector taps publish canonical selections and expose exactly one active button', () => {
  const fakeDocument = new FakeDocument();
  const courseContainer = new FakeContainer();
  let selectedCourse = null;
  mountMobileCourseSelector(
    courseContainer,
    'branching',
    (selection) => { selectedCourse = selection; },
    fakeDocument,
  );
  assert.equal(courseContainer.children.length, 3);
  assert.equal(courseContainer.children[1].attributes.get('aria-pressed'), 'true');
  courseContainer.children[2].click();
  assert.equal(selectedCourse.query, 'circuit');

  const vehicleContainer = new FakeContainer();
  let selectedVehicle = null;
  const vehicleController = mountMobileVehicleSelector(
    vehicleContainer,
    'FR',
    (profile) => { selectedVehicle = profile; },
    fakeDocument,
  );
  assert.equal(vehicleContainer.children.length, 6);
  vehicleContainer.children[4].click();
  assert.equal(selectedVehicle.id, 'BIKE1');
  vehicleController.setActive(selectedVehicle.id);
  assert.deepEqual(
    vehicleContainer.children.map((button) => button.attributes.get('aria-pressed')),
    ['false', 'false', 'false', 'false', 'true', 'false'],
  );

  const gainContainer = new FakeContainer();
  let selectedGain = null;
  const gainController = mountMobileSelfSteerGainSelector(
    gainContainer,
    0.5,
    (gain) => { selectedGain = gain; },
    fakeDocument,
  );
  gainContainer.children[4].click();
  assert.equal(selectedGain, 0.7);
  gainController.setActive(selectedGain);
  assert.deepEqual(
    gainContainer.children.map((button) => button.attributes.get('aria-pressed')),
    ['false', 'false', 'false', 'false', 'true'],
  );
  assert.equal(vehicleContainer.children[4].classList.contains('active'), true);

  const yawContainer = new FakeContainer();
  let selectedYawPreview = null;
  const yawController = mountMobileYawPreviewSelector(
    yawContainer,
    0.12,
    (yawPreviewTime) => { selectedYawPreview = yawPreviewTime; },
    fakeDocument,
  );
  yawContainer.children[5].click();
  assert.equal(selectedYawPreview, 0.18);
  yawController.setActive(selectedYawPreview);
  assert.equal(yawContainer.children[5].attributes.get('aria-pressed'), 'true');

  const responseContainer = new FakeContainer();
  let selectedResponseRate = null;
  const responseController = mountMobileSteeringResponseSelector(
    responseContainer,
    8 / 3,
    (rate) => { selectedResponseRate = rate; },
    fakeDocument,
  );
  responseContainer.children[3].click();
  assert.equal(selectedResponseRate, 1.6);
  responseController.setActive(selectedResponseRate);
  assert.equal(responseContainer.children[3].attributes.get('aria-pressed'), 'true');

  const cameraContainer = new FakeContainer();
  let selectedCameraMode = null;
  const cameraController = mountMobileCameraYawSelector(
    cameraContainer,
    'BODY_FIXED',
    (mode) => { selectedCameraMode = mode; },
    fakeDocument,
  );
  assert.equal(cameraContainer.children.length, 2);
  cameraContainer.children[1].click();
  assert.equal(selectedCameraMode, 'MOVEMENT_FOLLOW');
  cameraController.setActive(selectedCameraMode);
  assert.deepEqual(
    cameraContainer.children.map((button) => button.attributes.get('aria-pressed')),
    ['false', 'true'],
  );
});

test('one browser steering adapter owns keyboard touch and the current vehicle instance', () => {
  const fakeDocument = new FakeDocument();
  const containers = {
    selfSteer: new FakeContainer(),
    yawPreview: new FakeContainer(),
    steeringResponse: new FakeContainer(),
  };
  let vehicle = {
    steeringCalibration: {
      travelDirectionGain: 0.5,
      yawPreviewTime: 0.12,
      steeringActuatorResponse: { applyRate: 8 / 3, releaseRate: 8 / 3 },
    },
  };
  const controls = mountBrowserSteeringCalibrationControls(
    containers,
    () => vehicle,
    fakeDocument,
  );

  assert.equal(controls.handleKey('Digit8'), true);
  assert.equal(vehicle.steeringCalibration.travelDirectionGain, 0.7);
  assert.equal(controls.handleKey('KeyY'), true);
  assert.equal(vehicle.steeringCalibration.yawPreviewTime, 0.15);
  assert.equal(controls.handleKey('KeyT'), true);
  assert.deepEqual(vehicle.steeringCalibration.steeringActuatorResponse, {
    applyRate: 2,
    releaseRate: 2,
  });
  assert.equal(controls.handleKey('KeyV'), false);

  vehicle = {
    steeringCalibration: {
      travelDirectionGain: vehicle.steeringCalibration.travelDirectionGain,
      yawPreviewTime: vehicle.steeringCalibration.yawPreviewTime,
      steeringActuatorResponse: vehicle.steeringCalibration.steeringActuatorResponse,
    },
  };
  containers.yawPreview.children[1].click();
  containers.steeringResponse.children[3].click();
  assert.equal(vehicle.steeringCalibration.yawPreviewTime, 0.06);
  assert.deepEqual(vehicle.steeringCalibration.steeringActuatorResponse, {
    applyRate: 1.6,
    releaseRate: 1.6,
  });
});

test('browser compositions mount the shared mobile selector adapter without duplicating choices in HTML', async () => {
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
  assert.match(index, /id="self-steer-selector-buttons"/);
  assert.match(index, /id="yaw-preview-selector-buttons"/);
  assert.match(index, /id="steering-response-selector-buttons"/);
  assert.doesNotMatch(index, /data-(?:course|vehicle|self-steer|yaw-preview|steering-response)-/);
  assert.match(boot, /mountMobileCourseSelector/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /mountMobileVehicleSelector/);
    assert.match(source, /selectVehicleProfile\(selectedProfile\)/);
    assert.match(source, /mountBrowserSteeringCalibrationControls/);
    assert.match(source, /steeringCalibrationControls\.handleKey/);
    assert.doesNotMatch(source, /mountMobileSelfSteerGainSelector/);
    assert.doesNotMatch(source, /mountMobileYawPreviewSelector/);
    assert.doesNotMatch(source, /mountMobileSteeringResponseSelector/);
  }
});
