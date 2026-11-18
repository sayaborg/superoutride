import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { classOnCourse, loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';
import { compileRunConfiguration } from '../../src/race/run-configuration.js';
import { resolveRunSetup } from '../../src/race/run-setup.js';

const content = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const catalog = { vehicles: definitions.vehicles };
const series = await loadSeriesCatalog(
  content,
  definitions.vehicles,
  await loadScreenPictures(content),
  await loadMusic(content, TEXT_COLUMNS),
);
const course = await loadDeliveredCourse(content, 'tsukuba', await loadSurfaceMaterials(content));
const vehicle = createRunVehicle(
  definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA'),
  definitions.driving,
);

/** FREE PLAY's RACE on TSUKUBA with the TESTAROSSA, its field cut to `rivals` rivals: its run's entries. */
function freePlayRace(rivals) {
  const onCourse = classOnCourse(series.seriesClass('free-play', 'race'), course, 'TESTAROSSA', definitions.vehicles);
  const runClass = { ...onCourse, entries: onCourse.entries.slice(0, rivals + 1) };
  const configuration = compileRunConfiguration(
    { mode: 'RACE', vehicleId: 'TESTAROSSA', color: null },
    course,
    runClass,
    catalog,
  );
  return resolveRunSetup(course, runClass, configuration, 0, vehicle, null, { vehicleOf: () => ({ vehicle }) }).entries;
}

test("FREE PLAY's RACE fills the grid from the front, the rivals first and the player behind them", () => {
  const grid = courseStartGrid(course.gates, false);
  for (const rivals of [0, 3, 15]) {
    const entries = freePlayRace(rivals);
    const slotOf = new Map(entries.map((entry) => [entry.id, grid.indexOf(entry.slot)]));
    assert.equal(slotOf.get('PLAYER'), rivals, `${rivals} rivals`);
    for (let k = 0; k < rivals; k++) assert.equal(slotOf.get(`RIVAL_${String(k + 1).padStart(2, '0')}`), k);
  }
  // Its rivals are the player's vehicle, in colors the run's seed draws apart from the player's while it has others.
  const entries = freePlayRace(3);
  assert.ok(entries.every((entry) => entry.vehicle === vehicle));
  assert.ok(entries.slice(1).every((entry) => entry.color !== entries[0].color));
});
