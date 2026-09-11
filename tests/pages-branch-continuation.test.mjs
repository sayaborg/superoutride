import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM638DeclarativeForkGrowthRuntime } from '../dist/dev/m6-38-declarative-fork-growth-plan.js';
import { createM640RivalRouteChoicePlan } from '../dist/dev/m6-40-rival-live-route.js';

import {
  createFieldRouteProgressState,
  fieldRouteProgressBoundaryFromRouteUpdate,
  fieldRouteProgressTravelerView,
  resyncFieldRouteProgress,
  updateFieldRouteProgress,
} from '../dist/gameplay/field-route-progress.js';
import { createRecoveryState, updateRecovery } from '../dist/gameplay/recovery.js';
import { estimateUpcomingTargetSpeed, sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';

import {
  advanceLiveRouteTraveler,
  createLiveRouteTravelerState,
  resolveLiveRouteTravelerRuntime,
  resyncLiveRouteTraveler,
  sampleLiveRouteChoicePlanTargetL,
} from '../dist/runtime/live-route-traveler.js';
import { createFarBackground } from '../dist/visual/far-background.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

const DT = 1 / 60;

function createParentRuntime(guide) {
  const { heightProfile, surfaceMap, groundProfile, terrainProfile } = parentShared(guide);

  return {
    heightProfile,
    surfaceMap,
    groundProfile,
    terrainProfile,
    selectFarBackground: () => createFarBackground(),
    worldSprites: [],
  };
}

test('open Guide rival lookahead never samples beyond the endpoint', () => {
  const guide = createM2StadiumGuide();
  const parent = createParentRuntime(guide);
  const car = createTestCar(guide, parent.heightProfile, parent.surfaceMap, guide.length - 0.25);

  assert.doesNotThrow(() => sampleRivalDrivingInput(guide, car, 0));
  assert.doesNotThrow(() => estimateUpcomingTargetSpeed(guide, car.course.s));
  assert.ok(Number.isFinite(estimateUpcomingTargetSpeed(guide, car.course.s)));
});

test('actual Pages rival physically takes RIGHT first fork, commits child runtime and keeps driving', () => {
  const parentGuide = createM2StadiumGuide();
  const parent = createParentRuntime(parentGuide);
  const live = createM638DeclarativeForkGrowthRuntime(parentGuide, parent, createSpriteAssets());
  const car = createTestCar(parentGuide, parent.heightProfile, parent.surfaceMap, 95);
  const recovery = createRecoveryState(car);
  const traveler = createLiveRouteTravelerState(live, { x: car.x, z: car.z });
  const fieldProgress = createFieldRouteProgressState(
    live.progress,
    fieldRouteProgressTravelerView(traveler.routeState, traveler.handoffState),
  );
  const plan = createM640RivalRouteChoicePlan(live);
  let firstChoiceL = null;
  let committedRightChild = false;
  let continuedOnChild = false;
  let maxCommitProgressDelta = 0;

  for (let tick = 0; tick < 2200 && !continuedOnChild; tick += 1) {
    const runtimeBefore = resolveLiveRouteTravelerRuntime(live, traveler);
    const targetL = sampleLiveRouteChoicePlanTargetL(live, traveler, plan, car.course.s);
    const input = sampleRivalDrivingInput(runtimeBefore.coordinateFrame, car, targetL);
    updateTestVehicle(
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      car,
      input,
      DT,
    );

    const recovered = updateRecovery(
      { guide: runtimeBefore.coordinateFrame, height: runtimeBefore.heightProfile, surfaces: runtimeBefore.surfaceMap },
      car,
      { state: recovery, dt: DT },
    );
    const world = { x: car.x, z: car.z };
    if (recovered !== null) {
      resyncLiveRouteTraveler(live, traveler, world);
      resyncFieldRouteProgress(
        fieldProgress,
        live.progress,
        fieldRouteProgressTravelerView(traveler.routeState, traveler.handoffState),
      );
      continue;
    }

    const progressBeforeRouteTick = fieldProgress.sProgress;
    const update = advanceLiveRouteTraveler(live, traveler, world);
    updateFieldRouteProgress(
      fieldProgress,
      live.progress,
      fieldRouteProgressTravelerView(traveler.routeState, traveler.handoffState),
      fieldRouteProgressBoundaryFromRouteUpdate(update.routeUpdate),
    );
    if (update.routeUpdate?.acceptedChoice?.id === 'S1_RIGHT') {
      firstChoiceL = car.course.l;
    }
    if (update.committed) {
      maxCommitProgressDelta = Math.max(
        maxCommitProgressDelta,
        Math.abs(fieldProgress.sProgress - progressBeforeRouteTick),
      );
      car.course = { ...traveler.handoffState.coordinate };
      if (traveler.handoffState.activePackageId === 'CONTENT_STAGE_2_R') {
        committedRightChild = true;
      }
    }
    if (committedRightChild && traveler.handoffState.activePackageId === 'CONTENT_STAGE_2_R' && car.course.s >= 150) {
      continuedOnChild = true;
    }
  }

  assert.equal(committedRightChild, true);
  assert.equal(continuedOnChild, true);
  assert.equal(traveler.handoffState.activePackageId, 'CONTENT_STAGE_2_R');
  assert.equal(traveler.routeState.activeStageId, 'STAGE_2_R');
  assert.ok(fieldProgress.validatedProgressFloor > 0);
  assert.ok(fieldProgress.sProgress > fieldProgress.validatedProgressFloor);
  assert.ok(maxCommitProgressDelta < 2, `chart COMMIT must not jump field progress: ${maxCommitProgressDelta}`);
  assert.notEqual(firstChoiceL, null);
  const rightCenterL = M6_13_JUNCTION.separatedChildCenterL('RIGHT');
  assert.ok(
    Math.abs(firstChoiceL - rightCenterL) <= M6_13_JUNCTION.authoring.childRoadWidth * 0.5,
    `first physical branch choice must occur inside the RIGHT child road: l=${firstChoiceL}`,
  );
});
