import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';
import { compileRunConfiguration } from '../../src/race/run-configuration.js';
import { resolveRunSetup } from '../../src/race/run-setup.js';
import { weightedCandidate } from '../../src/race/traffic.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { createCourseScene } from '../../src/view/course-scene.js';

const content = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const catalog = { vehicles: definitions.vehicles };
const course = await loadDeliveredCourse(content, 'tsukuba', await loadSurfaceMaterials(content));
const vehicle = createRunVehicle(
  definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'),
  definitions.driving,
);
const color = vehicle.vehicleDefinition.listing.visuals.palette;

/** A class of TESTAROSSAs in slots 0 to `count` − 1 with `playerSlot`, `timeMargin` and `start`. */
const runClass = (playerSlot, timeMargin, start = 'grid', count = 3) =>
  Object.freeze({
    series: null,
    id: 'test',
    title: 'TEST',
    course: 'tsukuba',
    laps: 1,
    vehicles: ['TESTAROSSA'],
    entries: Array.from({ length: count }, (_, slot) => ({
      vehicle: 'TESTAROSSA',
      color,
      stages: null,
      slot,
      ahead: null,
    })),
    playerSlot,
    start,
    rankLimits: {},
    traffic: null,
    timeMargin,
    fixedColors: false,
  });

const race = (settings) => {
  const configuration = compileRunConfiguration(
    { mode: 'RACE', vehicleId: 'TESTAROSSA', color: null },
    course,
    settings,
    catalog,
  );
  const setup = resolveRunSetup(course, settings, configuration, 0, vehicle, null, { vehicleOf: () => ({ vehicle }) });
  return { configuration, setup };
};

test('a class without a margin races without a clock', () => {
  const { configuration, setup } = race(runClass('last', null));
  assert.equal(configuration.timeLimit, false);
  assert.equal(setup.budgets, null);
});

test('`first` puts the player in the frontmost slot and the others behind it, in order', () => {
  const grid = courseStartGrid(course.gates, false);
  const slots = (playerSlot) =>
    race(runClass(playerSlot, null)).setup.entries.map((entry) => [entry.id, grid.indexOf(entry.slot)]);
  assert.deepEqual(slots('first'), [
    ['PLAYER', 0],
    ['RIVAL_01', 1],
    ['RIVAL_02', 2],
  ]);
  assert.deepEqual(slots('last'), [
    ['PLAYER', 2],
    ['RIVAL_01', 0],
    ['RIVAL_02', 1],
  ]);
});

test('CHASE holds the player from GO until its rival, leaving from the slot behind, has passed it', () => {
  const { configuration, setup } = race(runClass('first', null, 'chase', 2));
  assert.equal(configuration.start, 'chase');
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const run = createCourseRace({ setup, runtime: scene.runtime });
  run.start();
  while (run.outcome.status === 'READY') run.advance(null);
  const [rival] = run.rivals;
  const from = run.player.progress.s;
  assert.ok(rival.progress.s < from);
  // Held where it stands while the rival is behind it; it leaves once the rival is ahead.
  let steps = 0;
  for (; rival.progress.s <= run.player.progress.s; steps++) {
    assert.ok(steps < 600, 'the rival passes within ten seconds');
    assert.equal(run.player.progress.s, from);
    run.advance(null);
  }
  assert.ok(steps > 0);
  for (let i = 0; i < 120; i++) run.advance(null);
  assert.ok(run.player.progress.s > from + 1, 'the player leaves');
});

test('a traffic draw falls on each candidate as many times as its weight, in order', () => {
  const candidates = [
    { id: 'A', weight: 3 },
    { id: 'B', weight: 1 },
    { id: 'C', weight: 2 },
  ];
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((draw) => weightedCandidate(candidates, draw).id),
    ['A', 'A', 'A', 'B', 'C', 'C'],
  );
  // With every weight 1 the draw is the candidate's index.
  const even = candidates.map(({ id }) => ({ id, weight: 1 }));
  assert.deepEqual(
    [0, 1, 2].map((draw) => weightedCandidate(even, draw).id),
    ['A', 'B', 'C'],
  );
  assert.throws(() => weightedCandidate(candidates, 6), RangeError);
});
