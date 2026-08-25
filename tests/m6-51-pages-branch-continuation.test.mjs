import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import { createM640RivalRouteChoicePlan } from '../dist/dev/m6-40-rival-live-route.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import {
  createFieldRouteProgressState,
  fieldRouteProgressBoundaryFromRouteUpdate,
  fieldRouteProgressTravelerView,
  resyncFieldRouteProgress,
  updateFieldRouteProgress,
} from '../dist/gameplay/field-route-progress.js';
import {
  createM5RecoveryState,
  updateM5Recovery,
} from '../dist/gameplay/recovery.js';
import {
  estimateUpcomingTargetSpeed,
  sampleRivalDrivingInput,
} from '../dist/gameplay/rival-driver.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import {
  advanceLiveRouteTraveler,
  createLiveRouteTravelerState,
  resyncLiveRouteTraveler,
  resolveLiveRouteTravelerRuntime,
  sampleLiveRouteChoicePlanTargetL,
} from '../dist/runtime/live-route-traveler.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

const DT = 1 / 60;

function createParentRuntime(guide) {
  const compiled = compileSurfaceRegions(
    guide.length,
    createM5DebugSurfaceRegionAuthoring(guide.length),
  );
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new VisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new SurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  return {
    heightProfile,
    surfaceMap,
    groundProfile: {
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 4.5,
      roadRight: 4.5,
      shoulderWidth: 1,
      junction: M6_13_JUNCTION,
      logical: compiled.groundMap,
    },
    terrainProfile: {
      screenHeight: 240,
      dMin: 2.5,
      dMax: 150,
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 4.5,
      roadRight: 4.5,
      height: heightProfile,
      visual: visualProfile,
      thinSpanScreenRows: 1,
    },
    selectFarBackground: () => createM3FarBackground(),
    worldSprites: [],
  };
}

test('open Guide rival lookahead never samples beyond the endpoint', () => {
  const guide = createM2StadiumGuide();
  const parent = createParentRuntime(guide);
  const car = createM5Car(guide, parent.heightProfile, parent.surfaceMap, guide.length - 0.25);

  assert.doesNotThrow(() => sampleRivalDrivingInput(guide, car, 0));
  assert.doesNotThrow(() => estimateUpcomingTargetSpeed(guide, car.course.s));
  assert.ok(Number.isFinite(estimateUpcomingTargetSpeed(guide, car.course.s)));
});

test('actual Pages rival physically takes RIGHT first fork, commits child runtime and keeps driving', () => {
  const parentGuide = createM2StadiumGuide();
  const parent = createParentRuntime(parentGuide);
  const live = createM627LiveRouteRuntime(parentGuide, parent, createM4SpriteAssets());
  const car = createM5Car(parentGuide, parent.heightProfile, parent.surfaceMap, 95);
  const recovery = createM5RecoveryState(car);
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
    const targetL = sampleLiveRouteChoicePlanTargetL(
      live,
      traveler,
      plan,
      car.course.s,
    );
    const input = sampleRivalDrivingInput(runtimeBefore.coordinateFrame, car, targetL);
    updateM5Car(
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      car,
      input,
      DT,
    );

    const recovered = updateM5Recovery(
      recovery,
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      car,
      DT,
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
    if (
      committedRightChild
      && traveler.handoffState.activePackageId === 'CONTENT_STAGE_2_R'
      && car.course.s >= 150
    ) {
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
