import assert from 'node:assert/strict';
import test from 'node:test';
import { createStraightReferenceWorld } from '../../dist/dev/fixtures/straight-world.js';
import {
  compileCircuitRaceRules,
  createCircuitRaceProgressState,
  updateCircuitRaceProgress,
  resyncCircuitRaceProgress,
} from '../../dist/gameplay/circuit-race-progress.js';
const guide = createStraightReferenceWorld().guide;
const authoring = { id: 'source-lap', lapCount: 2, entryS: 30, finishS: 2030, checkpointChainages: [530, 1030, 1530] };
const rules = compileCircuitRaceRules(guide, authoring);
const at = (s, x = 0) => ({ x, z: s, s });
const cross = (state, s, reverse = false, x = 0) => {
  resyncCircuitRaceProgress(state, rules, at(s + (reverse ? 1 : -1), x));
  return updateCircuitRaceProgress(state, rules, at(s + (reverse ? -1 : 1), x));
};
test('circuit compiles one shared source and gate set, independent of lap count', () => {
  assert.equal(rules.lap.guide, guide);
  assert.equal(rules.lap.gates.length, 4);
  assert.equal(compileCircuitRaceRules(guide, { ...authoring, lapCount: 100 }).lap.gates.length, 4);
  for (const changes of [
    { lapCount: 0 },
    { entryS: 2030 },
    { finishS: guide.length },
    { checkpointChainages: [] },
    { checkpointChainages: [1030, 530] },
  ])
    assert.throws(() => compileCircuitRaceRules(guide, { ...authoring, ...changes }), RangeError);
  authoring.checkpointChainages[0] = 600;
  assert.equal(rules.lap.gates[0].s, 530);
});
test('only ordered physical checkpoint and finish crossings count; source entry is not a lap', () => {
  const state = createCircuitRaceProgressState(rules, at(45));
  assert.equal(state.acceptedFinishCount, 0);
  cross(state, 2030);
  assert.equal(state.acceptedFinishCount, 0);
  cross(state, 530, true);
  assert.equal(state.lap.acceptedGateCount, 0);
  cross(state, 530, false, 100);
  assert.equal(state.lap.acceptedGateCount, 0);
  resyncCircuitRaceProgress(state, rules, at(529));
  updateCircuitRaceProgress(state, rules, { ...at(529), s: 531 });
  assert.equal(state.lap.acceptedGateCount, 0, 'chainage alone cannot cross a world gate');
  for (const gate of rules.lap.gates) cross(state, gate.s);
  assert.equal(state.acceptedFinishCount, 1);
  assert.equal(state.status, 'RUNNING');
  assert.equal(state.validatedProgressFloor, 2000);
  resyncCircuitRaceProgress(state, rules, at(31));
  assert.equal(state.lap.nextGateIndex, 0);
  for (const gate of rules.lap.gates) cross(state, gate.s);
  assert.equal(state.acceptedFinishCount, 2);
  assert.equal(state.status, 'FINISHED');
  assert.equal(state.validatedProgressFloor, 4000);
  resyncCircuitRaceProgress(state, rules, at(31));
  for (const gate of rules.lap.gates) cross(state, gate.s);
  assert.equal(state.acceptedFinishCount, 2);
  assert.equal(state.sProgress, 4000);
});
test('recovery, replacement and reverse frame observation retain earned progress without new credit', () => {
  const state = createCircuitRaceProgressState(rules, at(45));
  cross(state, 530);
  const accepted = [
    state.lap.nextGateIndex,
    state.lap.acceptedGateCount,
    state.acceptedFinishCount,
    state.validatedProgressFloor,
    state.sProgress,
  ];
  for (const sample of [at(100), at(2035), at(31), at(1020)]) {
    resyncCircuitRaceProgress(state, rules, sample);
    assert.deepEqual(
      [
        state.lap.nextGateIndex,
        state.lap.acceptedGateCount,
        state.acceptedFinishCount,
        state.validatedProgressFloor,
        state.sProgress,
      ],
      accepted,
    );
  }
});

test('new-lap resync never awards recovery displacement on the following ordinary step', () => {
  const state = createCircuitRaceProgressState(rules, at(45));
  for (const gate of rules.lap.gates) cross(state, gate.s);
  resyncCircuitRaceProgress(state, rules, at(400));
  assert.equal(state.sProgress, 2000);
  updateCircuitRaceProgress(state, rules, at(401));
  assert.equal(state.sProgress, 2001);
  assert.equal(state.acceptedFinishCount, 1);
});
