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

// The Sessions the demo holds: loaded and not released.
const held = (sessions) => sessions.filter((s) => !s.disposed).map((s) => s.classId);

test("the demo holds the shown and the next class's Sessions, and a class shown again starts a new one", async () => {
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
  // The first turn's Session is released; the second class is shown and the third loaded.
  assert.deepEqual(held(sessions), ['b', 'c']);
  steps(demo, 2 * TURN);
  await settle();
  assert.deepEqual(
    sessions.map((s) => [s.classId, s.steps]),
    [
      ['a', TURN],
      ['b', TURN],
      ['c', TURN],
      ['a', 0],
      ['b', 0],
    ],
  );
  // The fourth turn shows the first class again from a new Session.
  steps(demo, 10);
  assert.equal(sessions[3].steps, 10);
  assert.deepEqual(held(sessions), ['a', 'b']);
  // Leaving ends the shown turn; returning resumes with the next class, whose Session stood loaded.
  demo.leave();
  steps(demo, 50);
  assert.deepEqual(held(sessions), ['b']);
  demo.enter();
  steps(demo, 5);
  await settle();
  assert.equal(sessions[4].steps, 5);
  assert.deepEqual(held(sessions), ['b', 'c']);
});

test('a Session that ends ends its turn early and is released', async () => {
  const { demo, sessions } = demoOf(100);
  demo.enter();
  await settle();
  // The ended Session stops stepping and its turn darkens; the next class follows.
  steps(demo, 100 + 8);
  await settle();
  assert.equal(sessions[0].steps, 100);
  assert.ok(sessions[0].disposed);
  steps(demo, 1);
  assert.equal(sessions[1].classId, 'b');
  assert.equal(sessions[1].steps, 1);
  assert.deepEqual(held(sessions), ['b', 'c']);
});
