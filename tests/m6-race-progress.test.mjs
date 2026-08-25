import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import {
  compileRaceCourseRules,
  createGeometricCourseTracker,
  createM6DebugRaceRules,
  createRaceProgressState,
  getRaceProgressWindow,
  resyncGeometricCourseTracker,
  resyncRaceProgressPosition,
  updateGeometricCourseTracker,
  updateRaceProgress,
} from '../dist/gameplay/race-progress.js';

function offset(gate, longitudinal, lateral = 0, courseLength = 1) {
  return {
    x: gate.center.x + gate.tangent.x * longitudinal + gate.normal.x * lateral,
    z: gate.center.z + gate.tangent.z * longitudinal + gate.normal.z * lateral,
    sLocal: ((gate.s + longitudinal) % courseLength + courseLength) % courseLength,
  };
}

function crossForward(state, rules, gate, lateral = 0) {
  const before = offset(gate, -1, lateral, rules.courseLength);
  const after = offset(gate, 1, lateral, rules.courseLength);
  resyncRaceProgressPosition(state, rules, before);
  return updateRaceProgress(state, rules, after);
}

function crossReverse(state, rules, gate, lateral = 0) {
  const before = offset(gate, 1, lateral, rules.courseLength);
  const after = offset(gate, -1, lateral, rules.courseLength);
  resyncRaceProgressPosition(state, rules, before);
  return updateRaceProgress(state, rules, after);
}

test('M6 race rules compile three ordered checkpoints plus fixed s=0 finish using Guide envelope width', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);

  assert.equal(rules.gates.length, 4);
  assert.deepEqual(rules.gates.map((gate) => gate.kind), ['checkpoint', 'checkpoint', 'checkpoint', 'finish']);
  assert.deepEqual(rules.gates.slice(0, 3).map((gate) => gate.s), [
    guide.length * 0.25,
    guide.length * 0.5,
    guide.length * 0.75,
  ]);
  assert.equal(rules.gates[3].s, 0);
  for (const gate of rules.gates) assert.equal(gate.halfWidth, guide.lMax);
});

test('race rule compiler rejects unordered or out-of-range checkpoint authoring', () => {
  const guide = createM2StadiumGuide();
  assert.throws(() => compileRaceCourseRules(guide, [100, 90]), /strictly increasing/);
  assert.throws(() => compileRaceCourseRules(guide, [0]), /0 < s < courseLength/);
  assert.throws(() => compileRaceCourseRules(guide, [guide.length]), /0 < s < courseLength/);
});

test('GeometricCoursePosition tracks seam laps independently from race progress', () => {
  const L = 100;
  const tracker = createGeometricCourseTracker(L, 98);
  assert.deepEqual(updateGeometricCourseTracker(tracker, L, 2), { lap: 1, sLocal: 2 });
  assert.deepEqual(updateGeometricCourseTracker(tracker, L, 99), { lap: 0, sLocal: 99 });

  resyncGeometricCourseTracker(tracker, L, 40);
  assert.deepEqual(tracker.position, { lap: 0, sLocal: 40 });
});

test('expected physical checkpoint crossing advances the validated floor and opens the next sector', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const cp1 = rules.gates[0];
  const cp2 = rules.gates[1];
  const initial = offset(cp1, -1, 0, rules.courseLength);
  const state = createRaceProgressState(rules, initial);

  const result = updateRaceProgress(state, rules, offset(cp1, 1, 0, rules.courseLength));
  assert.equal(result.event, 'CHECKPOINT');
  assert.equal(result.acceptedGate?.name, 'CP1');
  assert.equal(state.nextGateIndex, 1);
  assert.equal(state.validatedProgressFloor, cp1.s);
  assert.ok(state.sProgress > cp1.s);
  assert.ok(state.sProgress < cp2.s);
  assert.equal(state.lapIndex, 0);
});

test('raw geometric chainage jump with no world motion cannot advance continuous s_progress', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const start = { x: 1_000_000, z: 1_000_000, sLocal: 10 };
  const state = createRaceProgressState(rules, start);
  assert.equal(state.sProgress, 10);

  updateRaceProgress(state, rules, { x: start.x, z: start.z, sLocal: guide.length * 0.74 });
  assert.equal(state.sProgress, 10);
  assert.equal(state.validatedProgressFloor, 0);
  assert.equal(state.nextGateIndex, 0);
});

