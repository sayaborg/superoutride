import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { formPool } from '../../src/race/free-play-field.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createRivalPace, rivalTargetUtilization } from '../../src/race/rival-pace.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const freePlay = await loadFreePlayRules(content);
const catalog = { vehicles: definitions.vehicles, driving: definitions.driving, materials, freePlay };
const role = definitions.driving.compiledDriving.roles.rival;
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

test('a rival heads for its level utilization level with the player, the least far ahead, the most far behind', () => {
  assert.deepEqual(
    [role.utilization, role.leastUtilization, role.mostUtilization, role.spanMeters, role.responseSeconds],
    [0.85, 0.7, 0.98, 200, 6],
  );
  for (const [lead, expected] of [
    [0, 0.85],
    [100, 0.775],
    [-100, 0.915],
    [200, 0.7],
    [-200, 0.98],
    [400, 0.7],
    [-400, 0.98],
  ])
    assert.ok(close(rivalTargetUtilization(role, lead), expected), `${lead} m: ${rivalTargetUtilization(role, lead)}`);
});

test("a rival's utilization starts level and closes 63 % of a step change in its response time", () => {
  const pace = createRivalPace(role, SIM_DT);
  assert.equal(pace.utilization, role.utilization);
  const steps = Math.round(role.responseSeconds / SIM_DT);
  for (let i = 0; i < steps; i++) pace.update(-400);
  const closed = (pace.utilization - role.utilization) / (role.mostUtilization - role.utilization);
  assert.ok(close(closed, 1 - Math.exp(-1), 1e-6), `${closed}`);
});

test('a lap ahead or behind holds a bound', () => {
  const lap = 2045;
  for (const [lead, bound] of [
    [lap, role.leastUtilization],
    [-lap, role.mostUtilization],
  ]) {
    const pace = createRivalPace(role, SIM_DT);
    for (let i = 0; i < 6000; i++) pace.update(lead);
    assert.ok(close(pace.utilization, bound, 1e-6), `${lead}: ${pace.utilization}`);
  }
});

/** A run on TSUKUBA through READY to GO and `steps` steps from it, the player driven by its standard driver. */
async function run(request, runClass, steps) {
  const course = await loadDeliveredCourse(content, 'tsukuba', materials);
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const prepared = await prepareRun(content, catalog, course, runClass, request);
  const setup = prepared.resolve(0);
  const race = createCourseRace({ setup, runtime: scene.runtime });
  race.start();
  while (race.outcome.status === 'READY') race.advance(null);
  // Each rival's utilization replayed from its lead over the player, step by step.
  const replays = race.rivals.map(() => createRivalPace(role, SIM_DT));
  for (let i = 0; i < steps; i++) {
    const leads = race.rivals.map((rival) => rival.progress.s - race.player.progress.s);
    race.advance(null);
    replays.forEach((replay, k) => race.rivals[k].present && replay.update(leads[k]));
  }
  return { race, setup, replays };
}

test('RACE and FREE PLAY rivals follow the player by one rule, at their vehicles’ whole speed', async () => {
  // A class of four TESTAROSSAs without a clock, the player in the last slot.
  const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA');
  const color = entry.listing.visuals.palette;
  const runClass = Object.freeze({
    series: null,
    id: 'test',
    title: 'TEST',
    course: 'tsukuba',
    laps: 1,
    vehicles: ['TESTAROSSA'],
    entries: [0, 1, 2, 3].map((slot) => ({ vehicle: 'TESTAROSSA', color, stages: null, slot, ahead: null })),
    playerSlot: 'last',
    rankLimits: {},
    traffic: null,
    timeMargin: null,
    fixedColors: false,
  });
  const runs = [
    await run({ mode: 'RACE', vehicleId: entry.compiledVehicle.id, color: null }, runClass, 300),
    await run(
      {
        mode: 'FREE_PLAY',
        vehicleId: entry.compiledVehicle.id,
        color: null,
        lapCount: 1,
        rivalCount: 3,
        rivalPool: formPool(freePlay, entry).id,
        traffic: 'OFF',
      },
      null,
      300,
    ),
  ];
  for (const { race, setup, replays } of runs) {
    assert.ok(race.rivals.length > 0);
    race.rivals.forEach((rival, k) => {
      const { driver } = rival.body.driving;
      assert.equal(driver.speedCap, setup.mechanicsOf(setup.entries[k + 1].vehicle).speedCap);
      assert.ok(close(driver.utilization, replays[k].utilization), `${rival.id}: ${driver.utilization}`);
      assert.notEqual(driver.utilization, role.utilization);
    });
    // The player's run driver is the standard driver.
    assert.equal(
      race.player.body.driving.driver.utilization,
      definitions.driving.compiledDriving.roles.standard.utilization,
    );
  }
});
