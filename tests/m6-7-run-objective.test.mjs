import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRunObjectiveState,
  updateRunObjectiveFromValidatedFinish,
} from '../dist/gameplay/run-objective.js';

const routeFinish = {
  source: 'ROUTE_DAG',
  id: 'GOAL_LL',
  validatedProgress: 1200,
};

test('point-to-point objective cannot finish without an already validated physical FINISH', () => {
  const state = createRunObjectiveState();
  const result = updateRunObjectiveFromValidatedFinish(state, null, 12.5);
  assert.equal(result.event, 'NONE');
  assert.equal(state.status, 'RUNNING');
  assert.equal(state.finishElapsedSeconds, null);
});

test('point-to-point objective finishes exactly once from the validated route FINISH', () => {
  const state = createRunObjectiveState();
  const first = updateRunObjectiveFromValidatedFinish(state, routeFinish, 18.75);
  assert.equal(first.event, 'FINISHED');
  assert.equal(first.justFinished, true);
  assert.equal(state.status, 'FINISHED');
  assert.equal(state.acceptedFinishCount, 1);
  assert.equal(state.finishElapsedSeconds, 18.75);
  assert.equal(state.finishValidatedProgress, 1200);

  const second = updateRunObjectiveFromValidatedFinish(
    state,
    { ...routeFinish, id: 'GOAL_RR', validatedProgress: 2400 },
    35,
  );
  assert.equal(second.event, 'IGNORED_AFTER_FINISH');
  assert.equal(second.justFinished, false);
  assert.equal(state.acceptedFinishCount, 1);
  assert.equal(state.finishElapsedSeconds, 18.75);
});

test('objective rejects a non-route finish source instead of reviving legacy closed-race authority', () => {
  const state = createRunObjectiveState();
  assert.throws(
    () => updateRunObjectiveFromValidatedFinish(
      state,
      { source: 'CLOSED_RACE', id: 'FINISH', validatedProgress: 1000 },
      3,
    ),
    /unsupported run finish source/,
  );
});
