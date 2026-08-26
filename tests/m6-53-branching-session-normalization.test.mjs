import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  advanceRaceSession,
  createRaceSessionState,
} from '../dist/gameplay/race-session.js';
import {
  POINT_TO_POINT_OBJECTIVE,
  createRunObjectiveState,
  updateRunObjectiveFromValidatedFinish,
} from '../dist/gameplay/run-objective.js';

const DT = 1 / 60;

test('M6.53 point-to-point timing needs no closed-course progress authority', () => {
  const session = createRaceSessionState();
  const objective = createRunObjectiveState();
  const fieldProgress = { validatedProgressFloor: 2400 };

  for (let tick = 0; tick < 120; tick += 1) {
    advanceRaceSession(session, fieldProgress, null, DT);
  }

  advanceRaceSession(session, fieldProgress, null, DT);
  const finish = {
    source: 'ROUTE_DAG',
    id: 'GOAL_RB',
    validatedProgress: fieldProgress.validatedProgressFloor,
  };
  const update = updateRunObjectiveFromValidatedFinish(
    objective,
    POINT_TO_POINT_OBJECTIVE,
    finish,
    session.elapsedSeconds,
  );

  assert.equal(update.justFinished, true);
  assert.ok(Math.abs(objective.finishElapsedSeconds - 121 * DT) < 1e-12);
  assert.equal(objective.finishValidatedProgress, fieldProgress.validatedProgressFloor);
  assert.deepEqual(session.gateTimings, []);
  assert.deepEqual(session.boundaryTimings, []);

  for (let tick = 0; tick < 60; tick += 1) {
    advanceRaceSession(session, fieldProgress, null, DT);
    updateRunObjectiveFromValidatedFinish(
      objective,
      POINT_TO_POINT_OBJECTIVE,
      null,
      session.elapsedSeconds,
    );
  }
  assert.ok(Math.abs(objective.finishElapsedSeconds - 121 * DT) < 1e-12);
});

test('M6.53 BRANCHING composition has one route progress authority', () => {
  const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(main, /gameplay\/race-progress/);
  assert.doesNotMatch(main, /createM6DebugRaceRules|createRaceProgressState/);
  assert.doesNotMatch(main, /GeometricCourseTracker|raceProgress|raceUpdate/);
  assert.doesNotMatch(main, /isParentRaceDiagnostic/);
  assert.equal(main.match(/createRaceSessionState\(\)/g)?.length, 1);
  assert.match(
    main,
    /advanceRaceSession\(raceSession, playerFieldProgress, null, SIM_DT\)/,
  );
  assert.match(
    main,
    /updateRunObjectiveFromValidatedFinish\([\s\S]*?finish,[\s\S]*?raceSession\.elapsedSeconds,[\s\S]*?\)/,
  );
  assert.ok(
    main.indexOf('advanceRaceSession(raceSession, playerFieldProgress, null, SIM_DT)')
      < main.indexOf('updateRunObjectiveFromValidatedFinish('),
  );
});
