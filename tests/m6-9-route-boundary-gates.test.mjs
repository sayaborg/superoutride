import test from 'node:test';
import assert from 'node:assert/strict';
import { createM6DebugRouteBoundaryGateSet } from '../dist/dev/m6-debug-route-boundary-gates.js';
import { createM6DebugRouteDag } from '../dist/dev/m6-debug-route-dag.js';

import {
  createRouteDagState,
  updateRouteDag,
} from '../dist/gameplay/route-dag.js';
import {
  compileRouteBoundaryGateSet,
  observeRouteBoundaryCrossing,
} from '../dist/gameplay/route-boundary-gates.js';

test('M6.9 gate compiler requires complete physical coverage for every choice and terminal finish', () => {
  const route = createM6DebugRouteDag();
  assert.throws(
    () => compileRouteBoundaryGateSet(route, []),
    /missing a transition gate/,
  );

  const full = createM6DebugRouteBoundaryGateSet(route);
  assert.equal(full.gates.length, route.choices.length + 4);
});

test('physical world motion through the left branch gate produces the left validated transition only', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = createM6DebugRouteBoundaryGateSet(route);

  const observation = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    { x: -3, z: 9 },
    { x: -3, z: 11 },
  );

  assert.equal(observation.event, 'VALIDATED_TRANSITION');
  assert.deepEqual(observation.boundary, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  assert.equal(observation.gate?.id, 'G_S1_LEFT');
  assert.equal(observation.forwardCrossingCount, 1);

  const update = updateRouteDag(state, route, observation.boundary);
  assert.equal(update.event, 'TRANSITION_ACCEPTED');
  assert.equal(state.activeStageId, 'STAGE_2_L');
});

test('steering-side implication is impossible: world segment between branch gates selects no route', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = createM6DebugRouteBoundaryGateSet(route);

  const observation = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    { x: 0, z: 9 },
    { x: 0, z: 11 },
  );

  assert.equal(observation.event, 'NONE');
  assert.equal(observation.boundary, null);
  assert.equal(state.activeStageId, 'STAGE_1');
});

test('reverse crossing of a legal route gate is observed but never validates route selection', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = createM6DebugRouteBoundaryGateSet(route);

  const observation = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    { x: 3, z: 11 },
    { x: 3, z: 9 },
  );

  assert.equal(observation.event, 'REVERSE_CROSSING');
  assert.equal(observation.boundary, null);
  assert.equal(observation.reverseCrossingCount, 1);
});

test('only gates outgoing from the current active route stage are candidates', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = createM6DebugRouteBoundaryGateSet(route);

  updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  assert.equal(state.activeStageId, 'STAGE_2_L');

  const wrongBranchGeometry = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    { x: 7, z: 19 },
    { x: 7, z: 21 },
  );
  assert.equal(wrongBranchGeometry.event, 'NONE');
  assert.equal(wrongBranchGeometry.boundary, null);

  const valid = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    { x: -2, z: 19 },
    { x: -2, z: 21 },
  );
  assert.deepEqual(valid.boundary, { kind: 'TRANSITION', choiceId: 'S2L_RIGHT' });
});

test('terminal finish is emitted only from physical forward crossing of that terminal finish gate', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = createM6DebugRouteBoundaryGateSet(route);

  updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S2L_RIGHT' });
  assert.equal(state.activeStageId, 'GOAL_LR');

  const otherGoal = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    { x: -8, z: 29 },
    { x: -8, z: 31 },
  );
  assert.equal(otherGoal.event, 'NONE');

  const finish = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    { x: -3, z: 29 },
    { x: -3, z: 31 },
  );
  assert.equal(finish.event, 'VALIDATED_FINISH');
  assert.deepEqual(finish.boundary, { kind: 'FINISH', stageId: 'GOAL_LR' });

  const update = updateRouteDag(state, route, finish.boundary);
  assert.equal(update.event, 'FINISHED');
  assert.equal(state.status, 'FINISHED');
});

test('ambiguous physical step crossing multiple legal branch gates is rejected instead of arbitrarily choosing', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = compileRouteBoundaryGateSet(route, [
    { id: 'A', kind: 'TRANSITION', choiceId: 'S1_LEFT', center: { x: -1, z: 10 }, heading: 0, halfWidth: 3 },
    { id: 'B', kind: 'TRANSITION', choiceId: 'S1_RIGHT', center: { x: 1, z: 10 }, heading: 0, halfWidth: 3 },
    { id: 'C', kind: 'TRANSITION', choiceId: 'S2L_LEFT', center: { x: -7, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'D', kind: 'TRANSITION', choiceId: 'S2L_RIGHT', center: { x: -2, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'E', kind: 'TRANSITION', choiceId: 'S2R_LEFT', center: { x: 2, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'F', kind: 'TRANSITION', choiceId: 'S2R_RIGHT', center: { x: 7, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'G1', kind: 'FINISH', stageId: 'GOAL_LL', center: { x: -8, z: 30 }, heading: 0, halfWidth: 2 },
    { id: 'G2', kind: 'FINISH', stageId: 'GOAL_LR', center: { x: -3, z: 30 }, heading: 0, halfWidth: 2 },
    { id: 'G3', kind: 'FINISH', stageId: 'GOAL_RL', center: { x: 3, z: 30 }, heading: 0, halfWidth: 2 },
    { id: 'G4', kind: 'FINISH', stageId: 'GOAL_RR', center: { x: 8, z: 30 }, heading: 0, halfWidth: 2 },
  ]);

  const observation = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    { x: 0, z: 9 },
    { x: 0, z: 11 },
  );
  assert.equal(observation.event, 'AMBIGUOUS_FORWARD_CROSSING');
  assert.equal(observation.boundary, null);
  assert.equal(observation.forwardCrossingCount, 2);
});
