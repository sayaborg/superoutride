import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDrivingActuatorState,
  resetDrivingActuatorState,
  stepNormalizedActuator,
  updateDrivingActuators,
  validateDrivingActuatorProfile,
} from '../dist/physics/driving-actuator.js';

const DT = 1 / 720;
const PROFILE = Object.freeze({
  steering: Object.freeze({ applyRate: 1.6, releaseRate: 4 }),
  throttle: Object.freeze({ applyRate: 4, releaseRate: 8 }),
  brake: Object.freeze({ applyRate: 1 / 0.15, releaseRate: 10 }),
});
const neutral = Object.freeze({ steering: 0, throttle: false, brake: false });

function run(state, input, seconds) {
  const ticks = Math.round(seconds / DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    updateDrivingActuators(state, input, DT, PROFILE);
  }
}

test('zero request stays exactly neutral and all channels remain normalized', () => {
  validateDrivingActuatorProfile(PROFILE);
  const state = createDrivingActuatorState();
  run(state, neutral, 1);
  assert.deepEqual(state, { steering: 0, throttle: 0, brake: 0 });

  state.steering = 4;
  state.throttle = -2;
  state.brake = 3;
  updateDrivingActuators(state, { steering: -4, throttle: true, brake: false }, DT, PROFILE);
  assert.ok(state.steering >= -1 && state.steering <= 1);
  assert.ok(state.throttle >= 0 && state.throttle <= 1);
  assert.ok(state.brake >= 0 && state.brake <= 1);
});

test('one-tick request is smaller than held request and authored apply times reach full scale', () => {
  const oneTick = createDrivingActuatorState();
  updateDrivingActuators(oneTick, { steering: 1, throttle: true, brake: false }, DT, PROFILE);
  const held = createDrivingActuatorState();
  run(held, { steering: 1, throttle: true, brake: false }, 0.625);
  const oneTickBrake = createDrivingActuatorState();
  updateDrivingActuators(oneTickBrake, { steering: 0, throttle: false, brake: true }, DT, PROFILE);
  const heldBrake = createDrivingActuatorState();
  run(heldBrake, { steering: 0, throttle: false, brake: true }, 0.625);
  assert.ok(oneTick.steering < held.steering);
  assert.ok(oneTick.throttle < held.throttle);
  assert.ok(oneTickBrake.brake < heldBrake.brake);
  assert.equal(held.steering, 1);
  assert.equal(held.throttle, 1);
  assert.equal(heldBrake.brake, 1);
});

test('release is finite monotone and exact with steering faster than application', () => {
  const state = { steering: 1, throttle: 1, brake: 1 };
  updateDrivingActuators(state, neutral, DT, PROFILE);
  assert.ok(state.steering > 0 && state.steering < 1);
  assert.ok(state.throttle > 0 && state.throttle < 1);
  assert.ok(state.brake > 0 && state.brake < 1);
  const first = { ...state };
  run(state, neutral, 0.25);
  assert.deepEqual(state, { steering: 0, throttle: 0, brake: 0 });
  assert.ok(first.steering < 1 - PROFILE.steering.applyRate * DT + 1e-12);
});

test('exclusive pedal handoff preserves ordinary independent finite actuator response', () => {
  const state = createDrivingActuatorState();
  run(state, { steering: 0, throttle: true, brake: false }, 0.25);
  assert.equal(state.throttle, 1);
  assert.equal(state.brake, 0);

  updateDrivingActuators(
    state,
    { steering: 0, throttle: false, brake: true },
    DT,
    PROFILE,
  );
  assert.ok(state.throttle > 0 && state.throttle < 1);
  assert.ok(state.brake > 0 && state.brake < 1);
});

test('opposite steering request uses apply rate continuously through neutral', () => {
  let value = 1;
  const samples = [];
  for (let tick = 0; tick < 900; tick += 1) {
    value = stepNormalizedActuator(value, -1, DT, PROFILE.steering, -1, 1);
    samples.push(value);
  }
  assert.ok(samples.every((sample, index) => index === 0 || sample <= samples[index - 1]));
  assert.equal(value, -1);
  assert.ok(Math.abs(samples[449]) < 1e-12);
});

test('fixed-tick actuator replay is deterministic and reset neutralizes every channel', () => {
  const trace = Array.from({ length: 600 }, (_, tick) => ({
    steering: tick < 180 ? 1 : tick < 360 ? -1 : 0,
    throttle: tick < 420 && tick % 12 < 5,
    brake: tick >= 420,
  }));
  const replay = () => {
    const state = createDrivingActuatorState();
    for (const input of trace) updateDrivingActuators(state, input, DT, PROFILE);
    return state;
  };
  assert.deepEqual(replay(), replay());
  const state = replay();
  resetDrivingActuatorState(state);
  assert.deepEqual(state, { steering: 0, throttle: 0, brake: 0 });
});

test('actuator boundary rejects contradictory canonical pedal requests instead of choosing a winner', () => {
  const state = createDrivingActuatorState();
  assert.throws(
    () => updateDrivingActuators(
      state,
      { steering: 0, throttle: true, brake: true },
      DT,
      PROFILE,
    ),
    /mutually exclusive/,
  );
  assert.deepEqual(state, { steering: 0, throttle: 0, brake: 0 });
});

test('actuator profile rejects non-positive or non-finite rates', () => {
  assert.throws(() => validateDrivingActuatorProfile({
    ...PROFILE,
    throttle: { applyRate: 0, releaseRate: 8 },
  }), /apply rate/);
  assert.throws(() => validateDrivingActuatorProfile({
    ...PROFILE,
    brake: { applyRate: 1, releaseRate: Number.NaN },
  }), /release rate/);
});
