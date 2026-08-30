import test from 'node:test';
import assert from 'node:assert/strict';
import { createM6DebugRouteBoundaryGateSet } from '../dist/dev/m6-debug-route-boundary-gates.js';
import { createM6DebugRouteDag } from '../dist/dev/m6-debug-route-dag.js';
import { readFile } from 'node:fs/promises';

import {
  compileRouteDag,
  createRouteDagState,
} from '../dist/gameplay/route-dag.js';
import {
  observeRouteBoundaryCrossing,
} from '../dist/gameplay/route-boundary-gates.js';
import {
  arbitrateSharedRouteChoiceCandidates,
  createSharedRouteChoiceState,
  getSharedRouteChoiceLock,
  sharedRouteAllowedTransitionChoiceId,
  sharedRouteChoiceAllowsBoundary,
} from '../dist/gameplay/shared-route-choice-authority.js';

function transition(actorId, activeStageId, choiceId, crossingFraction) {
  return {
    actorId,
    activeStageId,
    boundary: { kind: 'TRANSITION', choiceId },
    crossingFraction,
  };
}

test('M6.41 physical gate observation exposes exact sub-tick crossing fraction for race arbitration', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = createM6DebugRouteBoundaryGateSet(route);

  const observation = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    { x: -3, z: 8 },
    { x: -3, z: 12 },
  );

  assert.equal(observation.event, 'VALIDATED_TRANSITION');
  assert.equal(observation.boundary?.choiceId, 'S1_LEFT');
  assert.equal(observation.crossingFraction, 0.5);
});

test('M6.41 INDEPENDENT policy preserves M6.40 divergent actor choices and records no race lock', () => {
  const route = createM6DebugRouteDag();
  const shared = createSharedRouteChoiceState('INDEPENDENT');
  const result = arbitrateSharedRouteChoiceCandidates(route, shared, [
    transition('PLAYER', 'STAGE_1', 'S1_LEFT', 0.6),
    transition('RIVAL', 'STAGE_1', 'S1_RIGHT', 0.2),
  ]);

  assert.deepEqual(result.decisions.map((item) => item.accepted), [true, true]);
  assert.deepEqual(result.decisions.map((item) => item.reason), ['INDEPENDENT', 'INDEPENDENT']);
  assert.equal(result.createdLocks.length, 0);
  assert.equal(shared.locks.length, 0);
});

test('M6.41 shared policy locks to the physically earliest crossing, not actor update order', () => {
  const route = createM6DebugRouteDag();
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');
  const result = arbitrateSharedRouteChoiceCandidates(route, shared, [
    transition('PLAYER', 'STAGE_1', 'S1_LEFT', 0.75),
    transition('RIVAL', 'STAGE_1', 'S1_RIGHT', 0.25),
  ]);

  const lock = getSharedRouteChoiceLock(shared, 'STAGE_1');
  assert.equal(lock?.choiceId, 'S1_RIGHT');
  assert.equal(lock?.lockedByActorId, 'RIVAL');
  assert.equal(result.decisions.find((item) => item.actorId === 'RIVAL')?.accepted, true);
  assert.equal(result.decisions.find((item) => item.actorId === 'PLAYER')?.accepted, false);
});

test('M6.41 exact same-fraction tie uses supplied race order only as deterministic final tie-break', () => {
  const route = createM6DebugRouteDag();
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');
  arbitrateSharedRouteChoiceCandidates(route, shared, [
    transition('LEADER_AT_TICK_START', 'STAGE_1', 'S1_LEFT', 0.5),
    transition('SECOND_AT_TICK_START', 'STAGE_1', 'S1_RIGHT', 0.5),
  ]);

  assert.deepEqual(getSharedRouteChoiceLock(shared, 'STAGE_1'), {
    stageId: 'STAGE_1',
    choiceId: 'S1_LEFT',
    lockedByActorId: 'LEADER_AT_TICK_START',
  });
});

