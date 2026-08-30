import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { locateWorldOnGuideCoordinateGlobal } from '../dist/core/guide-coordinate-frame.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { lockedBranchRecoveryApproach } from '../dist/gameplay/branch-violation.js';
import {
  createM5RecoveryState,
  recoverM5Vehicle,
  recoverM5VehicleToGuideCoordinate,
} from '../dist/gameplay/recovery.js';
import { createSharedRouteChoiceState } from '../dist/gameplay/shared-route-choice-authority.js';
import { createTestCar } from './helpers/vehicle-fixture.mjs';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { advanceLiveRouteMultiActorTick } from '../dist/runtime/live-route-multi-actor-tick.js';
import {
  advanceLiveRouteTraveler,
  createLiveRouteTravelerState,
  resyncLiveRouteTraveler,
  resolveLiveRouteTravelerRuntime,
  sampleLiveRouteChoiceTargetL,
} from '../dist/runtime/live-route-traveler.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

function createLiveFixture() {
  const guide = createM2StadiumGuide();
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new VisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new SurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  const live = createM627LiveRouteRuntime(
    guide,
    {
      heightProfile,
      surfaceMap,
      groundProfile,
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
    },
    createM4SpriteAssets(),
  );
  return { live, guide, heightProfile, surfaceMap };
}

function gate(live, choiceId) {
  const result = live.gates.gates.find(
    (candidate) => candidate.kind === 'TRANSITION' && candidate.choiceId === choiceId,
  );
  assert.ok(result, `missing transition gate ${choiceId}`);
  return result;
}

function pointAlong(boundary, signedMeters) {
  return {
    x: boundary.center.x + boundary.tangent.x * signedMeters,
    z: boundary.center.z + boundary.tangent.z * signedMeters,
  };
}

function actorResult(tick, actorId) {
  const result = tick.actors.find((candidate) => candidate.actorId === actorId);
  assert.ok(result, `missing actor result ${actorId}`);
  return result;
}

function handoffSeam(live, choiceId) {
  const result = live.handoffs.seams.find((candidate) => candidate.choiceId === choiceId);
  assert.ok(result, `missing handoff seam ${choiceId}`);
  return result;
}

function crossAndCommitChoice(live, traveler, choiceId) {
  const transition = gate(live, choiceId);
  resyncLiveRouteTraveler(live, traveler, pointAlong(transition, -1));
  const routeTick = advanceLiveRouteTraveler(live, traveler, pointAlong(transition, 1));
  assert.equal(routeTick.routeUpdate?.acceptedChoice?.id, choiceId);
  assert.equal(routeTick.committed, false);

  const seam = handoffSeam(live, choiceId);
  resyncLiveRouteTraveler(live, traveler, pointAlong(seam, -1));
  const handoffTick = advanceLiveRouteTraveler(live, traveler, pointAlong(seam, 1));
  assert.equal(handoffTick.committed, true);
  assert.equal(traveler.handoffState.pending, null);
}

test('M6.46 ordinary recovery backtracks to the real open start instead of wrapping to the path end', () => {
  const { guide, heightProfile, surfaceMap } = createLiveFixture();
  const car = createTestCar(guide, heightProfile, surfaceMap, 4);
  const recovery = createM5RecoveryState(car);
  recovery.lastSafeS = 4;

  recoverM5Vehicle(recovery, guide, heightProfile, surfaceMap, car, 'manual');

  assert.equal(car.course.s, 0);
  assert.equal(car.course.l, 0);
  assert.equal(recovery.lastSafeS, 0);
  assert.equal(recovery.lastReason, 'manual');

  const source = fs.readFileSync(new URL('../src/gameplay/recovery.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /wrapPositive|CyclicHeightProfile/);
  assert.match(source, /HeightProfileReader/);
});

test('M6.46 explicit supported Guide recovery target is reusable for wrong-course response', () => {
  const { guide, heightProfile, surfaceMap } = createLiveFixture();
  const car = createTestCar(guide, heightProfile, surfaceMap, 45);
  const recovery = createM5RecoveryState(car);

  recoverM5VehicleToGuideCoordinate(
    recovery,
    guide,
    heightProfile,
    surfaceMap,
    car,
    { s: 80, l: 1 },
    'wrong-course',
  );

  assert.ok(Math.abs(car.course.s - 80) < 0.2, `CG surface-normal offset moved s to ${car.course.s}`);
  assert.equal(car.course.l, 1);
  assert.equal(recovery.lastSafeS, 80);
  assert.equal(car.supported, true);
  assert.equal(recovery.lastReason, 'wrong-course');
  assert.equal(recovery.recoveries, 1);
});

test('M6.46 later same-tick sibling crossing becomes an explicit branch violation', () => {
  const { live } = createLiveFixture();
  const left = gate(live, 'S1_LEFT');
  const right = gate(live, 'S1_RIGHT');
  const laterLeft = createLiveRouteTravelerState(live, pointAlong(left, -3));
  const earlierRight = createLiveRouteTravelerState(live, pointAlong(right, -1));
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');

  const tick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'LATER_LEFT', state: laterLeft, currentWorldPoint: pointAlong(left, 1) },
    { actorId: 'EARLIER_RIGHT', state: earlierRight, currentWorldPoint: pointAlong(right, 3) },
  ]);

  const losing = actorResult(tick, 'LATER_LEFT');
  assert.equal(tick.arbitration.createdLocks[0]?.choiceId, 'S1_RIGHT');
  assert.equal(losing.sharedDecision?.reason, 'CONFLICTS_WITH_LOCK');
  assert.deepEqual(losing.branchViolation, {
    actorId: 'LATER_LEFT',
    stageId: 'STAGE_1',
    attemptedChoiceId: 'S1_LEFT',
    lockedChoiceId: 'S1_RIGHT',
    crossingFraction: 0.75,
  });
  assert.equal(laterLeft.routeState.activeStageId, 'STAGE_1');
});

