import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceRaceSession,
  createRaceSessionState,
  formatRaceTime,
  rankRaceProgress,
} from '../dist/gameplay/race-session.js';

function progress(overrides = {}) {
  return {
    lapIndex: 0,
    nextGateIndex: 0,
    validatedProgressFloor: 0,
    sProgress: 0,
    direction: 'FORWARD',
    acceptedGateCount: 0,
    reverseCrossingCount: 0,
    shortcutViolationCount: 0,
    lastEvent: 'NONE',
    previous: { x: 0, z: 0, sLocal: 0 },
    ...overrides,
  };
}

function update(gate = null, event = 'NONE') {
  return {
    event,
    acceptedGate: gate,
    direction: 'FORWARD',
    window: { floor: 0, ceiling: 100 },
  };
}

const cp1 = {
  index: 0,
  kind: 'checkpoint',
  name: 'CP1',
  s: 25,
  center: { x: 0, z: 0 },
  tangent: { x: 0, z: 1 },
  normal: { x: 1, z: 0 },
  halfWidth: 10,
};

const finish = {
  ...cp1,
  index: 3,
  kind: 'finish',
  name: 'FINISH',
  s: 0,
};

test('M6.2 race session time advances only from deterministic simulation dt', () => {
  const session = createRaceSessionState();
  const p = progress();
  for (let i = 0; i < 120; i += 1) advanceRaceSession(session, p, null, 1 / 60);
  assert.ok(Math.abs(session.elapsedSeconds - 2) < 1e-12);
  assert.equal(session.gateTimings.length, 0);
  assert.equal(session.boundaryTimings.length, 0);
});

test('accepted checkpoint records a timing but non-gate race events do not', () => {
  const session = createRaceSessionState();
  const p = progress({ validatedProgressFloor: 25, sProgress: 26 });
  advanceRaceSession(session, p, update(null, 'SHORTCUT_REJECTED'), 0.1);
  advanceRaceSession(session, p, update(cp1, 'CHECKPOINT'), 0.1);

  assert.equal(session.gateTimings.length, 1);
  assert.deepEqual(session.gateTimings[0], {
    gateName: 'CP1',
    gateKind: 'checkpoint',
    elapsedSeconds: 0.2,
    validatedProgressFloor: 25,
  });
});

test('validated FINISH records a generic course-boundary interval and best interval', () => {
  const session = createRaceSessionState();
  const p = progress({ validatedProgressFloor: 100, sProgress: 101 });

  advanceRaceSession(session, p, update(finish, 'LAP'), 10);
  assert.equal(session.boundaryTimings.length, 1);
  assert.equal(session.boundaryTimings[0].intervalSeconds, 10);
  assert.equal(session.bestBoundaryIntervalSeconds, 10);

  advanceRaceSession(session, p, null, 7);
  advanceRaceSession(session, p, update(finish, 'LAP'), 2);
  assert.equal(session.boundaryTimings.length, 2);
  assert.equal(session.boundaryTimings[1].intervalSeconds, 9);
  assert.equal(session.bestBoundaryIntervalSeconds, 9);
});

test('recovery/resync ticks still consume run time but cannot manufacture timing records', () => {
  const session = createRaceSessionState();
  const p = progress({ lastEvent: 'RESYNC' });
  advanceRaceSession(session, p, null, 1.5);
  assert.equal(session.elapsedSeconds, 1.5);
  assert.equal(session.gateTimings.length, 0);
  assert.equal(session.boundaryTimings.length, 0);
});

test('ranking consumes continuous validated progress and never raw geometric chainage', () => {
  const standings = rankRaceProgress([
    { competitorId: 'A', sProgress: 120, validatedProgressFloor: 100 },
    { competitorId: 'B', sProgress: 130, validatedProgressFloor: 100 },
    { competitorId: 'C', sProgress: 110, validatedProgressFloor: 100 },
  ]);
  assert.deepEqual(standings.map((entry) => [entry.competitorId, entry.rank]), [
    ['B', 1],
    ['A', 2],
    ['C', 3],
  ]);
  assert.ok(standings.every((entry) => !('sLocal' in entry)));
});

test('at equal continuous progress an actually validated gate beats an unvalidated saturated ceiling', () => {
  const standings = rankRaceProgress([
    { competitorId: 'SATURATED', sProgress: 200, validatedProgressFloor: 100 },
    { competitorId: 'VALIDATED', sProgress: 200, validatedProgressFloor: 200 },
  ]);
  assert.equal(standings[0].competitorId, 'VALIDATED');
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 2);
});

test('exactly equal validated race states remain a true tie with no arbitrary ID tie-breaker', () => {
  const standings = rankRaceProgress([
    { competitorId: 'Z', sProgress: 300, validatedProgressFloor: 200 },
    { competitorId: 'A', sProgress: 300, validatedProgressFloor: 200 },
    { competitorId: 'B', sProgress: 250, validatedProgressFloor: 200 },
  ]);
  assert.deepEqual(standings.map((entry) => [entry.competitorId, entry.rank]), [
    ['Z', 1],
    ['A', 1],
    ['B', 3],
  ]);
});

test('validated terminal finish time resolves only otherwise-equal completed progress', () => {
  const standings = rankRaceProgress([
    {
      competitorId: 'LATER_FINISH',
      sProgress: 300,
      validatedProgressFloor: 300,
      finishElapsedSeconds: 24.5,
    },
    {
      competitorId: 'EARLIER_FINISH',
      sProgress: 300,
      validatedProgressFloor: 300,
      finishElapsedSeconds: 23.75,
    },
    {
      competitorId: 'UNFINISHED_AT_CEILING',
      sProgress: 300,
      validatedProgressFloor: 200,
      finishElapsedSeconds: null,
    },
  ]);

  assert.deepEqual(standings.map((entry) => [entry.competitorId, entry.rank]), [
    ['EARLIER_FINISH', 1],
    ['LATER_FINISH', 2],
    ['UNFINISHED_AT_CEILING', 3],
  ]);
});

test('race time formatter is deterministic millisecond display', () => {
  assert.equal(formatRaceTime(0), '0:00.000');
  assert.equal(formatRaceTime(65.4329), '1:05.432');
  assert.throws(() => formatRaceTime(-1), />= 0/);
});
