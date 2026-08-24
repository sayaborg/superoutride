import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  MAX_RIVAL_COUNT,
  compileCourseMode,
} from '../dist/gameplay/course-mode.js';
import { M6_43_DEV_COURSE_MODE } from '../dist/dev/m6-43-course-mode.js';
import { createRivalRoster } from '../dist/runtime/rival-roster.js';

test('M6.43 course mode contract keeps linear branching and circuit as three distinct route shapes', () => {
  const linear = compileCourseMode({ id: 'L', routeKind: 'LINEAR', rivalCount: 0 });
  const branching = compileCourseMode({ id: 'B', routeKind: 'BRANCHING', rivalCount: 8 });
  const circuit = compileCourseMode({ id: 'C', routeKind: 'CIRCUIT', rivalCount: 16 });

  assert.equal(linear.routeAuthorityKind, 'POINT_TO_POINT_GRAPH');
  assert.equal(linear.finishKind, 'POINT_TO_POINT');
  assert.equal(branching.routeAuthorityKind, 'POINT_TO_POINT_GRAPH');
  assert.equal(branching.finishKind, 'POINT_TO_POINT');
  assert.equal(circuit.routeAuthorityKind, 'CIRCUIT_LOOP');
  assert.equal(circuit.finishKind, 'LAPS');
});

test('M6.43 branching product rule is first physical crossing lock while wrong-branch response remains undecided', () => {
  const mode = compileCourseMode({ id: 'OUTRUN', routeKind: 'BRANCHING', rivalCount: 4 });
  assert.equal(mode.sharedRouteChoiceMode, 'FIRST_PHYSICAL_CROSSING_LOCKS');
  assert.equal(mode.branchViolationPolicy, 'UNDECIDED');

  for (const routeKind of ['LINEAR', 'CIRCUIT']) {
    const other = compileCourseMode({ id: routeKind, routeKind, rivalCount: 4 });
    assert.equal(other.sharedRouteChoiceMode, 'INDEPENDENT');
    assert.equal(other.branchViolationPolicy, null);
  }
});

test('M6.43 rival cardinality belongs to mode authoring and accepts the full 0..16 product envelope', () => {
  assert.equal(MAX_RIVAL_COUNT, 16);
  assert.equal(compileCourseMode({ id: 'ZERO', routeKind: 'LINEAR', rivalCount: 0 }).rivalCount, 0);
  assert.equal(compileCourseMode({ id: 'MAX', routeKind: 'BRANCHING', rivalCount: 16 }).rivalCount, 16);

  for (const rivalCount of [-1, 1.5, 17]) {
    assert.throws(
      () => compileCourseMode({ id: 'BAD', routeKind: 'LINEAR', rivalCount }),
      /rivalCount must be an integer within 0\.\.16/,
    );
  }
});

test('M6.43 roster is a stable variable-length actor list with no null-rival special case', () => {
  const zero = createRivalRoster(compileCourseMode({ id: 'ZERO', routeKind: 'LINEAR', rivalCount: 0 }));
  const max = createRivalRoster(compileCourseMode({ id: 'MAX', routeKind: 'BRANCHING', rivalCount: 16 }));

  assert.deepEqual(zero, []);
  assert.equal(max.length, 16);
  assert.equal(max[0].actorId, 'RIVAL_01');
  assert.equal(max[15].actorId, 'RIVAL_16');
  assert.deepEqual(max.map((entry) => entry.rivalIndex), [...Array(16).keys()]);
  assert.equal(new Set(max.map((entry) => entry.actorId)).size, 16);
});

test('M6.43 current Pages fixture leaves branch choice to the player until violation policy exists', () => {
  assert.equal(M6_43_DEV_COURSE_MODE.routeKind, 'BRANCHING');
  assert.equal(M6_43_DEV_COURSE_MODE.rivalCount, 0);
  assert.equal(M6_43_DEV_COURSE_MODE.sharedRouteChoiceMode, 'FIRST_PHYSICAL_CROSSING_LOCKS');
  assert.equal(M6_43_DEV_COURSE_MODE.branchViolationPolicy, 'UNDECIDED');
  assert.deepEqual(createRivalRoster(M6_43_DEV_COURSE_MODE), []);

  const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /createRivalRoster\(M6_43_DEV_COURSE_MODE\)/);
  assert.match(source, /const rivals = rivalRoster\.map/);
  assert.match(source, /createSharedRouteChoiceState\(M6_43_DEV_COURSE_MODE\.sharedRouteChoiceMode\)/);
  assert.doesNotMatch(source, /const rival = createM5Car/);
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