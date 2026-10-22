import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunEffects } from '../../src/shell/run-effects.js';

test('one explosion recording per contact sequence; leaving or replacing the run stops its handle', () => {
  const played = [],
    stopped = [];
  const effects = createRunEffects((name) => {
    const index = played.push(name) - 1;
    return { stop: () => stopped.push(index) };
  });
  const race = { countdown: { signalLamps: 0 }, outcome: { status: 'RUNNING' }, events: [], player: { id: 'player' } };
  const first = {};
  effects.step(first, race, 0);
  assert.deepEqual(played, []);
  for (let i = 0; i < 200; i++) effects.step(first, race, 1);
  assert.deepEqual(played, ['explosion']);
  effects.step(first, race, 2);
  assert.deepEqual(played, ['explosion', 'explosion']);
  assert.deepEqual(stopped, [0]);
  const next = {};
  effects.step(next, race, 0);
  assert.deepEqual(stopped, [0, 1]);
  effects.step(next, race, 1);
  assert.deepEqual(played, ['explosion', 'explosion', 'explosion']);
  effects.stop();
  assert.deepEqual(stopped, [0, 1, 2]);
});
