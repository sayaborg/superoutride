import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createMobileCourseSelectorModel,
  createMobileCameraYawSelectorModel,
  createMobileVehicleSelectorModel,
  createMobileSteeringResponseSelectorModel,
  createMobileYawTransientSelectorModel,
  createMobileYawWashoutSelectorModel,
  mountMobileCameraYawSelector,
  mountMobileCourseSelector,
  mountMobileVehicleSelector,
  mountMobileSteeringResponseSelector,
  mountMobileYawTransientSelector,
  mountMobileYawWashoutSelector,
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
      ariaLabel: 'Select TSUKUBA course',
      active: true,
    },
    {
      value: 'fisco',
      label: '4',
      ariaLabel: 'Select FISCO course',
      active: false,
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

test('mobile vehicle buttons derive all nine entries from the canonical catalog authority', () => {
  assert.deepEqual(
    createMobileVehicleSelectorModel('DELTA_HF_INTEGRALE').map(({ value, label, active }) => ({
      value,
      label,
      active,
    })),
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

test('mobile yaw-transient, yaw-washout and symmetric-response buttons expose canonical choices', () => {
  assert.deepEqual(
    createMobileYawTransientSelectorModel(0.18),
    [
      { value: 0, label: '0.00', ariaLabel: 'Set steering yaw transient gain to 0.00 seconds', active: false },
      { value: 0.06, label: '0.06', ariaLabel: 'Set steering yaw transient gain to 0.06 seconds', active: false },
      { value: 0.12, label: '0.12', ariaLabel: 'Set steering yaw transient gain to 0.12 seconds', active: false },
      { value: 0.18, label: '0.18', ariaLabel: 'Set steering yaw transient gain to 0.18 seconds', active: true },
      { value: 0.24, label: '0.24', ariaLabel: 'Set steering yaw transient gain to 0.24 seconds', active: false },
      { value: 0.3, label: '0.30', ariaLabel: 'Set steering yaw transient gain to 0.30 seconds', active: false },
    ],
  );
  assert.deepEqual(
    createMobileYawWashoutSelectorModel(0.35),
    [
      { value: 0.2, label: '0.20', ariaLabel: 'Set steering yaw washout time to 0.20 seconds', active: false },
      { value: 0.35, label: '0.35', ariaLabel: 'Set steering yaw washout time to 0.35 seconds', active: true },
      { value: 0.5, label: '0.50', ariaLabel: 'Set steering yaw washout time to 0.50 seconds', active: false },
      { value: 0.65, label: '0.65', ariaLabel: 'Set steering yaw washout time to 0.65 seconds', active: false },
    ],
  );
  assert.deepEqual(
    createMobileSteeringResponseSelectorModel(8 / 3),
    [
      { value: 4, label: '0.25', ariaLabel: 'Set symmetric steering traversal to 0.25 seconds', active: false },
      { value: 8 / 3, label: '0.375', ariaLabel: 'Set symmetric steering traversal to 0.375 seconds', active: true },
      { value: 2, label: '0.5', ariaLabel: 'Set symmetric steering traversal to 0.5 seconds', active: false },
      { value: 1.6, label: '0.625', ariaLabel: 'Set symmetric steering traversal to 0.625 seconds', active: false },
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
  assert.equal(courseContainer.children.length, 4);
  assert.equal(courseContainer.children[1].attributes.get('aria-pressed'), 'true');
  courseContainer.children[2].click();
  assert.equal(selectedCourse.query, 'circuit');
  courseContainer.children[3].click();
  assert.equal(selectedCourse.query, 'fisco');

  const vehicleContainer = new FakeContainer();
  let selectedVehicle = null;
  const vehicleController = mountMobileVehicleSelector(
    vehicleContainer,
    'TESTAROSSA',
    (profile) => { selectedVehicle = profile; },
    fakeDocument,
  );
  assert.equal(vehicleContainer.children.length, 9);
  vehicleContainer.children[4].click();
  assert.equal(selectedVehicle.id, 'DELTA_HF_INTEGRALE');
  vehicleController.setActive(selectedVehicle.id);
  assert.deepEqual(
    vehicleContainer.children.map((button) => button.attributes.get('aria-pressed')),
    ['false', 'false', 'false', 'false', 'true', 'false', 'false', 'false', 'false'],
  );

  const yawTransientContainer = new FakeContainer();
  let selectedYawTransient = null;
  const yawTransientController = mountMobileYawTransientSelector(
    yawTransientContainer,
    0.18,
    (gain) => { selectedYawTransient = gain; },
    fakeDocument,
  );
  yawTransientContainer.children[4].click();
  assert.equal(selectedYawTransient, 0.24);
  yawTransientController.setActive(selectedYawTransient);
  assert.deepEqual(
    yawTransientContainer.children.map((button) => button.attributes.get('aria-pressed')),
    ['false', 'false', 'false', 'false', 'true', 'false'],
  );
  assert.equal(vehicleContainer.children[4].classList.contains('active'), true);

  const yawWashoutContainer = new FakeContainer();
  let selectedYawWashout = null;
  const yawWashoutController = mountMobileYawWashoutSelector(
    yawWashoutContainer,
    0.35,
    (yawWashoutTime) => { selectedYawWashout = yawWashoutTime; },
    fakeDocument,
  );
  yawWashoutContainer.children[3].click();
  assert.equal(selectedYawWashout, 0.65);
  yawWashoutController.setActive(selectedYawWashout);
  assert.equal(yawWashoutContainer.children[3].attributes.get('aria-pressed'), 'true');

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
    yawTransient: new FakeContainer(),
    yawWashout: new FakeContainer(),
    steeringResponse: new FakeContainer(),
  };
  let vehicle = {
    steeringCalibration: {
      yawTransientGain: 0.18,
      yawWashoutTime: 0.35,
      steeringActuatorResponse: { applyRate: 8 / 3, releaseRate: 8 / 3 },
    },
  };
  const controls = mountBrowserSteeringCalibrationControls(
    containers,
    () => vehicle,
    fakeDocument,
  );

  for (let digit = 4; digit <= 9; digit += 1) {
    assert.equal(controls.handleKey(`Digit${digit}`), false);
    assert.equal(controls.handleKey(`Numpad${digit}`), false);
  }
  assert.equal(controls.handleKey('KeyY'), true);
  assert.equal(vehicle.steeringCalibration.yawTransientGain, 0.24);
  assert.equal(controls.handleKey('KeyU'), true);
  assert.equal(vehicle.steeringCalibration.yawWashoutTime, 0.5);
  assert.equal(controls.handleKey('KeyT'), true);
  assert.deepEqual(vehicle.steeringCalibration.steeringActuatorResponse, {
    applyRate: 2,
    releaseRate: 2,
  });
  assert.equal(controls.handleKey('KeyV'), false);

  vehicle = {
    steeringCalibration: {
      yawTransientGain: vehicle.steeringCalibration.yawTransientGain,
      yawWashoutTime: vehicle.steeringCalibration.yawWashoutTime,
      steeringActuatorResponse: vehicle.steeringCalibration.steeringActuatorResponse,
    },
  };
  containers.yawTransient.children[1].click();
  containers.yawWashout.children[1].click();
  containers.steeringResponse.children[3].click();
  assert.equal(vehicle.steeringCalibration.yawTransientGain, 0.06);
  assert.equal(vehicle.steeringCalibration.yawWashoutTime, 0.35);
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
  assert.match(index, /id="yaw-transient-selector-buttons"/);
  assert.match(index, /id="yaw-washout-selector-buttons"/);
  assert.match(index, /id="steering-response-selector-buttons"/);
  assert.match(index, /id="tire-friction-selector-buttons"/);
  assert.doesNotMatch(index, /self-steer|yaw-preview|>SELF</i);
  assert.doesNotMatch(index, /data-(?:course|vehicle|yaw-transient|yaw-washout|steering-response|tire-friction)-/);
  assert.match(boot, /mountMobileCourseSelector/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /mountMobileVehicleSelector/);
    assert.match(source, /selectVehicleProfile\(selectedProfile\)/);
    assert.match(source, /mountBrowserSteeringCalibrationControls/);
    assert.match(source, /steeringCalibrationControls\.handleKey/);
    assert.match(source, /mountBrowserTireFrictionControls/);
    assert.match(source, /tireFrictionControls\.handleKey/);
    assert.match(source, /yawTransient: yawTransientSelectorButtons/);
    assert.match(source, /yawWashout: yawWashoutSelectorButtons/);
    assert.doesNotMatch(source, /mountMobileYawTransientSelector/);
    assert.doesNotMatch(source, /mountMobileYawWashoutSelector/);
    assert.doesNotMatch(source, /mountMobileSteeringResponseSelector/);
    assert.doesNotMatch(source, /mountMobileTireFrictionSelector/);
  }
});
