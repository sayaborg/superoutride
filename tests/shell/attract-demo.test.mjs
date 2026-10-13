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

// A demo whose runs count their fixed steps; `endAfter` steps of a class end its run.
function demoOf(endAfter = Infinity) {
  const runs = [];
  const demo = createAttractDemo(classes, vehicles, async (request) => {
    const run = { classId: request.classId, steps: 0, disposed: false };
    runs.push(run);
    return {
      run: { tick: () => run.steps++, draw() {}, dispose: () => (run.disposed = true) },
      finished: () => run.steps >= endAfter,
    };
  });
  return { demo, runs };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const steps = (demo, count) => {
  for (let i = 0; i < count; i++) demo.tick();
};

// The runs the demo holds: loaded and not released.
const held = (runs) => runs.filter((s) => !s.disposed).map((s) => s.classId);

test("the demo holds the shown and the next class's runs, and a class shown again starts a new one", async () => {
  const { demo, runs } = demoOf();
  demo.enter();
  await settle();
  // The first class is shown from its start; the next is loaded meanwhile, not stepped.
  assert.deepEqual(
    runs.map((s) => [s.classId, s.steps]),
    [
      ['a', 0],
      ['b', 0],
    ],
  );
  steps(demo, TURN);
  await settle();
  // The first turn's run is released; the second class is shown and the third loaded.
  assert.deepEqual(held(runs), ['b', 'c']);
  steps(demo, 2 * TURN);
  await settle();
  assert.deepEqual(
    runs.map((s) => [s.classId, s.steps]),
    [
      ['a', TURN],
      ['b', TURN],
      ['c', TURN],
      ['a', 0],
      ['b', 0],
    ],
  );
  // The fourth turn shows the first class again from a new run.
  steps(demo, 10);
  assert.equal(runs[3].steps, 10);
  assert.deepEqual(held(runs), ['a', 'b']);
  // Leaving ends the shown turn; returning resumes with the next class, whose run stood loaded.
  demo.leave();
  steps(demo, 50);
  assert.deepEqual(held(runs), ['b']);
  demo.enter();
  steps(demo, 5);
  await settle();
  assert.equal(runs[4].steps, 5);
  assert.deepEqual(held(runs), ['b', 'c']);
});

test('a run that ends ends its turn early and is released', async () => {
  const { demo, runs } = demoOf(100);
  demo.enter();
  await settle();
  // The ended run stops stepping and its turn darkens; the next class follows.
  steps(demo, 100 + 8);
  await settle();
  assert.equal(runs[0].steps, 100);
  assert.ok(runs[0].disposed);
  steps(demo, 1);
  assert.equal(runs[1].classId, 'b');
  assert.equal(runs[1].steps, 1);
  assert.deepEqual(held(runs), ['b', 'c']);
});
