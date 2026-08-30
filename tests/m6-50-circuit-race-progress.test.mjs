import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileRasterPath } from '../dist/core/course.js';
import { sampleGuidePath } from '../dist/core/guide-curve.js';
import { compileCircuitTopology } from '../dist/gameplay/circuit-topology.js';
import {
  compileCircuitRaceRules,
  createCircuitRaceProgressState,
  getValidatedCircuitLapCount,
  resyncCircuitRaceProgress,
  updateCircuitRaceProgress,
} from '../dist/gameplay/circuit-race-progress.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import {
  circuitWindowToUnwrappedChainage,
  compileCircuitRuntimeWindow,
} from '../dist/runtime/circuit-runtime-window.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

function createGentleCircuit(segmentCount = 72, radius = 120) {
  const vertices = [];
  for (let i = 0; i < segmentCount; i += 1) {
    const angle = (i / segmentCount) * Math.PI * 2;
    vertices.push({ x: radius * Math.cos(angle), z: radius * Math.sin(angle) });
  }
  vertices.push({ ...vertices[0] });
  return compileCircuitTopology('M6_50_DEV_CIRCUIT', compileRasterPath(vertices));
}

function createSources(topology) {
  const L = topology.lapLength;
  return {
    height: new HeightProfile(L, [
      { s: 0, y: 0 },
      { s: L * 0.5, y: 2 },
      { s: L, y: 0 },
    ]),
    visual: new VisualProfile(L, [
      {
        sStart: 0,
        name: 'CIRCUIT',
        groundBaseLeft: { kind: 'color', color: 0x111111ff },
        groundBaseRight: { kind: 'color', color: 0x111111ff },
      },
    ]),
    surface: new SurfaceMap(L, [
      {
        sStart: 0,
        name: 'ASPHALT',
        bands: [{ lMin: -5, lMax: 5, type: 'ASPHALT' }],
      },
    ]),
  };
}

function createFixture({ startWinding = 0, repeatCount = 4, lapCount = 3 } = {}) {
  const topology = createGentleCircuit();
  const window = compileCircuitRuntimeWindow(
    topology,
    startWinding,
    repeatCount,
    { lMax: 4.5, mMin: 0.72, dCam: 5 },
    createSources(topology),
  );
  const rules = compileCircuitRaceRules(window, {
    id: 'M6_50_THREE_LAP_RACE',
    lapCount,
    checkpointChainages: [
      topology.lapLength * 0.25,
      topology.lapLength * 0.50,
      topology.lapLength * 0.75,
    ],
  });
  return { topology, window, rules };
}

function atWindowGuide(window, sWindow) {
  const sample = sampleGuidePath(window.guide, sWindow);
  return { x: sample.x, z: sample.z, sWindow };
}

function offsetGate(gate, longitudinal, lateral = 0) {
  return {
    x: gate.center.x + gate.tangent.x * longitudinal + gate.normal.x * lateral,
    z: gate.center.z + gate.tangent.z * longitudinal + gate.normal.z * lateral,
    sWindow: gate.s + longitudinal,
  };
}

function crossForward(state, rules, gate, lateral = 0) {
  resyncCircuitRaceProgress(state, rules, offsetGate(gate, -1, lateral));
  return updateCircuitRaceProgress(state, rules, offsetGate(gate, 1, lateral));
}

function crossReverse(state, rules, gate, lateral = 0) {
  resyncCircuitRaceProgress(state, rules, offsetGate(gate, 1, lateral));
  return updateCircuitRaceProgress(state, rules, offsetGate(gate, -1, lateral));
}

test('M6.50 circuit authoring expands into one finite strictly ordered physical gate sequence', () => {
  const { topology, window, rules } = createFixture();
  const L = topology.lapLength;

  assert.equal(rules.lapCount, 3);
  assert.equal(rules.gates.length, 12);
  assert.deepEqual(rules.gates.map((gate) => gate.kind), [
    'checkpoint', 'checkpoint', 'checkpoint', 'finish',
    'checkpoint', 'checkpoint', 'checkpoint', 'finish',
    'checkpoint', 'checkpoint', 'checkpoint', 'finish',
  ]);
  assert.deepEqual(rules.gates.filter((gate) => gate.kind === 'finish').map((gate) => gate.s), [L, 2 * L, 3 * L]);
  assert.ok(rules.gates.every((gate, i) => i === 0 || gate.s > rules.gates[i - 1].s));
  assert.ok(rules.raceDistance < window.length, 'scored race must finish before the finite open endpoint');
});

test('M6.50 requires one unscored lookahead lap so final FINISH is an ordinary interior Guide seam', () => {
  const topology = createGentleCircuit();
  const sources = createSources(topology);
  const tooShort = compileCircuitRuntimeWindow(
    topology,
    0,
    3,
    { lMax: 4.5, mMin: 0.72, dCam: 5 },
    sources,
  );

  assert.throws(
    () => compileCircuitRaceRules(tooShort, {
      id: 'BAD_THREE_LAP_RACE',
      lapCount: 3,
      checkpointChainages: [topology.lapLength * 0.5],
    }),
    /lapCount \+ 1/,
  );

  const { rules, window } = createFixture({ repeatCount: 4, lapCount: 3 });
  assert.ok(rules.raceDistance < window.guide.length);
});

