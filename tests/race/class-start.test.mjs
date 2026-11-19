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
import { READY_SECONDS } from '../../src/race/start-phase.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
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

test('CHASE: READY holds the player while the rival leaves from behind; the lamps count once it has passed, to GO', () => {
  const { configuration, setup } = race(runClass('first', null, 'chase', 2));
  assert.equal(configuration.start, 'chase');
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const run = createCourseRace({ setup, runtime: scene.runtime });
  run.start();
  const [rival] = run.rivals;
  const at = (c) => c.actor.vehicle.course.s;
  const from = at(run.player);
  assert.ok(at(rival) < from);
  // The rival drives through READY, no lamp lit and the player held where it stands, until it is ahead.
  let steps = 0;
  while (at(rival) <= at(run.player)) {
    assert.ok(steps++ < 600, 'the rival passes within ten seconds');
    assert.deepEqual([run.outcome.status, run.countdown.signalLamps, at(run.player)], ['READY', 0, from]);
    run.advance(null);
  }
  assert.ok(steps > 0);
  // From there the lamps count READY's seconds as any start's, the player still held, to GO.
  let counted = 1;
  while (run.outcome.status === 'READY') {
    assert.ok(run.countdown.signalLamps >= 1);
    assert.equal(at(run.player), from);
    run.advance(null);
    counted++;
  }
  assert.equal(counted, Math.round(READY_SECONDS / SIM_DT));
  assert.equal(run.clock.elapsedSeconds, 0);
  assert.ok(at(rival) > from);
  // From GO both run, and the rival's crossings count in race time from where it stood at GO.
  let crossed = false;
  for (let i = 0; i < 3000 && !crossed; i++) {
    run.advance(null);
    crossed = run.events.some((event) => event.competitorId === rival.id);
  }
  assert.ok(crossed, 'the rival crosses its next gate after GO');
  assert.ok(at(run.player) > from + 1, 'the player leaves');
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
