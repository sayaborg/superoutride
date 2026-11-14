import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTRACT_SECONDS, createAttractDemo } from '../../src/shell/attract-demo.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

const TURN = Math.round(ATTRACT_SECONDS / SIM_DT);
const series = { id: 'series', title: 'SERIES', description: 'THE SERIES' };
const classes = ['a', 'b', 'c'].map((id) => ({ series, id, title: id.toUpperCase(), course: id, vehicles: ['V'] }));
const courses = ['a', 'b', 'c'].map((id) => ({ id, description: `COURSE ${id.toUpperCase()}` }));
const vehicles = [
  {
    compiledVehicle: { id: 'V' },
    spriteSet: { colors: ['red'] },
    listing: { metadata: { manufacturer: 'Make', model: 'Model' }, visuals: { colorNames: { red: 'RED' } } },
  },
];

// A demo whose reels count their race's fixed steps; `endAfter` steps of a class end its run. Each reel's course film
// lasts `intro` steps.
function demoOf(endAfter = Infinity, intro = 0) {
  const runs = [];
  const demo = createAttractDemo(classes, vehicles, courses, async (request, words) => {
    const run = { classId: request.classId, steps: 0, disposed: false };
    let introduced = 0;
    runs.push(run);
    return {
      films: [
        {
          words: words.course,
          get ended() {
            return introduced >= intro;
          },
          step: () => (introduced++, false),
          draw() {},
        },
        {
          words: words.series,
          get ended() {
            return run.steps >= endAfter;
          },
          step: () => (run.steps++, false),
          draw() {},
        },
      ],
      dispose: () => (run.disposed = true),
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
  // The ended run's turn ends there; the next class follows.
  steps(demo, 100);
  await settle();
  assert.equal(runs[0].steps, 100);
  assert.ok(runs[0].disposed);
  steps(demo, 1);
  assert.equal(runs[1].classId, 'b');
  assert.equal(runs[1].steps, 1);
  assert.deepEqual(held(runs), ['b', 'c']);
});

test("a turn thins in over the turn before, and the ticker runs the course's words, then the series'", async () => {
  const { demo } = demoOf(100, 40);
  demo.enter();
  await settle();
  const written = [];
  const text = { write: (column, row, line) => written.push([column, row, line]) };
  const frame = { width: 4, height: 4, pixels: new Uint16Array(16) };
  // The first turn thins in over black.
  demo.draw(frame, text);
  // The ticker's row: one character entering at the right edge after its first steps.
  const tickerOf = () => written.filter(([, row]) => row === 27);
  steps(demo, 3);
  written.length = 0;
  demo.draw(frame, text);
  assert.deepEqual(tickerOf(), [[39, 27, 'C']]);
  // When the course film ends the ticker starts again with the series' words.
  steps(demo, 40);
  written.length = 0;
  demo.draw(frame, text);
  assert.deepEqual(tickerOf(), [[39, 27, 'T']]);
});
