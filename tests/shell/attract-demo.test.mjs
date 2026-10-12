import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTRACT_SECONDS, createAttractDemo } from '../../src/shell/attract-demo.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

const TURN = Math.round(ATTRACT_SECONDS / SIM_DT);
const series = { id: 'series', title: 'SERIES' };
const classes = ['a', 'b', 'c'].map((id) => ({ series, id, title: id.toUpperCase(), vehicles: ['V'] }));
const vehicles = [
  {
    compiledVehicle: { id: 'V' },
    spriteSet: { colors: ['red'] },
    listing: { metadata: { manufacturer: 'Make', model: 'Model' }, visuals: { colorNames: { red: 'RED' } } },
  },
];

// A demo whose Sessions count their fixed steps; `endAfter` steps of a class end its Session.
function demoOf(endAfter = Infinity) {
  const sessions = [];
  const demo = createAttractDemo(classes, vehicles, async (request) => {
    const session = { classId: request.classId, steps: 0, disposed: false };
    sessions.push(session);
    return {
      run: { tick: () => session.steps++, draw() {}, dispose: () => (session.disposed = true) },
      finished: () => session.steps >= endAfter,
    };
  });
  return { demo, sessions };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const steps = (demo, count) => {
  for (let i = 0; i < count; i++) demo.tick();
};

test('each class keeps one Session, stepped only on its turn, which the next turn continues', async () => {
  const { demo, sessions } = demoOf();
  demo.enter();
  await settle();
  // The first class is shown from its start; the next is loaded meanwhile, not stepped.
  assert.deepEqual(
    sessions.map((s) => [s.classId, s.steps]),
    [
      ['a', 0],
      ['b', 0],
    ],
  );
  steps(demo, TURN);
  await settle();
  steps(demo, 2 * TURN);
  await settle();
  assert.deepEqual(
    sessions.map((s) => [s.classId, s.steps]),
    [
      ['a', TURN],
      ['b', TURN],
      ['c', TURN],
    ],
  );
  // The fourth turn continues the first class's Session from where its first turn left it.
  steps(demo, 10);
  assert.equal(sessions.length, 3);
  assert.equal(sessions[0].steps, TURN + 10);
  // Leaving pauses the Session as it is; returning resumes with the next class.
  demo.leave();
  steps(demo, 50);
  demo.enter();
  steps(demo, 5);
  assert.deepEqual(
    sessions.map((s) => s.steps),
    [TURN + 10, TURN + 5, TURN],
  );
});

test('a Session that ends ends its turn early and gives its class a new Session', async () => {
  const { demo, sessions } = demoOf(100);
  demo.enter();
  await settle();
  // The ended Session stops stepping and its turn darkens; the next class follows.
  steps(demo, 100 + 8);
  await settle();
  assert.equal(sessions[0].steps, 100);
  assert.ok(sessions[0].disposed);
  assert.equal(sessions.filter((s) => s.classId === 'a').length, 2, 'a new Session of the ended class is loaded');
  steps(demo, 1);
  assert.equal(sessions[1].classId, 'b');
  assert.equal(sessions[1].steps, 1);
});
