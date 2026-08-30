import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createMobileCourseSelectorModel,
  createMobileCameraYawSelectorModel,
  createMobileVehicleSelectorModel,
  createMobileSelfSteerGainSelectorModel,
  mountMobileCameraYawSelector,
  mountMobileCourseSelector,
  mountMobileVehicleSelector,
  mountMobileSelfSteerGainSelector,
} from '../dist/browser/mobile-selector-controls.js';
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
  assert.doesNotMatch(index, /data-(?:course|vehicle|self-steer)-/);
  assert.match(boot, /mountMobileCourseSelector/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /mountMobileVehicleSelector/);
    assert.match(source, /selectVehicleProfile\(selectedProfile\)/);
    assert.match(source, /selectSelfSteerGain\(selectedSelfSteerGain\)/);
    assert.match(source, /mountMobileSelfSteerGainSelector/);
  }
});