test('M6.46 an already-locked sibling remains illegal for route progress but its physical crossing is still surfaced', () => {
  const { live } = createLiveFixture();
  const left = gate(live, 'S1_LEFT');
  const right = gate(live, 'S1_RIGHT');
  const winner = createLiveRouteTravelerState(live, pointAlong(right, -1));
  const loser = createLiveRouteTravelerState(live, pointAlong(left, -1));
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');

  advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'WINNER', state: winner, currentWorldPoint: pointAlong(right, 1) },
  ]);
  const tick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'LOSER', state: loser, currentWorldPoint: pointAlong(left, 1) },
  ]);

  const result = actorResult(tick, 'LOSER');
  assert.equal(result.observation?.boundary, null, 'legal observation stays narrowed to the locked gate');
  assert.equal(result.sharedDecision, null, 'forbidden gate is not submitted as a legal arbitration candidate');
  assert.equal(result.branchViolation?.attemptedChoiceId, 'S1_LEFT');
  assert.equal(result.branchViolation?.lockedChoiceId, 'S1_RIGHT');
  assert.equal(loser.routeState.activeStageId, 'STAGE_1');
  assert.equal(loser.handoffState.pending, null);
});

test('M6.46 locked-branch recovery approach derives from the legal physical gate and lands on supported stage content', () => {
  const { live } = createLiveFixture();
  const right = gate(live, 'S1_RIGHT');
  const approach = lockedBranchRecoveryApproach(live.gates, 'S1_RIGHT', 8);
  assert.equal(approach.choiceId, 'S1_RIGHT');
  assert.ok(Math.abs(approach.worldPoint.x - (right.center.x - right.tangent.x * 8)) < 1e-9);
  assert.ok(Math.abs(approach.worldPoint.z - (right.center.z - right.tangent.z * 8)) < 1e-9);

  const parent = live.registry.packages.find((candidate) => candidate.packageId === 'CONTENT_STAGE_1');
  assert.ok(parent);
  const target = locateWorldOnGuideCoordinateGlobal(parent.coordinateFrame, approach.worldPoint, false);
  assert.equal(parent.surfaceMap.sample(target.s, target.l).material.supported, true);
});