test('M6.41 all same-gate crossings in the winning tick are accepted while sibling choice is rejected', () => {
  const route = createM6DebugRouteDag();
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');
  const result = arbitrateSharedRouteChoiceCandidates(route, shared, [
    transition('A', 'STAGE_1', 'S1_RIGHT', 0.2),
    transition('B', 'STAGE_1', 'S1_RIGHT', 0.7),
    transition('C', 'STAGE_1', 'S1_LEFT', 0.4),
  ]);

  assert.equal(result.createdLocks.length, 1);
  assert.deepEqual(
    result.decisions.map((item) => [item.actorId, item.accepted]),
    [['A', true], ['B', true], ['C', false]],
  );
});

test('M6.41 existing shared lock narrows later physical observation to the chosen authored gate only', () => {
  const route = createM6DebugRouteDag();
  const routeState = createRouteDagState(route);
  const gates = createM6DebugRouteBoundaryGateSet(route);
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');
  arbitrateSharedRouteChoiceCandidates(route, shared, [
    transition('LEADER', 'STAGE_1', 'S1_RIGHT', 0.3),
  ]);

  const allowed = sharedRouteAllowedTransitionChoiceId(route, shared, 'STAGE_1');
  assert.equal(allowed, 'S1_RIGHT');

  const forbiddenSibling = observeRouteBoundaryCrossing(
    route,
    routeState,
    gates,
    { x: -3, z: 9 },
    { x: -3, z: 11 },
    allowed,
  );
  assert.equal(forbiddenSibling.event, 'NONE');
  assert.equal(forbiddenSibling.boundary, null);

  const chosen = observeRouteBoundaryCrossing(
    route,
    routeState,
    gates,
    { x: 3, z: 9 },
    { x: 3, z: 11 },
    allowed,
  );
  assert.equal(chosen.event, 'VALIDATED_TRANSITION');
  assert.equal(chosen.boundary?.choiceId, 'S1_RIGHT');
  assert.equal(sharedRouteChoiceAllowsBoundary(route, shared, 'STAGE_1', chosen.boundary), true);
  assert.equal(
    sharedRouteChoiceAllowsBoundary(route, shared, 'STAGE_1', { kind: 'TRANSITION', choiceId: 'S1_LEFT' }),
    false,
  );
});

test('M6.41 deterministic single-successor stages remain per-actor transactions and do not consume shared locks', () => {
  const route = compileRouteDag(
    'START',
    [
      { id: 'START', kind: 'STAGE' },
      { id: 'CONTINUE', kind: 'STAGE' },
      { id: 'GOAL', kind: 'TERMINAL' },
    ],
    [
      { id: 'START_CONTINUE', fromStageId: 'START', toStageId: 'CONTINUE' },
      { id: 'CONTINUE_GOAL', fromStageId: 'CONTINUE', toStageId: 'GOAL' },
    ],
  );
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');
  const result = arbitrateSharedRouteChoiceCandidates(route, shared, [
    transition('PLAYER', 'START', 'START_CONTINUE', 0.2),
    transition('RIVAL', 'CONTINUE', 'CONTINUE_GOAL', 0.8),
  ]);

  assert.deepEqual(result.decisions.map((item) => item.reason), ['UNBRANCHED_STAGE', 'UNBRANCHED_STAGE']);
  assert.equal(shared.locks.length, 0);
  assert.equal(sharedRouteAllowedTransitionChoiceId(route, shared, 'START'), null);
});

test('M6.41 shared route authority stays gameplay-only with no renderer, camera, input or vehicle-physics dependency', async () => {
  const source = await readFile(new URL('../src/gameplay/shared-route-choice-authority.ts', import.meta.url), 'utf8');
  const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert.deepEqual(importSpecifiers, ['./route-dag.js']);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:render|camera|input|m5-car|vehicle-physics)[^'"]*['"]/i);
  assert.match(source, /crossingFraction/);
  assert.match(source, /FIRST_PHYSICAL_CROSSING_LOCKS/);
});