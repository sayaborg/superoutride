import { M6_43_DEV_SESSION_CONFIGURATION } from '../dist/dev/m6-43-course-mode.js';
import { M8_3_BRANCHING_SESSION_CONFIGURATION } from '../dist/dev/m8-3-course-debug-mode.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { compileCourseMode } from '../dist/gameplay/course-mode.js';
import { MAX_RIVAL_COUNT, compileSessionConfiguration } from '../dist/gameplay/session-configuration.js';
import { M6_43_DEV_COURSE_MODE } from '../dist/dev/m6-43-course-mode.js';
import { M8_3_BRANCHING_COURSE_MODE } from '../dist/dev/m8-3-course-debug-mode.js';
import { createRivalRoster } from '../dist/runtime/rival-roster.js';

test('M6.43 course mode contract keeps linear branching and circuit as three distinct route shapes', () => {
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

test('M6.46 branching keeps first physical crossing lock and defines losing-sibling recovery', () => {
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
    assert.throws(
      () => compileSessionConfiguration({ rivalCount }),
      /rivalCount must be an integer within 0\.\.16/,
    );
  }
});

test('M6.43 roster is a stable variable-length actor list with no null-rival special case', () => {
  const zero = createRivalRoster(compileSessionConfiguration({ rivalCount: 0 }));
  const max = createRivalRoster(compileSessionConfiguration({ rivalCount: 16 }));

  assert.deepEqual(zero, []);
  assert.equal(max.length, 16);
  assert.equal(max[0].actorId, 'RIVAL_01');
  assert.equal(max[15].actorId, 'RIVAL_16');
  assert.deepEqual(max.map((entry) => entry.rivalIndex), [...Array(16).keys()]);
  assert.equal(new Set(max.map((entry) => entry.actorId)).size, 16);
});

test('M6.46 one-rival fixture remains historical while M8.3 course debug gives branch choice to the player', () => {
  assert.equal(M6_43_DEV_COURSE_MODE.routeKind, 'BRANCHING');
  assert.equal(M6_43_DEV_SESSION_CONFIGURATION.rivalCount, 1);
  assert.equal(M6_43_DEV_COURSE_MODE.sharedRouteChoiceMode, 'FIRST_PHYSICAL_CROSSING_LOCKS');
  assert.equal(M6_43_DEV_COURSE_MODE.branchViolationPolicy, 'RECOVER_TO_LOCKED_BRANCH');
  assert.equal(M8_3_BRANCHING_COURSE_MODE.routeKind, 'BRANCHING');
  assert.equal(M8_3_BRANCHING_SESSION_CONFIGURATION.rivalCount, 0);
  assert.equal(M8_3_BRANCHING_COURSE_MODE.sharedRouteChoiceMode, 'FIRST_PHYSICAL_CROSSING_LOCKS');
  assert.equal(M8_3_BRANCHING_COURSE_MODE.branchViolationPolicy, 'RECOVER_TO_LOCKED_BRANCH');

  const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /createRivalRoster\(M8_3_BRANCHING_SESSION_CONFIGURATION\)/);
  assert.match(source, /const rivals = rivalRoster\.map/);
  assert.match(source, /createSharedRouteChoiceState\(M8_3_BRANCHING_COURSE_MODE\.sharedRouteChoiceMode\)/);
  assert.match(source, /recoverActorToLockedBranch\(/);
  assert.doesNotMatch(source, /const rival = createTestCar/);
  assert.doesNotMatch(source, /const rivalTraveler =/);
});

test('M6.43 circuit extensibility does not weaken the acyclic RouteDag or enter renderer Core', () => {
  const modeSource = fs.readFileSync(new URL('../src/gameplay/course-mode.ts', import.meta.url), 'utf8');
  const rosterSource = fs.readFileSync(new URL('../src/runtime/rival-roster.ts', import.meta.url), 'utf8');
  const routeDagSource = fs.readFileSync(new URL('../src/gameplay/route-dag.ts', import.meta.url), 'utf8');
  const rendererSource = fs.readFileSync(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8');
  const forbiddenImport = /from\s+['"][^'"]*(?:route-dag|physics|render|camera)[^'"]*['"]/i;

  assert.doesNotMatch(modeSource, forbiddenImport);
  assert.doesNotMatch(rosterSource, forbiddenImport);
  assert.match(routeDagSource, /assertAcyclicAndReachable\(/);
  assert.match(routeDagSource, /route graph must be acyclic/);
  assert.doesNotMatch(rendererSource, /M6_43|CourseRouteKind|MAX_RIVAL_COUNT|FIRST_PHYSICAL_CROSSING_LOCKS/);
});
