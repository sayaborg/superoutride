import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { createM6DebugRaceRules } from '../dist/gameplay/race-progress.js';
import {
  POINT_TO_POINT_OBJECTIVE,
  REPEATABLE_DEV_OBJECTIVE,
  createRunObjectiveState,
  updateRunObjective,
} from '../dist/gameplay/run-objective.js';

const guide = createM2StadiumGuide();
const rules = createM6DebugRaceRules(guide);
const checkpoint = rules.gates[0];
const finish = rules.gates.at(-1);

function updateFor(gate, event = gate?.kind === 'finish' ? 'LAP' : 'CHECKPOINT') {
  return {
    event,
    acceptedGate: gate ?? null,
    direction: 'FORWARD',
    window: { floor: 0, ceiling: guide.length },
  };
}

test('M6.7 point-to-point objective cannot finish from raw progress without an accepted FINISH gate', () => {
  const state = createRunObjectiveState();
  const result = updateRunObjective(
    state,
    POINT_TO_POINT_OBJECTIVE,
    { validatedProgressFloor: guide.length },
    null,
    12.5,
  );
  assert.equal(result.event, 'NONE');
  assert.equal(state.status, 'RUNNING');
  assert.equal(state.finishElapsedSeconds, null);
});

test('accepted checkpoint is not a finish objective event', () => {
  const state = createRunObjectiveState();
  updateRunObjective(
    state,
    POINT_TO_POINT_OBJECTIVE,
    { validatedProgressFloor: checkpoint.s },
    updateFor(checkpoint),
    4,
  );
  assert.equal(state.status, 'RUNNING');
  assert.equal(state.acceptedFinishCount, 0);
});

test('point-to-point objective finishes exactly once from the validated physical FINISH event', () => {
  const state = createRunObjectiveState();
  const first = updateRunObjective(
    state,
    POINT_TO_POINT_OBJECTIVE,
    { validatedProgressFloor: guide.length },
    updateFor(finish),
    18.75,
  );
  assert.equal(first.event, 'FINISHED');
  assert.equal(first.justFinished, true);
  assert.equal(state.status, 'FINISHED');
  assert.equal(state.acceptedFinishCount, 1);
  assert.equal(state.finishElapsedSeconds, 18.75);
  assert.equal(state.finishValidatedProgress, guide.length);

  const second = updateRunObjective(
    state,
    POINT_TO_POINT_OBJECTIVE,
    { validatedProgressFloor: guide.length * 2 },
    updateFor(finish),
    35,
  );
  assert.equal(second.event, 'IGNORED_AFTER_FINISH');
  assert.equal(second.justFinished, false);
  assert.equal(state.acceptedFinishCount, 1);
  assert.equal(state.finishElapsedSeconds, 18.75);
});

test('repeatable DEV objective records validated FINISH boundaries without creating product lap completion', () => {
  const state = createRunObjectiveState();
  for (let i = 1; i <= 3; i += 1) {
    const result = updateRunObjective(
      state,
      REPEATABLE_DEV_OBJECTIVE,
      { validatedProgressFloor: guide.length * i },
      updateFor(finish),
      i * 10,
    );
    assert.equal(result.event, 'BOUNDARY');
    assert.equal(result.justFinished, false);
    assert.equal(state.status, 'RUNNING');
  }
  assert.equal(state.acceptedFinishCount, 3);
  assert.equal(state.finishElapsedSeconds, null);
  assert.equal(state.finishValidatedProgress, null);
});

test('reverse/shortcut events with no accepted gate cannot complete an objective', () => {
  const state = createRunObjectiveState();
  for (const event of ['REVERSE_CROSSING', 'SHORTCUT_REJECTED', 'RESYNC']) {
    const result = updateRunObjective(
      state,
      POINT_TO_POINT_OBJECTIVE,
      { validatedProgressFloor: 0 },
      { event, acceptedGate: null, direction: 'REVERSE', window: { floor: 0, ceiling: guide.length } },
      3,
    );
    assert.equal(result.event, 'NONE');
    assert.equal(state.status, 'RUNNING');
  }
});
