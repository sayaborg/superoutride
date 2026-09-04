import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { normalizedPedalRequest } from '../dist/input/driving-input.js';
import { TouchInput, touchAnalogFullScaleDistance, touchPedalRequests, touchSteeringRequest } from '../dist/input/touch-input.js';
import { createDrivingActuatorState, updateDrivingActuators } from '../dist/physics/driving-actuator.js';

class FakeEventTarget {
  listeners = new Map();
  innerWidth = 400;
  innerHeight = 800;

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeClassList {
  values = new Set();
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
  contains(name) { return this.values.has(name); }
}

class FakeStyle {
  values = new Map();
  setProperty(name, value) { this.values.set(name, value); }
}

class FakeElement extends FakeEventTarget {
  className = '';
  classList = new FakeClassList();
  style = new FakeStyle();
  dataset = {};
  children = [];
  attributes = new Map();

  setPointerCapture() {}
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

class FakeDocument extends FakeEventTarget {
  visibilityState = 'visible';
  body = new FakeElement();
  createElement() { return new FakeElement(); }
}

function pointer(pointerId, clientX, clientY) {
  return {
    pointerId,
    pointerType: 'touch',
    clientX,
    clientY,
    preventDefault() {},
  };
}

function createTouchFixture() {
  const lifecycle = new FakeEventTarget();
  const document = new FakeDocument();
  const touch = new TouchInput(
    new FakeElement(),
    new FakeElement(),
    new FakeElement(),
    new FakeElement(),
    lifecycle,
    document,
  );
  return { lifecycle, document, touch };
}

test('M9.14 full-scale slide distance is fixed at compact 64 CSS px across viewport sizes', () => {
  assert.equal(touchAnalogFullScaleDistance(400, 800), 64);
  assert.equal(touchAnalogFullScaleDistance(800, 400), 64);
  assert.equal(touchAnalogFullScaleDistance(200, 900), 64);
  assert.equal(touchAnalogFullScaleDistance(1200, 2000), 64);
  assert.throws(() => touchAnalogFullScaleDistance(0, 800), RangeError);
});

test('M9.13 relative displacement maps steering and exclusive pedal requests continuously', () => {
  assert.equal(touchSteeringRequest(100, 150, 100), 0.5);
  assert.equal(touchSteeringRequest(100, 0, 100), -1);
  assert.equal(touchSteeringRequest(100, 350, 100), 1);
  assert.deepEqual(touchPedalRequests(400, 350, 100), { throttle: 0.5, brake: 0 });
  assert.deepEqual(touchPedalRequests(400, 450, 100), { throttle: 0, brake: 0.5 });
  assert.deepEqual(touchPedalRequests(400, 400, 100), { throttle: 0, brake: 0 });
});

test('M9.13 left and right touch halves publish simultaneous direct analog steering and pedal input', () => {
  const { lifecycle, touch } = createTouchFixture();

  lifecycle.dispatch('pointerdown', pointer(1, 100, 300));
  lifecycle.dispatch('pointermove', pointer(1, 132, 300));
  lifecycle.dispatch('pointerdown', pointer(2, 300, 400));
  lifecycle.dispatch('pointermove', pointer(2, 300, 368));

  let sample = touch.sample();
  assert.equal(sample.steering, 0.5);
  assert.equal(normalizedPedalRequest(sample.throttle), 0.5);
  assert.equal(normalizedPedalRequest(sample.brake), 0);
  assert.equal(sample.steeringApplyMode, 'DIRECT');
  assert.equal(sample.pedalApplyMode, 'DIRECT');

  lifecycle.dispatch('pointermove', pointer(2, 300, 432));
  sample = touch.sample();
  assert.equal(sample.steering, 0.5);
  assert.equal(normalizedPedalRequest(sample.throttle), 0);
  assert.equal(normalizedPedalRequest(sample.brake), 0.5);
  assert.equal(sample.pedalApplyMode, 'DIRECT');
});

test('M9.13 pedal touch origin is active direct neutral and does not require displacement', () => {
  const { lifecycle, touch } = createTouchFixture();
  lifecycle.dispatch('pointerdown', pointer(7, 300, 400));
  const sample = touch.sample();
  assert.equal(normalizedPedalRequest(sample.throttle), 0);
  assert.equal(normalizedPedalRequest(sample.brake), 0);
  assert.equal(sample.pedalApplyMode, 'DIRECT');
});

test('M9.13 touch role is fixed by the half where the pointer starts', () => {
  const { lifecycle, touch } = createTouchFixture();
  lifecycle.dispatch('pointerdown', pointer(3, 100, 300));
  lifecycle.dispatch('pointermove', pointer(3, 350, 100));
  const sample = touch.sample();
  assert.equal(sample.steering, 1);
  assert.equal(normalizedPedalRequest(sample.throttle), 0);
  assert.equal(normalizedPedalRequest(sample.brake), 0);
  assert.equal(sample.steeringApplyMode, 'DIRECT');
});

test('M9.13 held displacement is immediate while release uses existing actuator release rates', () => {
  const { lifecycle, touch } = createTouchFixture();
  lifecycle.dispatch('pointerdown', pointer(4, 300, 400));
  lifecycle.dispatch('pointermove', pointer(4, 300, 368));
  const held = touch.sample();
  assert.equal(normalizedPedalRequest(held.throttle), 0.5);
  assert.equal(held.pedalApplyMode, 'DIRECT');

  const profile = {
    steering: { applyRate: 4, releaseRate: 4 },
    throttle: { applyRate: 4, releaseRate: 8 },
    brake: { applyRate: 1 / 0.15, releaseRate: 10 },
  };
  const state = createDrivingActuatorState();
  updateDrivingActuators(state, held, 1 / 720, profile);
  assert.equal(state.throttle, 0.5);

  lifecycle.dispatch('pointerup', pointer(4, 300, 368));
  const released = touch.sample();
  assert.equal(normalizedPedalRequest(released.throttle), 0);
  assert.equal(normalizedPedalRequest(released.brake), 0);
  assert.equal(released.pedalApplyMode, undefined);
  updateDrivingActuators(state, released, 1 / 32, profile);
  assert.equal(state.throttle, 0.25);
});

test('M9.13 steering displacement is immediate while release returns through selected ACT rate', () => {
  const { lifecycle, touch } = createTouchFixture();
  lifecycle.dispatch('pointerdown', pointer(8, 100, 300));
  lifecycle.dispatch('pointermove', pointer(8, 132, 300));
  const held = touch.sample();
  const profile = {
    steering: { applyRate: 4, releaseRate: 4 },
    throttle: { applyRate: 4, releaseRate: 8 },
    brake: { applyRate: 1 / 0.15, releaseRate: 10 },
  };
  const state = createDrivingActuatorState();
  updateDrivingActuators(state, held, 1 / 720, profile);
  assert.equal(state.steering, 0.5);

  lifecycle.dispatch('pointerup', pointer(8, 132, 300));
  const released = touch.sample();
  assert.equal(released.steeringApplyMode, undefined);
  updateDrivingActuators(state, released, 0.05, profile);
  assert.ok(Math.abs(state.steering - 0.3) < 1e-12);
});

test('M9.13 creates steering-wheel and pedal origin indicators and updates the vector readout', () => {
  const { lifecycle, document } = createTouchFixture();
  assert.equal(document.body.children.length, 2);
  const [steeringIndicator, pedalIndicator] = document.body.children;
  assert.match(steeringIndicator.className, /touch-analog-steering/);
  assert.match(pedalIndicator.className, /touch-analog-pedal/);

  lifecycle.dispatch('pointerdown', pointer(5, 100, 300));
  lifecycle.dispatch('pointermove', pointer(5, 68, 300));
  assert.equal(steeringIndicator.classList.contains('active'), true);
  assert.equal(steeringIndicator.dataset.value, 'STEER -50%');
  assert.equal(steeringIndicator.style.values.get('--touch-vector-angle'), '180deg');
  assert.equal(steeringIndicator.style.values.get('--touch-vector-length'), '32px');

  lifecycle.dispatch('pointerdown', pointer(6, 300, 400));
  lifecycle.dispatch('pointermove', pointer(6, 300, 368));
  assert.equal(pedalIndicator.dataset.value, 'ACCEL 50%');
  assert.equal(pedalIndicator.style.values.get('--touch-vector-angle'), '-90deg');

  lifecycle.dispatch('pointerup', pointer(5, 68, 300));
  lifecycle.dispatch('pointerup', pointer(6, 300, 368));
  assert.equal(steeringIndicator.classList.contains('active'), false);
  assert.equal(pedalIndicator.classList.contains('active'), false);
});

test('M9.13 touch layout hides legacy fixed driving panels while keeping full-screen overlay styling', async () => {
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.touch-capable \.control-zone\s*\{\s*display:\s*none;/s);
  assert.match(css, /\.touch-analog-indicator/);
  assert.match(css, /\.touch-analog-steering \.touch-analog-origin-icon/);
  assert.match(css, /\.touch-analog-pedal \.touch-analog-origin-icon/);
});
