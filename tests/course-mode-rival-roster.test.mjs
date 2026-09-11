import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { BRANCHING_SESSION_CONFIGURATION } from '../dist/dev/courses/branching-mode.js';
import { SINGLE_RIVAL_BRANCHING_SESSION } from '../dist/dev/fixtures/single-rival-branching-mode.js';

import { BRANCHING_COURSE_MODE } from '../dist/dev/courses/branching-mode.js';
import { SINGLE_RIVAL_BRANCHING_MODE } from '../dist/dev/fixtures/single-rival-branching-mode.js';
import { compileCourseMode } from '../dist/gameplay/course-mode.js';
import { compileSessionConfiguration, MAX_RIVAL_COUNT } from '../dist/gameplay/session-configuration.js';
import { createRivalRoster } from '../dist/runtime/rival-roster.js';

test('course mode contract keeps linear branching and circuit as three distinct route shapes', () => {
  const linear = compileCourseMode({ id: 'L', routeKind: 'LINEAR' });
  const branching = compileCourseMode({ id: 'B', routeKind: 'BRANCHING' });
  const circuit = compileCourseMode({ id: 'C', routeKind: 'CIRCUIT' });

  assert.equal(linear.routeAuthorityKind, 'POINT_TO_POINT_GRAPH');
  assert.equal(linear.finishKind, 'POINT_TO_POINT');
  assert.equal(branching.routeAuthorityKind, 'POINT_TO_POINT_GRAPH');
  assert.equal(branching.finishKind, 'POINT_TO_POINT');
  assert.equal(circuit.routeAuthorityKind, 'CIRCUIT_LOOP');
  assert.equal(circuit.finishKind, 'LAPS');
});

test('branching keeps first physical crossing lock and defines losing-sibling recovery', () => {
  const mode = compileCourseMode({ id: 'OUTRUN', routeKind: 'BRANCHING' });
  assert.equal(mode.sharedRouteChoiceMode, 'FIRST_PHYSICAL_CROSSING_LOCKS');
  assert.equal(mode.branchViolationPolicy, 'RECOVER_TO_LOCKED_BRANCH');

  for (const routeKind of ['LINEAR', 'CIRCUIT']) {
    const other = compileCourseMode({ id: routeKind, routeKind });
    assert.equal(other.sharedRouteChoiceMode, 'INDEPENDENT');
    assert.equal(other.branchViolationPolicy, null);
  }
});

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

test('one-rival fixture remains historical while course debug gives branch choice to the player', () => {
  assert.equal(SINGLE_RIVAL_BRANCHING_MODE.routeKind, 'BRANCHING');
  assert.equal(SINGLE_RIVAL_BRANCHING_SESSION.rivalCount, 1);
  assert.equal(SINGLE_RIVAL_BRANCHING_MODE.sharedRouteChoiceMode, 'FIRST_PHYSICAL_CROSSING_LOCKS');
  assert.equal(SINGLE_RIVAL_BRANCHING_MODE.branchViolationPolicy, 'RECOVER_TO_LOCKED_BRANCH');
  assert.equal(BRANCHING_COURSE_MODE.routeKind, 'BRANCHING');
  assert.equal(BRANCHING_SESSION_CONFIGURATION.rivalCount, 0);
  assert.equal(BRANCHING_COURSE_MODE.sharedRouteChoiceMode, 'FIRST_PHYSICAL_CROSSING_LOCKS');
  assert.equal(BRANCHING_COURSE_MODE.branchViolationPolicy, 'RECOVER_TO_LOCKED_BRANCH');

  const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /createRivalRoster\(BRANCHING_SESSION_CONFIGURATION\)/);
  assert.match(source, /const rivals = rivalRoster\.map/);
  assert.match(source, /createSharedRouteChoiceState\(BRANCHING_COURSE_MODE\.sharedRouteChoiceMode\)/);
  assert.match(source, /branchViolationPolicy: BRANCHING_COURSE_MODE\.branchViolationPolicy/);
  assert.doesNotMatch(source, /const rival = createTestCar/);
  assert.doesNotMatch(source, /const rivalTraveler =/);
});

test('circuit extensibility does not weaken the acyclic RouteDag or enter renderer Core', () => {
  const modeSource = fs.readFileSync(new URL('../src/gameplay/course-mode.ts', import.meta.url), 'utf8');
  const rosterSource = fs.readFileSync(new URL('../src/runtime/rival-roster.ts', import.meta.url), 'utf8');
  const routeDagSource = fs.readFileSync(new URL('../src/gameplay/route-dag.ts', import.meta.url), 'utf8');
  const rendererSource = fs.readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
  const forbiddenImport = /from\s+['"][^'"]*(?:route-dag|physics|render|camera)[^'"]*['"]/i;

  assert.doesNotMatch(modeSource, forbiddenImport);
  assert.doesNotMatch(rosterSource, forbiddenImport);
  assert.match(routeDagSource, /assertAcyclicAndReachable\(/);
  assert.match(routeDagSource, /route graph must be acyclic/);
  assert.doesNotMatch(
    rendererSource,
    /M[0-9]+(?:[._][0-9]+)?|CourseRouteKind|MAX_RIVAL_COUNT|FIRST_PHYSICAL_CROSSING_LOCKS/,
  );
});
