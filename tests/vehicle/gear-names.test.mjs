import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { compileVehicleDefinitions, loadVehicleSpriteSets } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { gearName, retuneVehicleMechanics } from '../../src/vehicle/definition-document.js';

const content = await readDeliveredContent();
const sounds = await loadEngineSounds(content);
const sprites = await loadVehicleSpriteSets(content);
const driving = await content.documents('driving'),
  mechanics = await content.documents('vehicle'),
  listings = await content.documents('vehicle-listing');
const ID = 'MCLAREN_M23_PP_SPEC';

/** The catalog with the M23's listing visuals given `visuals`. */
const catalog = (visuals) =>
  compileVehicleDefinitions(
    sprites,
    sounds,
    driving,
    mechanics,
    listings.map((file) =>
      file.id === ID ? { ...file, value: { ...file.value, visuals: { ...file.value.visuals, ...visuals } } } : file,
    ),
  );

test('a listing names each of its vehicle’s gears by a segment character, or none', () => {
  const delivered = catalog({});
  assert.ok(delivered.ok);
  const m23 = delivered.value.vehicles.find((v) => v.compiledVehicle.id === ID);
  assert.deepEqual(m23.listing.visuals.gearNames, ['L', 'H']);
  assert.deepEqual(
    [1, 2].map((gear) => gearName(m23.listing.visuals.gearNames, gear)),
    ['L', 'H'],
  );
  // A vehicle naming no gears shows each by its number.
  const lotus = delivered.value.vehicles.find((v) => v.compiledVehicle.id === 'LOTUS_79_SPECIAL');
  assert.equal(Object.hasOwn(lotus.listing.visuals, 'gearNames'), false);
  assert.deepEqual(
    [1, 2].map((gear) => gearName(lotus.listing.visuals.gearNames, gear)),
    ['1', '2'],
  );

  for (const [gearNames, pointer] of [
    [['L'], '/visuals/gearNames'],
    [['L', 'H', 'H'], '/visuals/gearNames'],
    [['L', 'X'], '/visuals/gearNames/1'],
    [['LO', 'H'], '/visuals/gearNames/0'],
  ]) {
    const rejected = catalog({ gearNames });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.diagnostics[0].path, pointer);
  }

  // A DEV retune keeps the listing, so its gears stay as many as the listing names.
  const source = mechanics.find((file) => file.id === ID).value;
  assert.ok(retuneVehicleMechanics(m23, source, 'retune').ok);
  const sixSpeed = {
    ...source,
    powertrain: { ...source.powertrain, gearRatios: [2.48, 1.94, 1.64, 1.44, 1.28, 1.18] },
  };
  const retuned = retuneVehicleMechanics(m23, sixSpeed, 'retune');
  assert.equal(retuned.ok, false);
  assert.equal(retuned.diagnostics[0].path, '/powertrain/gearRatios');
});
