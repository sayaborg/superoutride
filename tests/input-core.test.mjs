import assert from 'node:assert/strict';
import test from 'node:test';

import { clampSteering } from '../dist/input/driving-input.js';
import { mergeDrivingInput } from '../dist/input/input-manager.js';
import { digitalKeyboardSteering } from '../dist/input/keyboard-input.js';
import { digitalTouchSteering } from '../dist/input/touch-input.js';

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
