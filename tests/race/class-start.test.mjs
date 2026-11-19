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
import { READY_SECONDS } from '../../src/course/run-rules.js';
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

/**
 * A class of TESTAROSSAs in slots 0 to `count` − 1 with `playerSlot`, `timeMargin` and `chase`; a CHASE's rival, its
 * second entry, in none.
 */
const runClass = (playerSlot, timeMargin, chase = null, count = 3) =>
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
      slot: chase && slot === 1 ? null : slot,
      ahead: null,
    })),
    playerSlot,
    chase,
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

test('CHASE: the rival passes the held player at its top speed READY_SECONDS into READY; GO comes its seconds later', () => {
  const seconds = 5;
  const { configuration, setup } = race(runClass('first', null, { seconds }, 2));
  assert.deepEqual(configuration.chase, { seconds });
  // The rival stands on no grid: it passes in the slot beside the player's.
  const [, chaser] = setup.entries;
  assert.equal(chaser.slot, null);
  assert.equal(chaser.beside, courseStartGrid(course.gates, false)[1]);
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const run = createCourseRace({ setup, runtime: scene.runtime });
  const at = (c) => c.actor.vehicle.course.s;
  const from = at(run.player);
  assert.equal(at(run.player), from);
  run.start();
  // From READY the gap is measured: its top speed for READY_SECONDS behind.
  const top = setup.mechanicsOf(chaser.vehicle).speedCap;
  assert.ok(Math.abs(run.rivalGap + top * READY_SECONDS) < 1e-6);
  const [rival] = run.rivals;
  // It comes at full throttle, no lamp lit and the player held where it stands, until it draws level.
  let steps = 0;
  while (at(rival) < at(run.player) || !rival.present) {
    assert.ok(steps++ < 600, 'the rival passes within ten seconds');
    assert.deepEqual([run.outcome.status, run.countdown.signalLamps, at(run.player)], ['READY', 0, from]);
    assert.ok(run.rivalGap < 0);
    run.advance(null);
  }
  // It draws level when READY_SECONDS have passed, as near as its speed holds at full throttle.
  assert.ok(Math.abs(steps * SIM_DT - READY_SECONDS) < 0.1, `${steps * SIM_DT} s`);
  // From there READY counts its seconds, the lamps lit in the last READY_SECONDS, the player still held, to GO.
  const lamps = [];
  while (run.outcome.status === 'READY') {
    lamps.push(run.countdown.signalLamps);
    assert.equal(at(run.player), from);
    run.advance(null);
  }
  // The step it drew level in counted the first of them.
  assert.equal(lamps.length + 1, Math.round(seconds / SIM_DT));
  assert.equal(lamps.filter((lit) => lit === 0).length + 1, Math.round((seconds - READY_SECONDS) / SIM_DT));
  assert.deepEqual([...new Set(lamps)], [0, 1, 2, 3]);
  assert.equal(run.clock.elapsedSeconds, 0);
  assert.ok(at(rival) > from && run.rivalGap > 0 && run.loneRivalId === rival.id);
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
