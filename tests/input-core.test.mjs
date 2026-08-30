import assert from 'node:assert/strict';
import test from 'node:test';

import { clampSteering } from '../dist/input/driving-input.js';
import { mergeDrivingInput } from '../dist/input/input-manager.js';
import { KeyboardInput, digitalKeyboardSteering } from '../dist/input/keyboard-input.js';
import { TouchInput, digitalTouchSteering } from '../dist/input/touch-input.js';

class FakeEventTarget {
  listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeElement extends FakeEventTarget {
  activeClasses = new Set();
  captureThrows = false;
  classList = {
    add: (name) => this.activeClasses.add(name),
    remove: (name) => this.activeClasses.delete(name),
  };

  setPointerCapture() {
    if (this.captureThrows) throw new Error('capture unavailable');
  }
}

function pointerEvent(pointerId) {
  return { pointerId, preventDefault() {} };
}

test('clampSteering keeps canonical range', () => {
  assert.equal(clampSteering(-2), -1);
  assert.equal(clampSteering(2), 1);
  assert.equal(clampSteering(0.25), 0.25);
});

test('keyboard steering publishes only digital intent', () => {
  assert.equal(digitalKeyboardSteering(true, false), -1);
  assert.equal(digitalKeyboardSteering(false, true), 1);
  assert.equal(digitalKeyboardSteering(false, false), 0);
  assert.equal(digitalKeyboardSteering(true, true), 0);
});

test('touch steering buttons publish left neutral or right digital request', () => {
  assert.equal(digitalTouchSteering(true, false), -1);
  assert.equal(digitalTouchSteering(false, false), 0);
  assert.equal(digitalTouchSteering(false, true), 1);
  assert.equal(digitalTouchSteering(true, true), 0);
});

test('input merge gives active touch steering priority and ORs pedals', () => {
  const keyboard = { steering: -0.5, throttle: true, brake: false };
  const touch = { steering: 0.25, throttle: false, brake: true };

  assert.deepEqual(mergeDrivingInput(keyboard, touch, true), {
    steering: 0.25,
    throttle: true,
    brake: true,
  });

  assert.deepEqual(mergeDrivingInput(keyboard, touch, false), {
    steering: -0.5,
    throttle: true,
    brake: true,
  });
});

test('touch steering releases a pointer whose terminal event reaches the window', () => {
  const lifecycle = new FakeEventTarget();
  const visibility = new FakeEventTarget();
  visibility.visibilityState = 'visible';
  const left = new FakeElement();
  const right = new FakeElement();
  const touch = new TouchInput(
    left,
    right,
    new FakeElement(),
    new FakeElement(),
    lifecycle,
    visibility,
  );

  right.dispatch('pointerdown', pointerEvent(7));
  assert.equal(touch.sample().steering, 1);
  assert.equal(touch.steeringActive, true);

  lifecycle.dispatch('pointerup', pointerEvent(7));
  assert.equal(touch.sample().steering, 0);
  assert.equal(touch.steeringActive, false);
  assert.equal(right.activeClasses.has('active'), false);
});

test('touch lifecycle reset clears the exact stale-right opposite-button symptom', () => {
  const lifecycle = new FakeEventTarget();
  const visibility = new FakeEventTarget();
  visibility.visibilityState = 'visible';
  const left = new FakeElement();
  const right = new FakeElement();
  right.captureThrows = true;
  const touch = new TouchInput(
    left,
    right,
    new FakeElement(),
    new FakeElement(),
    lifecycle,
    visibility,
  );

  right.dispatch('pointerdown', pointerEvent(11));
  assert.equal(touch.sample().steering, 1);
  left.dispatch('pointerdown', pointerEvent(12));
  assert.equal(touch.sample().steering, 0);
  left.dispatch('pointerup', pointerEvent(12));
  assert.equal(touch.sample().steering, 1);

  visibility.visibilityState = 'hidden';
  visibility.dispatch('visibilitychange');
  assert.deepEqual(touch.sample(), { steering: 0, throttle: false, brake: false });
  assert.equal(touch.steeringActive, false);
});

test('keyboard page lifecycle clears a key when keyup is not delivered', () => {
  const lifecycle = new FakeEventTarget();
  const visibility = new FakeEventTarget();
  visibility.visibilityState = 'visible';
  const keyboard = new KeyboardInput(lifecycle, visibility);

  lifecycle.dispatch('keydown', { code: 'ArrowRight', preventDefault() {} });
  assert.equal(keyboard.sample().steering, 1);
  lifecycle.dispatch('pagehide');
  assert.deepEqual(keyboard.sample(), { steering: 0, throttle: false, brake: false });
});
