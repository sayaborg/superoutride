import assert from 'node:assert/strict';
import test from 'node:test';

import { clampSteering } from '../dist/input/driving-input.js';
import { mergeDrivingInput } from '../dist/input/input-manager.js';
import { stepKeyboardSteering } from '../dist/input/steering-filter.js';
import { steeringFromPointerX } from '../dist/input/touch-input.js';

test('clampSteering keeps canonical range', () => {
  assert.equal(clampSteering(-2), -1);
  assert.equal(clampSteering(2), 1);
  assert.equal(clampSteering(0.25), 0.25);
});

test('keyboard steering ramps to full lock instead of jumping', () => {
  assert.equal(stepKeyboardSteering(0, true, false, 1 / 60), -4 / 60);
  assert.equal(stepKeyboardSteering(0, false, true, 1 / 60), 4 / 60);
  assert.equal(stepKeyboardSteering(0, true, false, 1), -1);
});

test('keyboard steering returns toward center when released or both keys are held', () => {
  assert.equal(stepKeyboardSteering(1, false, false, 1 / 6), 0);
  assert.equal(stepKeyboardSteering(-1, true, true, 1 / 6), 0);
});

test('touch X maps continuously to -1..+1', () => {
  assert.equal(steeringFromPointerX(100, 100, 200), -1);
  assert.equal(steeringFromPointerX(200, 100, 200), 0);
  assert.equal(steeringFromPointerX(300, 100, 200), 1);
  assert.equal(steeringFromPointerX(350, 100, 200), 1);
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
