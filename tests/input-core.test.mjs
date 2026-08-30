import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExclusivePedalInput, clampSteering } from '../dist/input/driving-input.js';
import { KeyboardInput } from '../dist/input/keyboard-input.js';
import { PedalInputArbiter } from '../dist/input/pedal-input-arbiter.js';
import { SteeringInputArbiter } from '../dist/input/steering-input-arbiter.js';
import { TouchInput } from '../dist/input/touch-input.js';

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

test('steering arbiter publishes one digital source and never resumes a superseded source', () => {
  const steering = new SteeringInputArbiter();
  steering.press('keyboard:ArrowLeft', -1);
  assert.equal(steering.sample(), -1);
  steering.release('keyboard:ArrowLeft');
  assert.equal(steering.sample(), 0);

  steering.press('keyboard:ArrowRight', 1);
  steering.press('touch:left:7', -1);
  assert.equal(steering.sample(), -1);
  steering.release('touch:left:7');
  assert.equal(steering.sample(), 0);
  steering.release('keyboard:ArrowRight');
  assert.equal(steering.sample(), 0);
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

test('canonical pedal requests remain exclusive after steering authority is separated', () => {
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

  lifecycle.dispatch('pointerup', pointerEvent(7));
  assert.equal(touch.sample().steering, 0);
  assert.equal(right.activeClasses.has('active'), false);
});

test('touch opposite correction supersedes a stale pointer and releases to exact neutral', () => {
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
  assert.equal(touch.sample().steering, -1);
  left.dispatch('pointerup', pointerEvent(12));
  assert.equal(touch.sample().steering, 0);
  assert.equal(right.activeClasses.has('active'), false);
});

test('keyboard opposite correction neutralizes a stale key and repeat cannot resurrect it', () => {
  const lifecycle = new FakeEventTarget();
  const visibility = new FakeEventTarget();
  visibility.visibilityState = 'visible';
  const keyboard = new KeyboardInput(lifecycle, visibility);
  const key = (type, code, repeat = false) => lifecycle.dispatch(type, {
    code,
    repeat,
    preventDefault() {},
  });

  key('keydown', 'ArrowRight');
  assert.equal(keyboard.sample().steering, 1);
  key('keydown', 'ArrowLeft');
  assert.equal(keyboard.sample().steering, -1);
  key('keyup', 'ArrowLeft');
  assert.equal(keyboard.sample().steering, 0);
  key('keydown', 'ArrowRight', true);
  assert.equal(keyboard.sample().steering, 0);
  key('keyup', 'ArrowRight');
  assert.equal(keyboard.sample().steering, 0);
});

test('keyboard correction supersedes a stale touch source through one shared steering arbiter', () => {
  const lifecycle = new FakeEventTarget();
  const visibility = new FakeEventTarget();
  visibility.visibilityState = 'visible';
  const steering = new SteeringInputArbiter();
  const keyboard = new KeyboardInput(lifecycle, visibility, new PedalInputArbiter(), steering);
  const right = new FakeElement();
  const touch = new TouchInput(
    new FakeElement(),
    right,
    new FakeElement(),
    new FakeElement(),
    lifecycle,
    visibility,
    new PedalInputArbiter(),
    steering,
  );

  right.dispatch('pointerdown', pointerEvent(21));
  assert.equal(touch.sample().steering, 1);
  lifecycle.dispatch('keydown', { code: 'ArrowLeft', repeat: false, preventDefault() {} });
  assert.equal(keyboard.sample().steering, -1);
  lifecycle.dispatch('keyup', { code: 'ArrowLeft', repeat: false, preventDefault() {} });
  assert.equal(touch.sample().steering, 0);
});

test('blur pagehide and hidden visibility reset the active steering source', () => {
  for (const lifecycleEvent of ['blur', 'pagehide']) {
    const lifecycle = new FakeEventTarget();
    const visibility = new FakeEventTarget();
    visibility.visibilityState = 'visible';
    const keyboard = new KeyboardInput(lifecycle, visibility);
    lifecycle.dispatch('keydown', { code: 'ArrowRight', repeat: false, preventDefault() {} });
    assert.equal(keyboard.sample().steering, 1);
    lifecycle.dispatch(lifecycleEvent);
    assert.equal(keyboard.sample().steering, 0);
  }

  const lifecycle = new FakeEventTarget();
  const visibility = new FakeEventTarget();
  visibility.visibilityState = 'visible';
  const right = new FakeElement();
  const touchWithRight = new TouchInput(
    new FakeElement(),
    right,
    new FakeElement(),
    new FakeElement(),
    lifecycle,
    visibility,
  );
  right.dispatch('pointerdown', pointerEvent(31));
  assert.equal(touchWithRight.sample().steering, 1);
  visibility.visibilityState = 'hidden';
  visibility.dispatch('visibilitychange');
  assert.equal(touchWithRight.sample().steering, 0);
});
