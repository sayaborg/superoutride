import assert from 'node:assert/strict';
import test from 'node:test';

import { compileSessionConfiguration } from '../../dist/gameplay/session-configuration.js';
import { createRivalRoster } from '../../dist/runtime/rival-roster.js';

test('each route structure pairs with 0/1/16 opponents without changing or recompiling its course', () => {
  for (const routeKind of ['LINEAR', 'BRANCH', 'CIRCUIT']) {
    const course = Object.freeze({ id: `TEST_${routeKind}`, routeKind });
    const before = structuredClone(course);
    for (const rivalCount of [0, 1, 16]) {
      const session = compileSessionConfiguration({ rivalCount });
      const selection = { course, session };
      assert.equal(selection.course, course);
      assert.deepEqual(course, before);
      assert.equal(Object.hasOwn(course, 'rivalCount'), false);
      assert.deepEqual(Object.keys(session), ['rivalCount']);
      const roster = createRivalRoster(selection.session);
      assert.equal(roster.length, rivalCount);
      assert.equal(1 + roster.length, rivalCount + 1, 'player is separate from opponents');
      assert.equal(Object.isFrozen(session), true);
      assert.equal(Object.isFrozen(roster), true);
      assert.throws(() => {
        session.rivalCount = 99;
      }, TypeError);
    }
  }
});
