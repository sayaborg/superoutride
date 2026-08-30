import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExclusivePedalInput, clampSteering } from '../dist/input/driving-input.js';
import { mergeDrivingInput } from '../dist/input/input-manager.js';
import { KeyboardInput, digitalKeyboardSteering } from '../dist/input/keyboard-input.js';
import { PedalInputArbiter } from '../dist/input/pedal-input-arbiter.js';
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

test('keyboard pedal aliases preserve demand until every equivalent key is released', () => {
  const lifecycle = new FakeEventTarget();
  const visibility = new FakeEventTarget();
  visibility.visibilityState = 'visible';
  const keyboard = new KeyboardInput(lifecycle, visibility);
  const dispatchKey = (type, code) => {
    let prevented = false;
    lifecycle.dispatch(type, { code, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true, `${code} must suppress browser default behavior`);
  };

  dispatchKey('keydown', 'KeyX');
  dispatchKey('keydown', 'ArrowUp');
  assert.equal(keyboard.sample().throttle, true);
  dispatchKey('keyup', 'KeyX');
  assert.equal(keyboard.sample().throttle, true);
  dispatchKey('keyup', 'ArrowUp');
  assert.equal(keyboard.sample().throttle, false);

  dispatchKey('keydown', 'KeyZ');
  dispatchKey('keydown', 'ArrowDown');
  assert.equal(keyboard.sample().brake, true);
  dispatchKey('keyup', 'KeyZ');
  assert.equal(keyboard.sample().brake, true);
  lifecycle.dispatch('blur');
  assert.deepEqual(keyboard.sample(), { steering: 0, throttle: false, brake: false });
});

test('keyboard pedals are exclusive last-pressed-wins and resume an older held pedal', () => {
  const lifecycle = new FakeEventTarget();
  const visibility = new FakeEventTarget();
  visibility.visibilityState = 'visible';
  const keyboard = new KeyboardInput(lifecycle, visibility);
  const key = (type, code) => lifecycle.dispatch(type, { code, preventDefault() {} });

  key('keydown', 'KeyX');
  assert.deepEqual(keyboard.sample(), { steering: 0, throttle: true, brake: false });
  key('keydown', 'KeyZ');
  assert.deepEqual(keyboard.sample(), { steering: 0, throttle: false, brake: true });
  key('keyup', 'KeyZ');
  assert.deepEqual(keyboard.sample(), { steering: 0, throttle: true, brake: false });
  key('keyup', 'KeyX');
  assert.deepEqual(keyboard.sample(), { steering: 0, throttle: false, brake: false });
});

test('pedal arbiter preserves exact recency across aliases and devices', () => {
  const pedals = new PedalInputArbiter();
  pedals.setSource('keyboard:KeyZ', 'brake', true);
  pedals.setSource('keyboard:KeyX', 'throttle', true);
  pedals.setSource('touch:brake:7', 'brake', true);
  assert.deepEqual(pedals.sample(), { throttle: false, brake: true });

  pedals.setSource('keyboard:KeyX', 'throttle', true);
  pedals.setSource('keyboard:KeyZ', 'brake', false);
  assert.deepEqual(pedals.sample(), { throttle: false, brake: true });

  pedals.setSource('touch:brake:7', 'brake', false);
  assert.deepEqual(pedals.sample(), { throttle: true, brake: false });
  pedals.setSource('keyboard:KeyX', 'throttle', false);
  assert.deepEqual(pedals.sample(), { throttle: false, brake: false });
});

test('keyboard throttle resumes after a later touch brake tap through one shared arbiter', () => {
  const lifecycle = new FakeEventTarget();
  const visibility = new FakeEventTarget();
  visibility.visibilityState = 'visible';
  const pedals = new PedalInputArbiter();
  const keyboard = new KeyboardInput(lifecycle, visibility, pedals);
  const throttleButton = new FakeElement();
  const brakeButton = new FakeElement();
  const touch = new TouchInput(
    new FakeElement(),
    new FakeElement(),
    throttleButton,
    brakeButton,
    lifecycle,
    visibility,
    pedals,
  );

  lifecycle.dispatch('keydown', { code: 'KeyX', preventDefault() {} });
  assert.deepEqual(keyboard.sample(), { steering: 0, throttle: true, brake: false });
  brakeButton.dispatch('pointerdown', pointerEvent(9));
  assert.deepEqual(touch.sample(), { steering: 0, throttle: false, brake: true });
  brakeButton.dispatch('pointerup', pointerEvent(9));
  assert.deepEqual(keyboard.sample(), { steering: 0, throttle: true, brake: false });
});

test('touch steering buttons publish left neutral or right digital request', () => {
  assert.equal(digitalTouchSteering(true, false), -1);
  assert.equal(digitalTouchSteering(false, false), 0);
  assert.equal(digitalTouchSteering(false, true), 1);
  assert.equal(digitalTouchSteering(true, true), 0);
});

test('input merge gives active touch steering priority and consumes one resolved pedal request', () => {
  const keyboard = { steering: -0.5, throttle: true, brake: false };
  const touch = { steering: 0.25, throttle: false, brake: true };

  assert.deepEqual(mergeDrivingInput(keyboard, touch, true, { throttle: false, brake: true }), {
    steering: 0.25,
    throttle: false,
    brake: true,
  });

  assert.deepEqual(mergeDrivingInput(keyboard, touch, false, { throttle: true, brake: false }), {
    steering: -0.5,
    throttle: true,
    brake: false,
  });
  assert.throws(
    () => mergeDrivingInput(keyboard, touch, false, { throttle: true, brake: true }),
    /mutually exclusive/,
  );
  assert.throws(
    () => assertExclusivePedalInput({ throttle: true, brake: true }),
    /mutually exclusive/,
  );
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
