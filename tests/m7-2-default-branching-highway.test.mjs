import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { guideCourseToWorld, sampleGuideCurve } from '../dist/core/guide-curve.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import {
  M7_2_DEFAULT_BRANCHING_FORK,
  M7_2_DEFAULT_BRANCHING_JUNCTION,
  M7_2_FORK_WIDEN_START_S,
  M7_2_HANDOFF_SEAM_S,
  M7_2_PLAYER_RECOVERY_PROFILE,
  M7_2_PLAYER_START_L,
  M7_2_RIVAL_RECOVERY_PROFILE,
  M7_2_RIVAL_START_L,
  M7_2_ROUTE_GATE_S,
  createM72DefaultBranchingParent,
} from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, updateM5Recovery } from '../dist/gameplay/recovery.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';

const near = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

test('M7.2 default BRANCHING parent is the long four-lane highway rather than the M6 stadium', () => {
  const parent = createM72DefaultBranchingParent();
  assert.ok(parent.guide.length > 7_000);
  assert.equal(parent.groundProfile.roadLeft, 7);
  assert.equal(parent.groundProfile.roadRight, 7);
  assert.equal(parent.surfaceMap.sample(1_000, -6.99).type, 'ASPHALT');
  assert.equal(parent.surfaceMap.sample(1_000, 6.99).type, 'ASPHALT');
  assert.equal(parent.surfaceMap.sample(1_000, 7.5).type, 'SHOULDER');

  assert.equal(sampleGroundMap(4, -3.5, parent.groundProfile), GROUND_COLORS.marking);
  assert.notEqual(sampleGroundMap(10, -3.5, parent.groundProfile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(10, -7, parent.groundProfile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(10, 7, parent.groundProfile), GROUND_COLORS.marking);
});

test('M7.2 first fork occupies one straight flat authored interval after the calibration section', () => {
  const parent = createM72DefaultBranchingParent();
  assert.equal(M7_2_DEFAULT_BRANCHING_JUNCTION.sample(M7_2_FORK_WIDEN_START_S - 1).phase, 'SINGLE');
  assert.equal(M7_2_DEFAULT_BRANCHING_JUNCTION.sample(M7_2_ROUTE_GATE_S).phase, 'SEPARATED');
  assert.equal(M7_2_DEFAULT_BRANCHING_JUNCTION.sample(M7_2_HANDOFF_SEAM_S).phase, 'SEPARATED');
  near(parent.heightProfile.samplePhysics(M7_2_FORK_WIDEN_START_S), 0);
  near(parent.heightProfile.samplePhysics(M7_2_HANDOFF_SEAM_S), 0);
  near(
    sampleGuideCurve(parent.guide, M7_2_FORK_WIDEN_START_S).heading,
    sampleGuideCurve(parent.guide, M7_2_HANDOFF_SEAM_S).heading,
    1e-9,
  );
});

test('M7.2 runtime moves first physical gates and handoff seams with the selected parent authoring', () => {
  const parent = createM72DefaultBranchingParent();
  const live = createM627LiveRouteRuntime(
    parent.guide,
    {
      heightProfile: parent.heightProfile,
      surfaceMap: parent.surfaceMap,
      terrainProfile: parent.terrainProfile,
      groundProfile: parent.groundProfile,
      selectFarBackground: () => createM3FarBackground(),
      worldSprites: [],
    },
    createM4SpriteAssets(),
    M7_2_DEFAULT_BRANCHING_FORK,
  );

  for (const side of ['LEFT', 'RIGHT']) {
    const choiceId = side === 'LEFT' ? 'S1_LEFT' : 'S1_RIGHT';
    const gate = live.gates.gates.find((entry) => entry.kind === 'TRANSITION' && entry.choiceId === choiceId);
    const seam = live.handoffs.seams.find((entry) => entry.choiceId === choiceId);
    assert.ok(gate);
    assert.ok(seam);
    const localL = M7_2_DEFAULT_BRANCHING_JUNCTION.separatedChildCenterL(side);
    const expectedGate = guideCourseToWorld(parent.guide, M7_2_ROUTE_GATE_S, localL);
    const expectedSeam = guideCourseToWorld(parent.guide, M7_2_HANDOFF_SEAM_S, localL);
    near(gate.center.x, expectedGate.x);
    near(gate.center.z, expectedGate.z);
    near(seam.center.x, expectedSeam.x);
    near(seam.center.z, expectedSeam.z);
    assert.equal(seam.sourceSeamS, M7_2_HANDOFF_SEAM_S);
  }

  assert.equal(live.initialChart.guide, parent.guide);
  assert.equal(live.route.startStageId, 'STAGE_1');
});

test('M7.2 default composition owns lane-center spawn and recovery without changing BRANCHING topology', () => {
  assert.equal(M7_2_PLAYER_START_L, -1.75);
  assert.equal(M7_2_RIVAL_START_L, 1.75);
  assert.equal(M7_2_PLAYER_RECOVERY_PROFILE.targetL, M7_2_PLAYER_START_L);
  assert.equal(M7_2_RIVAL_RECOVERY_PROFILE.targetL, M7_2_RIVAL_START_L);

  const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /createM72DefaultBranchingParent/);
  assert.match(main, /M7_2_DEFAULT_BRANCHING_FORK/);
  assert.match(main, /M7_2_PLAYER_START_L/);
  assert.match(main, /M7_2_PLAYER_RECOVERY_PROFILE/);
  assert.doesNotMatch(main, /createM71HighwayCalibrationRuntime|compileCircuitLiveRuntime/);
});

test('first crest recovery preserves airborne forward progress instead of relaunching forever', () => {
  const parent = createM72DefaultBranchingParent();
  const car = createM5Car(
    parent.guide,
    parent.heightProfile,
    parent.surfaceMap,
    45,
    M7_2_PLAYER_START_L,
  );
  const recovery = createM5RecoveryState(car);
  let maximumS = car.course.s;

  for (let tick = 0; tick < 720; tick += 1) {
    updateM5Car(
      parent.guide,
      parent.heightProfile,
      parent.surfaceMap,
      car,
      { steering: 0, throttle: true, brake: false },
      1 / 60,
    );
    updateM5Recovery(
      recovery,
      parent.guide,
      parent.heightProfile,
      parent.surfaceMap,
      car,
      1 / 60,
      M7_2_PLAYER_RECOVERY_PROFILE,
    );
    maximumS = Math.max(maximumS, car.course.s);
  }

  assert.equal(recovery.recoveries, 1);
  assert.ok(maximumS > 580, `expected forward continuation after crest, max s=${maximumS}`);
  assert.ok(car.course.s > 580, `expected no recovery loop near the first crest, s=${car.course.s}`);
});
