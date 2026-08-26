import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { M6_54_DEV_COURSE_MODE } from '../dist/dev/m6-54-circuit-multi-actor.js';
import { createM651CircuitLiveRuntime } from '../dist/dev/m6-51-circuit-live-runtime.js';
import {
  createCircuitRaceProgressState,
  resyncCircuitRaceProgress,
  updateCircuitRaceProgress,
} from '../dist/gameplay/circuit-race-progress.js';
import {
  advanceRaceSession,
  createRaceSessionState,
  rankRaceProgress,
} from '../dist/gameplay/race-session.js';
import { createRivalRoster } from '../dist/runtime/rival-roster.js';

const DT = 0.25;

function sampleAtGate(gate, meters) {
  return {
    x: gate.center.x + gate.tangent.x * meters,
    z: gate.center.z + gate.tangent.z * meters,
    sWindow: gate.s + meters,
  };
}

function createActor(rules, actorId, initial) {
  return {
    actorId,
    progress: createCircuitRaceProgressState(rules, initial),
    session: createRaceSessionState(),
  };
}

function prepareCrossing(actor, rules, gate) {
  resyncCircuitRaceProgress(actor.progress, rules, sampleAtGate(gate, -1));
}

function cross(actor, rules, gate) {
  return updateCircuitRaceProgress(actor.progress, rules, sampleAtGate(gate, 1));
}

function finishTime(actor) {
  return actor.progress.status === 'FINISHED'
    ? actor.session.boundaryTimings.at(-1)?.elapsedSeconds ?? null
    : null;
}

test('M6.54 current CIRCUIT mode compiles one ordinary rival roster entry', () => {
  assert.equal(M6_54_DEV_COURSE_MODE.routeKind, 'CIRCUIT');
  assert.equal(M6_54_DEV_COURSE_MODE.routeAuthorityKind, 'CIRCUIT_LOOP');
  assert.equal(M6_54_DEV_COURSE_MODE.sharedRouteChoiceMode, 'INDEPENDENT');
  assert.equal(M6_54_DEV_COURSE_MODE.rivalCount, 1);
  assert.deepEqual(createRivalRoster(M6_54_DEV_COURSE_MODE), [
    { actorId: 'RIVAL_01', rivalIndex: 0 },
  ]);
});

test('M6.54 two actors independently validate every circuit boundary and retain finish order', () => {
  const live = createM651CircuitLiveRuntime();
  const { raceRules } = live;
  const player = createActor(raceRules, 'PLAYER', { x: 0, z: 0, sWindow: 45 });
  const rival = createActor(raceRules, 'RIVAL_01', { x: 0, z: 0, sWindow: 95 });

  assert.equal(rankRaceProgress([
    {
      competitorId: player.actorId,
      sProgress: player.progress.sProgress,
      validatedProgressFloor: player.progress.validatedProgressFloor,
    },
    {
      competitorId: rival.actorId,
      sProgress: rival.progress.sProgress,
      validatedProgressFloor: rival.progress.validatedProgressFloor,
    },
  ])[0].competitorId, 'RIVAL_01');

  for (let gateIndex = 0; gateIndex < raceRules.gates.length; gateIndex += 1) {
    const gate = raceRules.gates[gateIndex];
    prepareCrossing(player, raceRules, gate);
    prepareCrossing(rival, raceRules, gate);

    const rivalUpdate = cross(rival, raceRules, gate);
    advanceRaceSession(rival.session, rival.progress, rivalUpdate, DT);
    advanceRaceSession(player.session, player.progress, null, DT);

    if (gateIndex === 1) {
      const floorBeforeRecovery = rival.progress.validatedProgressFloor;
      const lapsBeforeRecovery = rival.progress.acceptedFinishCount;
      resyncCircuitRaceProgress(rival.progress, raceRules, sampleAtGate(gate, 2));
      advanceRaceSession(rival.session, rival.progress, null, DT);
      advanceRaceSession(player.session, player.progress, null, DT);
      assert.equal(rival.progress.validatedProgressFloor, floorBeforeRecovery);
      assert.equal(rival.progress.acceptedFinishCount, lapsBeforeRecovery);
    }

    const playerUpdate = cross(player, raceRules, gate);
    advanceRaceSession(player.session, player.progress, playerUpdate, DT);
    advanceRaceSession(rival.session, rival.progress, null, DT);
  }

  assert.equal(player.progress.status, 'FINISHED');
  assert.equal(rival.progress.status, 'FINISHED');
  assert.equal(player.progress.acceptedFinishCount, raceRules.lapCount);
  assert.equal(rival.progress.acceptedFinishCount, raceRules.lapCount);
  assert.equal(player.session.boundaryTimings.length, raceRules.lapCount);
  assert.equal(rival.session.boundaryTimings.length, raceRules.lapCount);
  assert.ok(finishTime(rival) < finishTime(player));

  const standings = rankRaceProgress([
    {
      competitorId: player.actorId,
      sProgress: player.progress.sProgress,
      validatedProgressFloor: player.progress.validatedProgressFloor,
      finishElapsedSeconds: finishTime(player),
    },
    {
      competitorId: rival.actorId,
      sProgress: rival.progress.sProgress,
      validatedProgressFloor: rival.progress.validatedProgressFloor,
      finishElapsedSeconds: finishTime(rival),
    },
  ]);
  assert.deepEqual(standings.map((entry) => [entry.competitorId, entry.rank]), [
    ['RIVAL_01', 1],
    ['PLAYER', 2],
  ]);
});

test('M6.54 CIRCUIT browser composes existing actor, ranking and Painter primitives only', async () => {
  const source = await readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8');
  const mode = await readFile(new URL('../src/dev/m6-54-circuit-multi-actor.ts', import.meta.url), 'utf8');
  const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);

  assert.match(source, /createRivalRoster\(M7_1_DEV_COURSE_MODE\)/);
  assert.match(source, /sampleRivalDrivingInput\(guide, rival\.vehicle, 0\)/);
  assert.match(source, /updateCircuitRaceProgress\(rival\.raceProgress, raceRules/);
  assert.match(source, /advanceRaceSession\([\s\S]*?rival\.raceSession/);
  assert.match(source, /createDynamicVehicleCourseSprite\(/);
  assert.match(source, /rankRaceProgress\(/);
  assert.match(source, /finishElapsedSeconds:/);
  assert.equal(
    importSpecifiers.some((path) => /route-dag|live-route|shared-route-choice|branch-violation/.test(path)),
    false,
  );
  assert.doesNotMatch(mode, /physics|render|camera|CircuitRaceProgress/);
});
