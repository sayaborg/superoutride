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

const content = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const catalog = { vehicles: definitions.vehicles, freePlay: await loadFreePlayRules(content) };
const course = await loadDeliveredCourse(content, 'tsukuba', await loadSurfaceMaterials(content));
const vehicle = createRunVehicle(
  definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'),
  definitions.driving,
);

/** A FREE PLAY run's entries on TSUKUBA with `rivalCount` rivals, each a TESTAROSSA. */
function freePlay(rivalCount) {
  const configuration = compileRunConfiguration(
    {
      mode: 'FREE_PLAY',
      vehicleId: 'TESTAROSSA',
      color: null,
      lapCount: 1,
      rivalCount,
      rivalPool: 'CARS',
      traffic: 'OFF',
    },
    course,
    null,
    catalog,
  );
  return resolveRunSetup(course, null, configuration, 0, vehicle, null, {
    rivalPool: [{ vehicle: 'TESTAROSSA', color: vehicle.vehicleDefinition.listing.visuals.palette }],
    vehicleOf: () => ({ vehicle }),
  }).entries;
}

test('FREE PLAY fills the grid from the front, the rivals first and the player behind them', () => {
  const grid = courseStartGrid(course.gates, false);
  for (const rivals of [0, 3, 15]) {
    const entries = freePlay(rivals);
    const slotOf = new Map(entries.map((entry) => [entry.id, grid.indexOf(entry.slot)]));
    assert.equal(slotOf.get('PLAYER'), rivals, `${rivals} rivals`);
    for (let k = 0; k < rivals; k++) assert.equal(slotOf.get(`RIVAL_${String(k + 1).padStart(2, '0')}`), k);
  }
});
