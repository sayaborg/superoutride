import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileRouteDag,
  createM6DebugRouteDag,
  createRouteDagState,
  getAvailableRouteChoices,
  updateRouteDag,
} from '../dist/gameplay/route-dag.js';

test('M6.8 debug route DAG exposes a two-way split followed by four terminal outcomes', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);

  assert.equal(route.startStageId, 'STAGE_1');
  assert.equal(route.stages.length, 7);
  assert.equal(route.choices.length, 6);
  assert.deepEqual(
    getAvailableRouteChoices(route, state).map((choice) => choice.id),
    ['S1_LEFT', 'S1_RIGHT'],
  );
  assert.deepEqual(
    route.stages.filter((stage) => stage.kind === 'TERMINAL').map((stage) => stage.id),
    ['GOAL_LL', 'GOAL_LR', 'GOAL_RL', 'GOAL_RR'],
  );
});

test('route DAG compiler rejects cycles instead of turning gameplay progress into a hidden lap graph', () => {
  assert.throws(
    () => compileRouteDag(
      'A',
      [
        { id: 'A', kind: 'STAGE' },
        { id: 'B', kind: 'STAGE' },
      ],
      [
        { id: 'AB', fromStageId: 'A', toStageId: 'B' },
        { id: 'BA', fromStageId: 'B', toStageId: 'A' },
      ],
    ),
    /acyclic/,
  );
});

test('route DAG compiler rejects unreachable authored stages', () => {
  assert.throws(
    () => compileRouteDag(
      'A',
      [
        { id: 'A', kind: 'TERMINAL' },
        { id: 'ORPHAN', kind: 'TERMINAL' },
      ],
      [],
    ),
    /unreachable stages/,
  );
});

test('validated route transition must leave the current active stage and cannot skip across the DAG', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);

  const invalid = updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S2R_RIGHT' });
  assert.equal(invalid.event, 'REJECTED_INVALID_TRANSITION');
  assert.equal(state.activeStageId, 'STAGE_1');
  assert.equal(state.acceptedTransitionCount, 0);
  assert.equal(state.rejectedBoundaryCount, 1);

  const accepted = updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S1_RIGHT' });
  assert.equal(accepted.event, 'TRANSITION_ACCEPTED');
  assert.equal(accepted.acceptedChoice?.id, 'S1_RIGHT');
  assert.equal(state.activeStageId, 'STAGE_2_R');
  assert.deepEqual(state.visitedStageIds, ['STAGE_1', 'STAGE_2_R']);
  assert.deepEqual(state.selectedChoiceIds, ['S1_RIGHT']);
});

test('entering a terminal route stage is not enough: explicit validated FINISH is still required', () => {
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);

  updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  const terminalEntry = updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S2L_RIGHT' });

  assert.equal(terminalEntry.event, 'TRANSITION_ACCEPTED');
  assert.equal(state.activeStageId, 'GOAL_LR');
  assert.equal(state.status, 'RUNNING');
  assert.equal(state.finishStageId, null);
  assert.deepEqual(getAvailableRouteChoices(route, state), []);

  const wrongFinish = updateRouteDag(state, route, { kind: 'FINISH', stageId: 'GOAL_LL' });
  assert.equal(wrongFinish.event, 'REJECTED_INVALID_FINISH');
  assert.equal(state.status, 'RUNNING');

  const finish = updateRouteDag(state, route, { kind: 'FINISH', stageId: 'GOAL_LR' });
  assert.equal(finish.event, 'FINISHED');
  assert.equal(finish.justFinished, true);
  assert.equal(state.status, 'FINISHED');
  assert.equal(state.finishStageId, 'GOAL_LR');
});

test('same validated boundary sequence deterministically produces the same route history', () => {
  const route = createM6DebugRouteDag();
  const events = [
    { kind: 'TRANSITION', choiceId: 'S1_RIGHT' },
    { kind: 'TRANSITION', choiceId: 'S2R_LEFT' },
    { kind: 'FINISH', stageId: 'GOAL_RL' },
  ];

  const run = () => {
    const state = createRouteDagState(route);
    for (const event of events) updateRouteDag(state, route, event);
    return state;
  };

  const a = run();
  const b = run();
  assert.deepEqual(a, b);
  assert.deepEqual(a.visitedStageIds, ['STAGE_1', 'STAGE_2_R', 'GOAL_RL']);
  assert.deepEqual(a.selectedChoiceIds, ['S1_RIGHT', 'S2R_LEFT']);
  assert.equal(a.acceptedTransitionCount, 2);
  assert.equal(a.status, 'FINISHED');

  const ignored = updateRouteDag(a, route, { kind: 'FINISH', stageId: 'GOAL_RL' });
  assert.equal(ignored.event, 'IGNORED_AFTER_FINISH');
  assert.equal(ignored.justFinished, false);
});