test('reverse gate crossing is detected but never awards checkpoint progress', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const cp1 = rules.gates[0];
  const state = createRaceProgressState(rules, offset(cp1, 1, 0, rules.courseLength));

  const result = updateRaceProgress(state, rules, offset(cp1, -1, 0, rules.courseLength));
  assert.equal(result.event, 'REVERSE_CROSSING');
  assert.equal(result.direction, 'REVERSE');
  assert.equal(state.reverseCrossingCount, 1);
  assert.equal(state.validatedProgressFloor, 0);
  assert.equal(state.nextGateIndex, 0);
});

test('crossing a later checkpoint before the expected one is rejected as a shortcut', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const cp1 = rules.gates[0];
  const cp2 = rules.gates[1];
  const state = createRaceProgressState(rules, offset(cp2, -1, 0, rules.courseLength));

  const result = updateRaceProgress(state, rules, offset(cp2, 1, 0, rules.courseLength));
  assert.equal(result.event, 'SHORTCUT_REJECTED');
  assert.equal(result.acceptedGate, null);
  assert.equal(state.shortcutViolationCount, 1);
  assert.equal(state.nextGateIndex, 0);
  assert.equal(state.validatedProgressFloor, 0);
  assert.ok(state.sProgress >= 0 && state.sProgress <= cp1.s);
});

test('checkpoint crossing outside the Guide race envelope does not validate and interpolation cannot pass its ceiling', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const cp1 = rules.gates[0];
  const outside = cp1.halfWidth + 0.1;
  const state = createRaceProgressState(rules, offset(cp1, -1, outside, rules.courseLength));

  const result = updateRaceProgress(state, rules, offset(cp1, 1, outside, rules.courseLength));
  assert.equal(result.event, 'NONE');
  assert.equal(state.validatedProgressFloor, 0);
  assert.equal(state.nextGateIndex, 0);
  assert.equal(state.sProgress, cp1.s);
});

test('ordered CP1 CP2 CP3 FINISH sequence increments lap only at the validated finish crossing', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const state = createRaceProgressState(rules, offset(rules.gates[0], -1, 0, rules.courseLength));

  assert.equal(crossForward(state, rules, rules.gates[0]).event, 'CHECKPOINT');
  assert.equal(crossForward(state, rules, rules.gates[1]).event, 'CHECKPOINT');
  assert.equal(crossForward(state, rules, rules.gates[2]).event, 'CHECKPOINT');
  assert.equal(state.lapIndex, 0);
  assert.equal(state.nextGateIndex, 3);

  const finish = crossForward(state, rules, rules.gates[3]);
  assert.equal(finish.event, 'LAP');
  assert.equal(state.lapIndex, 1);
  assert.equal(state.nextGateIndex, 0);
  assert.equal(state.validatedProgressFloor, guide.length);
  assert.ok(state.sProgress >= guide.length);
  assert.ok(state.sProgress <= guide.length + rules.gates[0].s);
  assert.equal(state.acceptedGateCount, 4);
});

test('one physics update can accept at most one forward gate even if a teleport segment intersects multiple gates', () => {
  const guide = createM2StadiumGuide();
  const baseRules = createM6DebugRaceRules(guide);
  const gate = baseRules.gates[0];
  const coincidentSecond = { ...gate, index: 1, name: 'CP2-SYNTHETIC' };
  const rules = { ...baseRules, gates: [gate, coincidentSecond] };
  const state = createRaceProgressState(rules, offset(gate, -1, 0, rules.courseLength));

  const result = updateRaceProgress(state, rules, offset(gate, 1, 0, rules.courseLength));
  assert.equal(result.acceptedGate?.name, 'CP1');
  assert.equal(state.acceptedGateCount, 1);
  assert.equal(state.nextGateIndex, 1);
  assert.equal(state.shortcutViolationCount, 1);
  assert.equal(state.lastEvent, 'SHORTCUT_REJECTED');
});

