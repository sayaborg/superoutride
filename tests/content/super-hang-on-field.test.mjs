import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { TEXT_COLUMNS } from '../../src/view/text-layer.js';

const content = await readDeliveredContent();
const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const catalog = await loadSeriesCatalog(
  content,
  vehicles,
  await loadScreenPictures(content),
  await loadMusic(content, TEXT_COLUMNS),
);

test('SUPER HANG-ON is a one-make of the NSR500 of 1984 in its eight liveries, the player in its own', () => {
  const series = catalog.series.find((s) => s.id === 'arcade-tribute-super-hang-on');
  const nsr = vehicles.find((v) => v.compiledVehicle.id === 'NSR500_1984');
  const own = nsr.listing.visuals.palette;
  // The rivals from the front, each in a livery of its own; the player, last, in the machine's own.
  const liveries = [
    'yellow-black',
    'green-yellow',
    'black-red',
    'sky-pink',
    'navy-orange',
    'lime-purple',
    'white-green',
    own,
  ];
  assert.deepEqual([...liveries].sort(), [...nsr.spriteSet.colors].sort());
  assert.equal(series.classes.length, 4);
  for (const runClass of series.classes) {
    assert.deepEqual(runClass.vehicles, ['NSR500_1984']);
    assert.deepEqual(
      runClass.entries.map((entry) => [entry.vehicle, entry.color, entry.slot]),
      liveries.map((color, slot) => ['NSR500_1984', color, slot]),
    );
    assert.equal(runClass.playerSlot, 'last');
    assert.equal(runClass.fixedColors, true);
    // Its traffic is the NSR500 alone, drawn in any of the set's colors.
    assert.deepEqual(runClass.traffic.vehicles, ['NSR500_1984']);
  }
});