test('M6.50 circuit race compiler rejects missing unordered and out-of-range lap checkpoints', () => {
  const topology = createGentleCircuit();
  const window = compileCircuitRuntimeWindow(
    topology,
    0,
    3,
    { lMax: 4.5, mMin: 0.72, dCam: 5 },
    createSources(topology),
  );
  const base = { id: 'BAD', lapCount: 2 };

  assert.throws(() => compileCircuitRaceRules(window, { ...base, checkpointChainages: [] }), /at least one physical checkpoint/);
  assert.throws(() => compileCircuitRaceRules(window, { ...base, checkpointChainages: [20, 10] }), /strictly increasing/);
  assert.throws(() => compileCircuitRaceRules(window, { ...base, checkpointChainages: [0] }), /0 < s < lapLength/);
  assert.throws(() => compileCircuitRaceRules(window, { ...base, checkpointChainages: [topology.lapLength] }), /0 < s < lapLength/);
});

test('M6.50 topological startWinding does not seed validated race laps or progress', () => {
  const { topology, window, rules } = createFixture({ startWinding: 137 });
  const start = atWindowGuide(window, 0);
  const state = createCircuitRaceProgressState(rules, start);

  assert.equal(rules.startWinding, 137);
  assert.ok(Math.abs(circuitWindowToUnwrappedChainage(window, 0) - 137 * topology.lapLength) < 1e-8);
  assert.equal(getValidatedCircuitLapCount(state), 0);
  assert.equal(state.validatedProgressFloor, 0);
  assert.equal(state.sProgress, 0);
});

test('M6.50 raw s_window movement without world motion cannot validate or advance race progress', () => {
  const { window, rules } = createFixture();
  const start = atWindowGuide(window, 0);
  const state = createCircuitRaceProgressState(rules, start);
  const cp1 = rules.gates[0];

  const update = updateCircuitRaceProgress(state, rules, {
    x: start.x,
    z: start.z,
    sWindow: cp1.s,
  });
  assert.equal(update.event, 'NONE');
  assert.equal(update.acceptedGate, null);
  assert.equal(state.validatedProgressFloor, 0);
  assert.equal(state.sProgress, 0);
  assert.equal(getValidatedCircuitLapCount(state), 0);
});

test('M6.50 crossing the physical seam before required checkpoints is rejected and cannot award a lap', () => {
  const { window, rules } = createFixture();
  const state = createCircuitRaceProgressState(rules, atWindowGuide(window, 0));
  const firstFinish = rules.gates.find((gate) => gate.name === 'L1_FINISH');
  assert.ok(firstFinish);

  const update = crossForward(state, rules, firstFinish);
  assert.equal(update.event, 'SHORTCUT_REJECTED');
  assert.equal(update.acceptedGate, null);
  assert.equal(state.nextGateIndex, 0);
  assert.equal(getValidatedCircuitLapCount(state), 0);
  assert.equal(state.validatedProgressFloor, 0);
});

test('M6.50 one complete ordered physical lap increments validated lap count only at FINISH', () => {
  const { window, rules } = createFixture();
  const state = createCircuitRaceProgressState(rules, atWindowGuide(window, 0));
  const lap1 = rules.gates.slice(0, 4);

  assert.equal(crossForward(state, rules, lap1[0]).event, 'CHECKPOINT');
  assert.equal(crossForward(state, rules, lap1[1]).event, 'CHECKPOINT');
  assert.equal(crossForward(state, rules, lap1[2]).event, 'CHECKPOINT');
  assert.equal(getValidatedCircuitLapCount(state), 0);

  const finish = crossForward(state, rules, lap1[3]);
  assert.equal(finish.event, 'BOUNDARY');
  assert.equal(finish.acceptedGate?.name, 'L1_FINISH');
  assert.equal(getValidatedCircuitLapCount(state), 1);
  assert.equal(state.validatedProgressFloor, rules.lapLength);
  assert.equal(state.status, 'RUNNING');
  assert.equal(state.nextGateIndex, 4);
});

test('M6.50 repeated world gate geometry is disambiguated by finite window chainage without duplicate acceptance', () => {
  const { window, rules } = createFixture();
  const state = createCircuitRaceProgressState(rules, atWindowGuide(window, 0));
  const lap1Cp1 = rules.gates[0];
  const lap2Cp1 = rules.gates[4];

  assert.ok(Math.abs(lap1Cp1.center.x - lap2Cp1.center.x) < 1e-8);
  assert.ok(Math.abs(lap1Cp1.center.z - lap2Cp1.center.z) < 1e-8);

  const update = crossForward(state, rules, lap1Cp1);
  assert.equal(update.acceptedGate?.name, 'L1_CP1');
  assert.equal(state.acceptedGateCount, 1);
  assert.equal(state.shortcutViolationCount, 0);
  assert.equal(state.nextGateIndex, 1);
});

