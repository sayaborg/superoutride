import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const definition = async (id) =>
  JSON.parse(await readFile(new URL(`../../content/vehicles/${id}.json`, import.meta.url), 'utf8'));

// The police car of 1984 differs from the 300ZX 2+2 of 1984 in its looks alone (K, 2026-11-27).
test('the 300ZX 2+2 of 1984 and its police car have the same mechanics', async () => {
  assert.deepEqual(await definition('NISSAN_300ZX_2PLUS2_POLICE_1984'), await definition('NISSAN_300ZX_2PLUS2_1984'));
});
