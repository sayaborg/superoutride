import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { compileCourseMode } from '../dist/gameplay/course-mode.js';
import { compileSessionConfiguration } from '../dist/gameplay/session-configuration.js';
import { createRivalRoster } from '../dist/runtime/rival-roster.js';

test('each route structure pairs with 0/1/16 opponents without changing or recompiling its course', () => {
  for (const routeKind of ['LINEAR', 'BRANCHING', 'CIRCUIT']) {
    const course = compileCourseMode({ id: `TEST_${routeKind}`, routeKind });
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

test('cardinality and route-shape authority cannot drift back into each other or generic actor processing', async () => {
  const course = await readFile(new URL('../src/gameplay/course-mode.ts', import.meta.url), 'utf8');
  const session = await readFile(new URL('../src/gameplay/session-configuration.ts', import.meta.url), 'utf8');
  const roster = await readFile(new URL('../src/runtime/rival-roster.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(course, /rivalCount|MAX_RIVAL_COUNT/);
  assert.doesNotMatch(session, /routeKind|LINEAR|BRANCHING|CIRCUIT/);
  assert.doesNotMatch(roster, /CourseMode|MAX_RIVAL_COUNT|\b16\b|routeKind/);
  assert.match(roster, /SessionConfiguration/);
});
