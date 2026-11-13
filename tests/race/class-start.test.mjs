import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';
import { compileRunConfiguration } from '../../src/race/run-configuration.js';
import { resolveRunSetup } from '../../src/race/run-setup.js';
import { weightedCandidate } from '../../src/race/traffic.js';

const content = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const catalog = { vehicles: definitions.vehicles, freePlay: await loadFreePlayRules(content) };
const course = await loadDeliveredCourse(content, 'tsukuba', await loadSurfaceMaterials(content));
const vehicle = createRunVehicle(
  definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'),
  definitions.driving,
);
const color = vehicle.vehicleDefinition.listing.visuals.palette;

/** A class of three TESTAROSSAs in slots 0 to 2 with `playerSlot` and `timeMargin`. */
const runClass = (playerSlot, timeMargin) =>
  Object.freeze({
    series: null,
    id: 'test',
    title: 'TEST',
    course: 'tsukuba',
    laps: 1,
    vehicles: ['TESTAROSSA'],
    entries: [0, 1, 2].map((slot) => ({ vehicle: 'TESTAROSSA', color, stages: null, slot, ahead: null })),
    playerSlot,
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
