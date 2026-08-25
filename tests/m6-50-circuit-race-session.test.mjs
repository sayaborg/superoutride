import assert from 'node:assert/strict';
import test from 'node:test';

import { compileRasterPath } from '../dist/core/course.js';
import { sampleGuidePath } from '../dist/core/guide-curve.js';
import { compileCircuitTopology } from '../dist/gameplay/circuit-topology.js';
import {
  compileCircuitRaceRules,
  createCircuitRaceProgressState,
  resyncCircuitRaceProgress,
  updateCircuitRaceProgress,
} from '../dist/gameplay/circuit-race-progress.js';
import { advanceRaceSession, createRaceSessionState } from '../dist/gameplay/race-session.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { compileCircuitRuntimeWindow } from '../dist/runtime/circuit-runtime-window.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

function createFixture() {
  const vertices = [];
  const segmentCount = 72;
  const radius = 120;
  for (let i = 0; i < segmentCount; i += 1) {
    const angle = (i / segmentCount) * Math.PI * 2;
    vertices.push({ x: radius * Math.cos(angle), z: radius * Math.sin(angle) });
  }
  vertices.push({ ...vertices[0] });
  const topology = compileCircuitTopology('M6_50_SESSION_CIRCUIT', compileRasterPath(vertices));
  const L = topology.lapLength;
  const window = compileCircuitRuntimeWindow(
    topology,
    0,
    3,
    { lMax: 4.5, mMin: 0.72, dCam: 5 },
    {
      height: new HeightProfile(L, [{ s: 0, y: 0 }, { s: L, y: 0 }]),
      visual: new VisualProfile(L, [{
        sStart: 0,
        name: 'CIRCUIT',
        groundBaseLeft: { kind: 'color', color: 0x111111ff },
        groundBaseRight: { kind: 'color', color: 0x111111ff },
      }]),
      surface: new SurfaceMap(L, [{
        sStart: 0,
        name: 'ASPHALT',
        bands: [{ lMin: -5, lMax: 5, type: 'ASPHALT' }],
      }]),
    },
  );
  const rules = compileCircuitRaceRules(window, {
    id: 'M6_50_TWO_LAP_SESSION',
    lapCount: 2,
    checkpointChainages: [L * 0.5],
  });
  return { window, rules };
}

function guideSample(window, sWindow) {
  const sample = sampleGuidePath(window.guide, sWindow);
  return { x: sample.x, z: sample.z, sWindow };
}

function cross(state, rules, gate) {
  const before = {
    x: gate.center.x - gate.tangent.x,
    z: gate.center.z - gate.tangent.z,
    sWindow: gate.s - 1,
  };
  const after = {
    x: gate.center.x + gate.tangent.x,
    z: gate.center.z + gate.tangent.z,
    sWindow: gate.s + 1,
  };
  resyncCircuitRaceProgress(state, rules, before);
  return updateCircuitRaceProgress(state, rules, after);
}

test('M6.50 generic race session records circuit checkpoint and physical lap-boundary timings without legacy race-progress dependency', () => {
  const { window, rules } = createFixture();
  const state = createCircuitRaceProgressState(rules, guideSample(window, 0));
  const session = createRaceSessionState();

  for (const gate of rules.gates.slice(0, 2)) {
    const update = cross(state, rules, gate);
    advanceRaceSession(session, state, update, 0.25);
  }

  assert.equal(session.elapsedSeconds, 0.5);
  assert.equal(session.gateTimings.length, 2);
  assert.deepEqual(session.gateTimings.map((timing) => timing.gateKind), ['checkpoint', 'finish']);
  assert.equal(session.boundaryTimings.length, 1);
  assert.equal(session.boundaryTimings[0].elapsedSeconds, 0.5);
  assert.equal(session.boundaryTimings[0].intervalSeconds, 0.5);
  assert.equal(session.bestBoundaryIntervalSeconds, 0.5);
  assert.equal(state.acceptedFinishCount, 1);
});