test('second-fork losing sibling recovers to the locked physical gate without manufacturing route progress', () => {
  const { live } = createLiveFixture();
  const winner = createLiveRouteTravelerState(live, pointAlong(gate(live, 'S1_RIGHT'), -1));
  const loser = createLiveRouteTravelerState(live, pointAlong(gate(live, 'S1_RIGHT'), -1));

  for (const choiceId of ['S1_RIGHT', 'S2R_CONTINUE', 'S3R_CONTINUE']) {
    crossAndCommitChoice(live, winner, choiceId);
    crossAndCommitChoice(live, loser, choiceId);
  }
  assert.equal(winner.routeState.activeStageId, 'STAGE_4_R_FORK');
  assert.equal(loser.routeState.activeStageId, 'STAGE_4_R_FORK');

  const losingGate = gate(live, 'S4R_FORK_A');
  const lockedGate = gate(live, 'S4R_FORK_B');
  resyncLiveRouteTraveler(live, winner, pointAlong(lockedGate, -1));
  resyncLiveRouteTraveler(live, loser, pointAlong(losingGate, -3));
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');
  const conflictTick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'LOSER', state: loser, currentWorldPoint: pointAlong(losingGate, 1) },
    { actorId: 'WINNER', state: winner, currentWorldPoint: pointAlong(lockedGate, 3) },
  ]);

  assert.equal(conflictTick.arbitration.createdLocks[0]?.stageId, 'STAGE_4_R_FORK');
  assert.equal(conflictTick.arbitration.createdLocks[0]?.choiceId, 'S4R_FORK_B');
  assert.equal(actorResult(conflictTick, 'LOSER').branchViolation?.attemptedChoiceId, 'S4R_FORK_A');
  assert.equal(actorResult(conflictTick, 'LOSER').branchViolation?.lockedChoiceId, 'S4R_FORK_B');
  assert.equal(loser.routeState.activeStageId, 'STAGE_4_R_FORK');
  assert.equal(loser.handoffState.pending, null);

  const runtime = resolveLiveRouteTravelerRuntime(live, loser);
  const car = createTestCar(runtime.coordinateFrame, runtime.heightProfile, runtime.surfaceMap, 0);
  const recovery = createM5RecoveryState(car);
  const approach = lockedBranchRecoveryApproach(live.gates, 'S4R_FORK_B', 8);
  const target = locateWorldOnGuideCoordinateGlobal(runtime.coordinateFrame, approach.worldPoint, false);
  recoverM5VehicleToGuideCoordinate(
    recovery,
    runtime.coordinateFrame,
    runtime.heightProfile,
    runtime.surfaceMap,
    car,
    { s: target.s, l: target.l },
    'wrong-course',
  );
  resyncLiveRouteTraveler(live, loser, { x: car.x, z: car.z });

  assert.equal(car.supported, true);
  assert.equal(recovery.lastReason, 'wrong-course');
  assert.equal(loser.routeState.activeStageId, 'STAGE_4_R_FORK');
  assert.equal(loser.handoffState.pending, null);

  const legalTick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'LOSER', state: loser, currentWorldPoint: pointAlong(lockedGate, 1) },
  ]);
  assert.equal(actorResult(legalTick, 'LOSER').branchViolation, null);
  assert.equal(actorResult(legalTick, 'LOSER').routeUpdate?.acceptedChoice?.id, 'S4R_FORK_B');
  assert.equal(loser.routeState.activeStageId, 'GOAL_RB');
  assert.equal(loser.handoffState.pending?.choiceId, 'S4R_FORK_B');

  const seam = handoffSeam(live, 'S4R_FORK_B');
  resyncLiveRouteTraveler(live, loser, pointAlong(seam, -1));
  const commitTick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'LOSER', state: loser, currentWorldPoint: pointAlong(seam, 1) },
  ]);
  assert.equal(actorResult(commitTick, 'LOSER').committed, true);
  assert.equal(loser.handoffState.activePackageId, 'CONTENT_GOAL_RB');
});

test('M6.46 explicit locked choice can replace AI plan intent without becoming route authority', () => {
  const { live } = createLiveFixture();
  const left = gate(live, 'S1_LEFT');
  const right = gate(live, 'S1_RIGHT');
  const traveler = createLiveRouteTravelerState(live, pointAlong(right, -20));
  const runtime = live.registry.packages.find((candidate) => candidate.packageId === 'CONTENT_STAGE_1');
  assert.ok(runtime);
  const s = locateWorldOnGuideCoordinateGlobal(runtime.coordinateFrame, right.center, false).s;

  const leftTarget = sampleLiveRouteChoiceTargetL(live, traveler, 'S1_LEFT', s);
  const rightTarget = sampleLiveRouteChoiceTargetL(live, traveler, 'S1_RIGHT', s);
  assert.ok(leftTarget < 0);
  assert.ok(rightTarget > 0);

  const mainSource = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(mainSource, /getSharedRouteChoiceLock\(/);
  assert.match(mainSource, /sampleLiveRouteChoiceTargetL\(/);
  assert.match(mainSource, /branchViolation\.lockedChoiceId/);
});

test('M6.46 branch violation geometry remains gameplay-only and does not depend on physics/render/camera', () => {
  const source = fs.readFileSync(new URL('../src/gameplay/branch-violation.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:physics|render|camera|input)[^'"]*['"]/i);
  assert.match(source, /gate\.center\.x - gate\.tangent\.x \* backtrackDistance/);
});