test('M6.50 every scored FINISH uses the same interior-seam physical plane geometry', () => {
  const { rules } = createFixture();
  const finishes = rules.gates.filter((gate) => gate.kind === 'finish');
  assert.equal(finishes.length, 3);
  const authority = finishes[0];
  for (const finish of finishes.slice(1)) {
    assert.ok(Math.abs(finish.center.x - authority.center.x) < 1e-8);
    assert.ok(Math.abs(finish.center.z - authority.center.z) < 1e-8);
    assert.ok(Math.abs(finish.tangent.x - authority.tangent.x) < 1e-8);
    assert.ok(Math.abs(finish.tangent.z - authority.tangent.z) < 1e-8);
    assert.ok(Math.abs(finish.normal.x - authority.normal.x) < 1e-8);
    assert.ok(Math.abs(finish.normal.z - authority.normal.z) < 1e-8);
  }
});

test('M6.50 reverse FINISH crossing is observed but never awards a circuit lap', () => {
  const { window, rules } = createFixture();
  const state = createCircuitRaceProgressState(rules, atWindowGuide(window, 0));
  const lap1 = rules.gates.slice(0, 4);
  crossForward(state, rules, lap1[0]);
  crossForward(state, rules, lap1[1]);
  crossForward(state, rules, lap1[2]);

  const update = crossReverse(state, rules, lap1[3]);
  assert.equal(update.event, 'REVERSE_CROSSING');
  assert.equal(getValidatedCircuitLapCount(state), 0);
  assert.equal(state.nextGateIndex, 3);
  assert.equal(state.reverseCrossingCount, 1);
});

test('M6.50 recovery resync cannot award erase or move validated circuit progress', () => {
  const { window, rules } = createFixture();
  const state = createCircuitRaceProgressState(rules, atWindowGuide(window, 0));
  crossForward(state, rules, rules.gates[0]);
  const before = {
    floor: state.validatedProgressFloor,
    progress: state.sProgress,
    next: state.nextGateIndex,
    laps: state.acceptedFinishCount,
  };

  resyncCircuitRaceProgress(state, rules, atWindowGuide(window, rules.lapLength * 2.8));
  assert.equal(state.lastEvent, 'RESYNC');
  assert.deepEqual({
    floor: state.validatedProgressFloor,
    progress: state.sProgress,
    next: state.nextGateIndex,
    laps: state.acceptedFinishCount,
  }, before);
});

test('M6.50 full three-lap ordered physical sequence finishes exactly at validated third FINISH', () => {
  const { window, rules } = createFixture();
  const state = createCircuitRaceProgressState(rules, atWindowGuide(window, 0));

  let finalUpdate = null;
  for (const gate of rules.gates) finalUpdate = crossForward(state, rules, gate);

  assert.ok(finalUpdate);
  assert.equal(finalUpdate.event, 'FINISHED');
  assert.equal(finalUpdate.justFinished, true);
  assert.equal(finalUpdate.acceptedGate?.name, 'L3_FINISH');
  assert.equal(state.status, 'FINISHED');
  assert.equal(getValidatedCircuitLapCount(state), 3);
  assert.equal(state.acceptedGateCount, 12);
  assert.ok(Math.abs(state.validatedProgressFloor - rules.raceDistance) < 1e-8);
  assert.ok(Math.abs(state.sProgress - rules.raceDistance) < 1e-8);

  const after = updateCircuitRaceProgress(state, rules, atWindowGuide(window, rules.raceDistance + 10));
  assert.equal(after.event, 'IGNORED_AFTER_FINISH');
  assert.equal(after.justFinished, false);
  assert.equal(state.sProgress, rules.raceDistance);
});

test('M6.50 physical gate math is shared while finite ordered progress stays topology and renderer blind', async () => {
  await assert.rejects(
    readFile(new URL('../src/gameplay/race-progress.ts', import.meta.url), 'utf8'),
    { code: 'ENOENT' },
  );
  const physical = await readFile(new URL('../src/gameplay/physical-race-gate.ts', import.meta.url), 'utf8');
  const ordered = await readFile(new URL('../src/gameplay/ordered-race-progress.ts', import.meta.url), 'utf8');
  const circuit = await readFile(new URL('../src/gameplay/circuit-race-progress.ts', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8');

  assert.match(ordered, /physical-race-gate/);
  assert.match(physical, /detectPhysicalRaceGateCrossing/);
  assert.doesNotMatch(ordered, /wrapPositive|wrapSigned|CircuitTopology|CIRCUIT/);
  assert.doesNotMatch(circuit, /route-dag|render\//);
  assert.doesNotMatch(renderer, /circuit-race-progress|ordered-race-progress|CIRCUIT/);
});
