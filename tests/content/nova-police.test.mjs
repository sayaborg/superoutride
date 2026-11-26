import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const definition = async (id) =>
  JSON.parse(await readFile(new URL(`../../content/vehicles/${id}.json`, import.meta.url), 'utf8'));

// The police car of 1975 differs from the Nova of 1975 in its looks alone (K, 2026-11-26).
test('the Nova of 1975 and its police car have the same mechanics', async () => {
  assert.deepEqual(await definition('CHEVROLET_NOVA_POLICE_1975'), await definition('CHEVROLET_NOVA_1975'));
});
