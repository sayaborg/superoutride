import { near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { guidePathToWorld, sampleGuidePath } from '../dist/core/guide-curve.js';
import {
  BRANCHING_DEFAULT_BRANCHING_FORK,
  BRANCHING_DEFAULT_BRANCHING_JUNCTION,
  BRANCHING_FORK_WIDEN_START_S,
  BRANCHING_HANDOFF_SEAM_S,
  BRANCHING_PLAYER_RECOVERY_PROFILE,
  BRANCHING_PLAYER_START_L,
  BRANCHING_RIVAL_RECOVERY_PROFILE,
  BRANCHING_RIVAL_START_L,
  BRANCHING_ROUTE_GATE_S,
  createDefaultBranchingParent,
} from '../dist/dev/courses/branching-highway.js';
import { createDeclarativeForkGrowthRuntime } from '../dist/dev/courses/fork-growth-plan.js';
import { createRecoveryState, updateRecovery } from '../dist/gameplay/recovery.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/groundmap/ground-map.js';
import { sampleSurfaceGeometryAtCoordinate } from '../dist/physics/vehicle-dynamics.js';
import { createFarBackground } from '../dist/visual/far-background.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';
import { createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';

test('default BRANCHING parent is the long four-lane highway rather than the stadium', () => {
  const parent = createDefaultBranchingParent();
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

test('first fork occupies one straight flat authored interval after the calibration section', () => {
  const parent = createDefaultBranchingParent();
  assert.equal(BRANCHING_DEFAULT_BRANCHING_JUNCTION.sample(BRANCHING_FORK_WIDEN_START_S - 1).phase, 'SINGLE');
  assert.equal(BRANCHING_DEFAULT_BRANCHING_JUNCTION.sample(BRANCHING_ROUTE_GATE_S).phase, 'SEPARATED');
  assert.equal(BRANCHING_DEFAULT_BRANCHING_JUNCTION.sample(BRANCHING_HANDOFF_SEAM_S).phase, 'SEPARATED');
  near(parent.heightProfile.samplePhysics(BRANCHING_FORK_WIDEN_START_S), 0, 1e-6);
  near(parent.heightProfile.samplePhysics(BRANCHING_HANDOFF_SEAM_S), 0, 1e-6);
  near(
    sampleGuidePath(parent.guide, BRANCHING_FORK_WIDEN_START_S).heading,
    sampleGuidePath(parent.guide, BRANCHING_HANDOFF_SEAM_S).heading,
    1e-9,
  );
});

test('runtime moves first physical gates and handoff seams with the selected parent authoring', () => {
  const parent = createDefaultBranchingParent();
  const live = createDeclarativeForkGrowthRuntime(
    parent.guide,
    {
      heightProfile: parent.heightProfile,
      surfaceMap: parent.surfaceMap,
      terrainProfile: parent.terrainProfile,
      groundProfile: parent.groundProfile,
      selectFarBackground: () => createFarBackground(),
      worldSprites: [],
    },
    createSpriteAssets(),
    BRANCHING_DEFAULT_BRANCHING_FORK,
  );

  for (const side of ['LEFT', 'RIGHT']) {
    const choiceId = side === 'LEFT' ? 'S1_LEFT' : 'S1_RIGHT';
    const gate = live.gates.gates.find((entry) => entry.kind === 'TRANSITION' && entry.choiceId === choiceId);
    const seam = live.handoffs.seams.find((entry) => entry.choiceId === choiceId);
    assert.ok(gate);
    assert.ok(seam);
    const localL = BRANCHING_DEFAULT_BRANCHING_JUNCTION.separatedChildCenterL(side);
    const expectedGate = guidePathToWorld(parent.guide, BRANCHING_ROUTE_GATE_S, localL);
    const expectedSeam = guidePathToWorld(parent.guide, BRANCHING_HANDOFF_SEAM_S, localL);
    near(gate.center.x, expectedGate.x, 1e-6);
    near(gate.center.z, expectedGate.z, 1e-6);
    near(seam.center.x, expectedSeam.x, 1e-6);
    near(seam.center.z, expectedSeam.z, 1e-6);
    assert.equal(seam.sourceSeamS, BRANCHING_HANDOFF_SEAM_S);
  }

  assert.equal(live.initialChart.guide, parent.guide);
  assert.equal(live.route.startStageId, 'STAGE_1');
});

test('default composition owns lane-center spawn and recovery without changing BRANCHING topology', () => {
  assert.equal(BRANCHING_PLAYER_START_L, -1.75);
  assert.equal(BRANCHING_RIVAL_START_L, 1.75);
  assert.equal(BRANCHING_PLAYER_RECOVERY_PROFILE.targetL, BRANCHING_PLAYER_START_L);
  assert.equal(BRANCHING_RIVAL_RECOVERY_PROFILE.targetL, BRANCHING_RIVAL_START_L);

  const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /createDefaultBranchingParent/);
  assert.match(main, /BRANCHING_DEFAULT_BRANCHING_FORK/);
  assert.match(main, /BRANCHING_PLAYER_START_L/);
  assert.match(main, /BRANCHING_PLAYER_RECOVERY_PROFILE/);
  assert.doesNotMatch(main, /createHighwayCalibrationRuntime|compileCircuitLiveRuntime/);
});

test('opening section remains bounded at continuous throttle without recovery', () => {
  const parent = createDefaultBranchingParent();
  const car = createTestCar(parent.guide, parent.heightProfile, parent.surfaceMap, 45, BRANCHING_PLAYER_START_L);
  const recovery = createRecoveryState(car);
  let maximumS = car.course.s;
  let maximumRoadRelativePresentationHeight = Number.NEGATIVE_INFINITY;

  for (let tick = 0; tick < 720; tick += 1) {
    updateTestVehicle(
      parent.guide,
      parent.heightProfile,
      parent.surfaceMap,
      car,
      { steering: 0, throttle: true, brake: false },
      1 / 60,
    );
    updateRecovery({ guide: parent.guide, height: parent.heightProfile, surfaces: parent.surfaceMap }, car, {
      state: recovery,
      dt: 1 / 60,
      profile: BRANCHING_PLAYER_RECOVERY_PROFILE,
    });
    maximumS = Math.max(maximumS, car.course.s);
    if (car.course.s >= 250 && car.course.s <= 700) {
      maximumRoadRelativePresentationHeight = Math.max(
        maximumRoadRelativePresentationHeight,
        car.presentationY - parent.heightProfile.samplePhysics(car.course.s),
      );
    }
  }

  let maximumGrade = 0;
  for (let s = 250; s <= 700; s += 0.25) {
    maximumGrade = Math.max(maximumGrade, Math.abs(parent.heightProfile.samplePhysicsDifferential(s).dYdS));
  }

  assert.equal(recovery.recoveries, 0);
  assert.ok(maximumGrade <= 0.03, `opening-section grade=${maximumGrade}`);
  assert.ok(
    maximumRoadRelativePresentationHeight < 0.15,
    `opening-section presentation height=${maximumRoadRelativePresentationHeight}`,
  );
  assert.ok(maximumS > 580, `expected forward continuation through opening section, max s=${maximumS}`);
  assert.ok(car.course.s > 580, `expected ordinary opening-section progress, s=${car.course.s}`);
});

test('opening section keeps the live rival inside its suspension model', () => {
  const parent = createDefaultBranchingParent();
  const rival = createTestCar(parent.guide, parent.heightProfile, parent.surfaceMap, 95, BRANCHING_RIVAL_START_L);
  const recovery = createRecoveryState(rival);

  for (let tick = 0; tick < 1_200 && rival.course.s <= 900; tick += 1) {
    updateTestVehicle(
      parent.guide,
      parent.heightProfile,
      parent.surfaceMap,
      rival,
      sampleRivalDrivingInput(parent.guide, rival, 0),
      1 / 60,
    );
    updateRecovery({ guide: parent.guide, height: parent.heightProfile, surfaces: parent.surfaceMap }, rival, {
      state: recovery,
      dt: 1 / 60,
      profile: BRANCHING_RIVAL_RECOVERY_PROFILE,
    });
  }

  assert.equal(recovery.recoveries, 0);
  assert.ok(rival.course.s > 900, `live rival stopped in opening section at s=${rival.course.s}`);
});

test('airborne recontact recovers before the vehicle can continue below authored terrain', () => {
  const parent = createDefaultBranchingParent();
  const car = createTestCar(parent.guide, parent.heightProfile, parent.surfaceMap, 45, BRANCHING_PLAYER_START_L);
  const recovery = createRecoveryState(car);
  let minimumSurfaceDistance = Number.POSITIVE_INFINITY;
  const reasons = [];

  for (let tick = 0; tick < 1_080; tick += 1) {
    updateTestVehicle(
      parent.guide,
      parent.heightProfile,
      parent.surfaceMap,
      car,
      { steering: 0, throttle: true, brake: false },
      1 / 60,
    );
    const surface = sampleSurfaceGeometryAtCoordinate(
      parent.guide,
      parent.heightProfile,
      parent.surfaceMap,
      car.course,
    );
    const surfaceDistance =
      (car.x - surface.point.x) * surface.normal.x +
      (car.y - surface.point.y) * surface.normal.y +
      (car.z - surface.point.z) * surface.normal.z;
    minimumSurfaceDistance = Math.min(minimumSurfaceDistance, surfaceDistance);
    const reason = updateRecovery(
      { guide: parent.guide, height: parent.heightProfile, surfaces: parent.surfaceMap },
      car,
      { state: recovery, dt: 1 / 60, profile: BRANCHING_PLAYER_RECOVERY_PROFILE },
    );
    if (reason !== null) reasons.push(reason);
  }

  assert.ok(reasons.includes('surface-penetration'));
  assert.ok(
    minimumSurfaceDistance > -0.1,
    `expected immediate recovery at the authored surface, distance=${minimumSurfaceDistance}`,
  );
});
