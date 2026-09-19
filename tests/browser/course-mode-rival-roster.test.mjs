import assert from 'node:assert/strict';

import test from 'node:test';

import { compileSessionConfiguration, MAX_RIVAL_COUNT } from '../../dist/gameplay/session-configuration.js';
import { createRivalRoster } from '../../dist/runtime/rival-roster.js';

test('document 117 moves the unchanged 0..16 opponent envelope to session configuration', () => {
  assert.equal(MAX_RIVAL_COUNT, 16);
  assert.equal(compileSessionConfiguration({ rivalCount: 0 }).rivalCount, 0);
  assert.equal(compileSessionConfiguration({ rivalCount: 16 }).rivalCount, 16);

  for (const rivalCount of [-1, 1.5, 17, NaN, Infinity, undefined]) {
    assert.throws(() => compileSessionConfiguration({ rivalCount }), /rivalCount must be an integer within 0\.\.16/);
  }
});

test('roster is a stable variable-length actor list with no null-rival special case', () => {
  const zero = createRivalRoster(compileSessionConfiguration({ rivalCount: 0 }));
  const max = createRivalRoster(compileSessionConfiguration({ rivalCount: 16 }));

  assert.deepEqual(zero, []);
  assert.equal(max.length, 16);
  assert.equal(max[0].actorId, 'RIVAL_01');
  assert.equal(max[15].actorId, 'RIVAL_16');
  assert.deepEqual(
    max.map((entry) => entry.rivalIndex),
    [...Array(16).keys()],
  );
  assert.equal(new Set(max.map((entry) => entry.actorId)).size, 16);
});
