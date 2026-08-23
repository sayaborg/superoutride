import test from 'node:test';
import assert from 'node:assert/strict';

import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { createM6DebugRaceRules } from '../dist/gameplay/race-progress.js';
import {
  POINT_TO_POINT_OBJECTIVE,
  createRunObjectiveState,
  createValidatedRunFinishFromRace,
  createValidatedRunFinishFromRoute,
  updateRunObjectiveFromValidatedFinish,
} from '../dist/gameplay/run-objective.js';
import {
  createM6DebugRouteDag,
  createRouteDagState,
  updateRouteDag,
} from '../dist/gameplay/route-dag.js';
import {
  createM6DebugRouteBoundaryGateSet,
  observeRouteBoundaryCrossing,
} from '../dist/gameplay/route-boundary-gates.js';

function acceptedRaceUpdate(gate, courseLength) {
  return {
    event: 'LAP',
    acceptedGate: gate,
    direction: 'FORWARD',
    window: { floor: courseLength, ceiling: courseLength * 1.25 },
  };
}

test('M6.10 legacy closed-course FINISH adapts into the generic validated finish signal', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const finishGate = rules.gates.at(-1);

  const finish = createValidatedRunFinishFromRace(
    { validatedProgressFloor: guide.length },
    acceptedRaceUpdate(finishGate, guide.length),
  );

  assert.deepEqual(finish, {
    source: 'CLOSED_RACE',
    id: 'FINISH',
    validatedProgress: guide.length,
  });

  const objective = createRunObjectiveState();
  const result = updateRunObjectiveFromValidatedFinish(
    objective,
    POINT_TO_POINT_OBJECTIVE,
    finish,
    21.25,
  );

  assert.equal(result.event, 'FINISHED');
  assert.equal(objective.finishSource, 'CLOSED_RACE');
  assert.equal(objective.finishId, 'FINISH');
  assert.equal(objective.finishValidatedProgress, guide.length);
  assert.equal(objective.finishElapsedSeconds, 21.25);
});

test('full physical route-gate chain can finish POINT_TO_POINT without RaceProgressUpdate or lap semantics', () => {
  const route = createM6DebugRouteDag();
  const routeState = createRouteDagState(route);
  const gates = createM6DebugRouteBoundaryGateSet(route);
  const objective = createRunObjectiveState();

  const cross = (previous, current) => {
    const observation = observeRouteBoundaryCrossing(route, routeState, gates, previous, current);
    assert.notEqual(observation.boundary, null);
    return updateRouteDag(routeState, route, observation.boundary);
  };

  const first = cross({ x: 3, z: 9 }, { x: 3, z: 11 });
  assert.equal(first.event, 'TRANSITION_ACCEPTED');
  assert.equal(routeState.activeStageId, 'STAGE_2_R');
  assert.equal(createValidatedRunFinishFromRoute(routeState, first), null);

  const second = cross({ x: 2, z: 19 }, { x: 2, z: 21 });
  assert.equal(second.event, 'TRANSITION_ACCEPTED');
  assert.equal(routeState.activeStageId, 'GOAL_RL');
  assert.equal(routeState.status, 'RUNNING');
  assert.equal(createValidatedRunFinishFromRoute(routeState, second), null);

  const finishObservation = observeRouteBoundaryCrossing(
    route,
    routeState,
    gates,
    { x: 3, z: 29 },
    { x: 3, z: 31 },
  );
  assert.equal(finishObservation.event, 'VALIDATED_FINISH');
  const routeFinishUpdate = updateRouteDag(routeState, route, finishObservation.boundary);
  assert.equal(routeFinishUpdate.event, 'FINISHED');

  const finish = createValidatedRunFinishFromRoute(routeState, routeFinishUpdate);
  assert.deepEqual(finish, {
    source: 'ROUTE_DAG',
    id: 'GOAL_RL',
    validatedProgress: null,
  });

  const result = updateRunObjectiveFromValidatedFinish(
    objective,
    POINT_TO_POINT_OBJECTIVE,
    finish,
    32.75,
  );
  assert.equal(result.event, 'FINISHED');
  assert.equal(result.justFinished, true);
  assert.equal(objective.status, 'FINISHED');
  assert.equal(objective.finishSource, 'ROUTE_DAG');
  assert.equal(objective.finishId, 'GOAL_RL');
  assert.equal(objective.finishElapsedSeconds, 32.75);
  assert.equal(objective.finishValidatedProgress, null);
});

test('route entry into a terminal stage cannot be adapted into a run finish before physical FINISH', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);

  updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  const terminalEntry = updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S2L_LEFT' });

  assert.equal(state.activeStageId, 'GOAL_LL');
  assert.equal(state.status, 'RUNNING');
  assert.equal(terminalEntry.event, 'TRANSITION_ACCEPTED');
  assert.equal(createValidatedRunFinishFromRoute(state, terminalEntry), null);
});

test('generic objective ignores null finish and records no source/id from unvalidated state', () => {
  const state = createRunObjectiveState();
  const result = updateRunObjectiveFromValidatedFinish(
    state,
    POINT_TO_POINT_OBJECTIVE,
    null,
    10,
  );

  assert.equal(result.event, 'NONE');
  assert.equal(state.status, 'RUNNING');
  assert.equal(state.acceptedFinishCount, 0);
  assert.equal(state.finishSource, null);
  assert.equal(state.finishId, null);
});

test('generic objective finishes exactly once regardless of validated finish source', () => {
  const state = createRunObjectiveState();
  const routeFinish = { source: 'ROUTE_DAG', id: 'GOAL_RR', validatedProgress: null };
  const closedFinish = { source: 'CLOSED_RACE', id: 'FINISH', validatedProgress: 1000 };

  const first = updateRunObjectiveFromValidatedFinish(
    state,
    POINT_TO_POINT_OBJECTIVE,
    routeFinish,
    15,
  );
  const second = updateRunObjectiveFromValidatedFinish(
    state,
    POINT_TO_POINT_OBJECTIVE,
    closedFinish,
    20,
  );

  assert.equal(first.event, 'FINISHED');
  assert.equal(second.event, 'IGNORED_AFTER_FINISH');
  assert.equal(state.acceptedFinishCount, 1);
  assert.equal(state.finishSource, 'ROUTE_DAG');
  assert.equal(state.finishId, 'GOAL_RR');
  assert.equal(state.finishElapsedSeconds, 15);
});
