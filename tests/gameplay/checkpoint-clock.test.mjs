import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckpointClock } from '../../dist/gameplay/checkpoint-clock.js';
const gate = {},
  finish = {};
const event = (u, awardMs = 1000, lap = 1) => ({ gate, lap, u, awardMs, finish: false });

test('start/pause are simulation boundaries; exact checkpoint/expiry tie extends uncapped remaining time', () => {
  const clock = createCheckpointClock(1000);
  clock.advance(5, []);
  assert.equal(clock.elapsedSeconds, 0);
  clock.start();
  clock.advance(2, [event(0.5, 3000)]);
  assert.equal(clock.status, 'RUNNING');
  assert.equal(clock.remainingSeconds, 2);
  assert.equal(clock.checkpointCount, 1);
  clock.advance(0.5, [event(0.5, 9000)]);
  assert.equal(clock.remainingSeconds, 1.5, 'repeated occurrence grants nothing');
  clock.advance(0.5, [event(0.5, 1000, 2)]);
  assert.equal(clock.remainingSeconds, 2, 'a later lap is a distinct occurrence');
});

test('earlier expiry wins, exact FINISH tie wins, and results freeze at the event timestamp', () => {
  for (const [u, status, elapsed] of [
    [0.499, 'GOAL', 0.998],
    [0.5, 'GOAL', 1],
    [0.501, 'GAME_OVER', 1],
  ]) {
    const clock = createCheckpointClock(1000);
    clock.start();
    clock.advance(2, [{ gate: finish, lap: 1, u, finish: true, awardMs: 90000 }]);
    assert.equal(clock.status, status);
    assert.equal(clock.elapsedSeconds, elapsed);
    const remaining = clock.remainingSeconds;
    clock.advance(100, [event(0, 90000)]);
    assert.equal(clock.elapsedSeconds, elapsed);
    assert.equal(clock.remainingSeconds, remaining);
  }
});

test('multiple gates within one fixed step are processed chronologically with precise carry-over', () => {
  const clock = createCheckpointClock(100);
  clock.start();
  clock.advance(1, [
    event(0.1, 300),
    { ...event(0.4, 2000), gate: {} },
    { gate: finish, lap: 1, u: 0.9, finish: true, awardMs: 0 },
  ]);
  assert.equal(clock.status, 'GOAL');
  assert.equal(clock.elapsedSeconds, 0.9);
  assert.equal(clock.remainingSeconds, 1.5);
  assert.equal(clock.checkpointCount, 2);
});

test('untimed CUSTOM still needs an accepted FINISH and records elapsed simulation time', () => {
  const clock = createCheckpointClock(null);
  clock.start();
  clock.advance(10, []);
  assert.equal(clock.status, 'RUNNING');
  assert.equal(clock.remainingSeconds, null);
  clock.advance(1, [{ gate: finish, lap: 1, u: 0.25, finish: true, awardMs: 0 }]);
  assert.equal(clock.status, 'GOAL');
  assert.equal(clock.elapsedSeconds, 10.25);
});