test('recovery resync changes observation origin without awarding or moving validated race progress', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const state = createRaceProgressState(rules, offset(rules.gates[0], -1, 0, rules.courseLength));
  crossForward(state, rules, rules.gates[0]);
  const progressBefore = state.sProgress;
  const floorBefore = state.validatedProgressFloor;

  const teleported = offset(rules.gates[2], 1, 0, rules.courseLength);
  resyncRaceProgressPosition(state, rules, teleported);
  assert.equal(state.lastEvent, 'RESYNC');
  assert.equal(state.sProgress, progressBefore);
  assert.equal(state.validatedProgressFloor, floorBefore);
  assert.equal(state.nextGateIndex, 1);
});

test('M6.1 initial spawn inside sector zero seeds smooth progress without validating a checkpoint', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const spawn = { x: 0, z: 0, sLocal: 45 };
  const state = createRaceProgressState(rules, spawn);

  assert.equal(state.sProgress, 45);
  assert.equal(state.validatedProgressFloor, 0);
  assert.deepEqual(getRaceProgressWindow(state, rules), { floor: 0, ceiling: rules.gates[0].s });
});

test('M6.1 forward motion interpolates continuously inside the current validated sector', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const cp1 = rules.gates[0];
  const state = createRaceProgressState(rules, offset(cp1, -20, 0, rules.courseLength));

  const before = state.sProgress;
  const result = updateRaceProgress(state, rules, offset(cp1, -10, 0, rules.courseLength));
  assert.equal(result.event, 'NONE');
  assert.equal(result.direction, 'FORWARD');
  assert.ok(state.sProgress > before);
  assert.ok(Math.abs(state.sProgress - (cp1.s - 10)) < 1e-9);
  assert.equal(state.validatedProgressFloor, 0);
});

test('M6.1 raw interpolation saturates at the next required gate until that physical gate is accepted', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const cp1 = rules.gates[0];
  const outside = cp1.halfWidth + 1;
  const state = createRaceProgressState(rules, offset(cp1, -2, outside, rules.courseLength));

  updateRaceProgress(state, rules, offset(cp1, 20, outside, rules.courseLength));
  assert.equal(state.nextGateIndex, 0);
  assert.equal(state.validatedProgressFloor, 0);
  assert.equal(state.sProgress, cp1.s);
});

test('M6.1 reverse interpolation can lose position inside a sector but never below the last validated gate', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const cp1 = rules.gates[0];
  const state = createRaceProgressState(rules, offset(cp1, -1, 0, rules.courseLength));
  crossForward(state, rules, cp1);
  assert.equal(state.validatedProgressFloor, cp1.s);

  resyncRaceProgressPosition(state, rules, offset(cp1, 10, 0, rules.courseLength));
  state.sProgress = cp1.s + 10;
  const result = updateRaceProgress(state, rules, offset(cp1, -10, 0, rules.courseLength));
  assert.equal(result.direction, 'REVERSE');
  assert.equal(state.sProgress, cp1.s);
  assert.equal(state.validatedProgressFloor, cp1.s);
});

test('M6.1 after CP1 the continuous ceiling moves to CP2 but cannot cross CP2 without validation', () => {
  const guide = createM2StadiumGuide();
  const rules = createM6DebugRaceRules(guide);
  const cp1 = rules.gates[0];
  const cp2 = rules.gates[1];
  const state = createRaceProgressState(rules, offset(cp1, -1, 0, rules.courseLength));
  crossForward(state, rules, cp1);
  assert.deepEqual(getRaceProgressWindow(state, rules), { floor: cp1.s, ceiling: cp2.s });

  const outside = cp2.halfWidth + 1;
  resyncRaceProgressPosition(state, rules, offset(cp2, -2, outside, rules.courseLength));
  state.sProgress = cp2.s - 1;
  updateRaceProgress(state, rules, offset(cp2, 5, outside, rules.courseLength));
  assert.equal(state.nextGateIndex, 1);
  assert.equal(state.validatedProgressFloor, cp1.s);
  assert.equal(state.sProgress, cp2.s);
});
