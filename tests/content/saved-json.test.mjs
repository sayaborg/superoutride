import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSavedJson } from '../../src/content/saved-json.js';

test('saved JSON layout parses back to the same value, empty containers included', () => {
  const long = 'x'.repeat(120);
  for (const value of [
    {},
    [],
    { [long]: [] },
    { [long]: {} },
    { a: { [long]: [] }, b: [[], {}, [1, 2]] },
    [{ [long]: [] }, { [long]: [1, 2, 3] }],
  ])
    assert.deepEqual(JSON.parse(formatSavedJson(value)), value);
});
