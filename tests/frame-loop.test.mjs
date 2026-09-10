import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameLoop, MAX_FRAME_ELAPSED_SECONDS } from '../dist/browser/frame-loop.js';
import { SIM_DT } from '../dist/core/constants.js';

function clockFixture() {
  let now = 0,
    sequence = 0;
  const callbacks = new Map();
  return {
    callbacks,
    now: () => now,
    request(callback) {
      const id = ++sequence;
      callbacks.set(id, callback);
      return id;
    },
    cancel: (id) => callbacks.delete(id),
    frame(time) {
      now = time;
      const [id, callback] = callbacks.entries().next().value;
      callbacks.delete(id);
      callback(now);
    },
  };
}

test('one scheduler preserves fractional ticks and renders frames with no physics step', () => {
  const clock = clockFixture(),
    steps = [];
  let renders = 0;
  const loop = createFrameLoop(
    (dt) => steps.push(dt),
    () => renders++,
    clock,
  );
  loop.start();
  loop.start();
  assert.equal(clock.callbacks.size, 1);
  clock.frame(0);
  clock.frame(10);
  clock.frame(20);
  clock.frame(40);
  assert.deepEqual(steps, [SIM_DT, SIM_DT]);
  assert.equal(renders, 4);
  clock.frame(10000);
  assert.equal(steps.length, 2 + Math.floor(MAX_FRAME_ELAPSED_SECONDS / SIM_DT));
  assert.ok(steps.every((dt) => dt === SIM_DT));
  loop.stop();
  assert.equal(clock.callbacks.size, 0);
  loop.start();
  clock.frame(10000);
  assert.equal(steps.length, 17, 'restart discards the former fractional accumulator');
  loop.stop();
});

test('stopping from a tick cancels further catch-up and rendering', () => {
  const clock = clockFixture();
  let ticks = 0,
    renders = 0;
  const loop = createFrameLoop(
    () => {
      ticks++;
      loop.stop();
    },
    () => renders++,
    clock,
  );
  loop.start();
  clock.frame(250);
  assert.equal(ticks, 1);
  assert.equal(renders, 0);
  assert.equal(clock.callbacks.size, 0);
});

test('a restart inside rendering and an already queued stale callback cannot duplicate the loop', () => {
  const clock = clockFixture();
  let renders = 0;
  const loop = createFrameLoop(
    () => {},
    () => {
      renders++;
      if (renders === 1) {
        loop.stop();
        loop.start();
      }
    },
    clock,
  );
  loop.start();
  const stale = clock.callbacks.values().next().value;
  clock.frame(0);
  assert.equal(clock.callbacks.size, 1);
  stale(250);
  assert.equal(renders, 1);
  assert.equal(clock.callbacks.size, 1);
  clock.frame(0);
  assert.equal(renders, 2);
  loop.stop();
});
