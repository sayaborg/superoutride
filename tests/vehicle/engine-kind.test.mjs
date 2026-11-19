import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { compileVehicleDefinitions, loadVehicleSpriteSets } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';

const content = await readDeliveredContent();
const sounds = await loadEngineSounds(content);
const sprites = await loadVehicleSpriteSets(content);
const driving = await content.documents('driving'),
  mechanics = await content.documents('vehicle'),
  listings = await content.documents('vehicle-listing');

/** The catalog with vehicle `id`'s listing giving its engine as `engineKind`. */
const catalog = (id, engineKind) =>
  compileVehicleDefinitions(
    sprites,
    sounds,
    driving,
    mechanics,
    listings.map((file) =>
      file.id === id ? { ...file, value: { ...file.value, metadata: { ...file.value.metadata, engineKind } } } : file,
    ),
  );

test('a listing’s engine kind is its own, and agrees with its mechanics’ cycle', () => {
  const delivered = catalog(null);
  assert.ok(delivered.ok);
  const kind = (id) => delivered.value.vehicles.find((v) => v.compiledVehicle.id === id).listing.metadata.engineKind;
  // The rotary and the two-strokes share the cycle 2, not the kind.
  assert.deepEqual(['RX_7_TURBO_II_1987', 'NSR500_1987', 'TESTAROSSA'].map(kind), ['rotary', '2-stroke', '4-stroke']);
  for (const [id, engineKind, path] of [
    ['TESTAROSSA', 'rotary', '/metadata/engineKind'],
    ['RX_7_TURBO_II_1987', '4-stroke', '/metadata/engineKind'],
    ['NSR500_1987', 'two-stroke', '/metadata/engineKind'],
  ]) {
    const rejected = catalog(id, engineKind);
    assert.equal(rejected.ok, false, `${id} ${engineKind}`);
    assert.equal(rejected.diagnostics[0].path, path);
  }
});
