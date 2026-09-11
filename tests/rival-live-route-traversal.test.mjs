import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';

import { createDeclarativeForkGrowthRuntime } from '../dist/dev/courses/fork-growth-plan.js';
import { createRivalRouteChoicePlan, RIVAL_ROUTE_CHOICE_IDS } from '../dist/dev/courses/rival-route-plan.js';

import {
  advanceLiveRouteTraveler,
  compileLiveRouteChoicePlan,
  createLiveRouteTravelerState,
  liveRouteTravelersShareRuntimePackage,
  resolveLiveRouteTravelerRuntime,
  resyncLiveRouteTraveler,
  sampleLiveRouteChoicePlanTargetL,
} from '../dist/runtime/live-route-traveler.js';
import { createFarBackground } from '../dist/visual/far-background.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

function createLiveFixture() {
  const guide = createStadiumGuide();
  const { heightProfile, visualProfile, surfaceMap, groundProfile } = parentShared(guide);

  return createDeclarativeForkGrowthRuntime(
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
      selectFarBackground: () => createFarBackground(),
      worldSprites: [],
    },
    createSpriteAssets(),
  );
}

function pointAlongGate(gate, signedMeters) {
  return {
    x: gate.center.x + gate.tangent.x * signedMeters,
    z: gate.center.z + gate.tangent.z * signedMeters,
  };
}

function transitionGate(live, choiceId) {
  const gate = live.gates.gates.find((candidate) => candidate.kind === 'TRANSITION' && candidate.choiceId === choiceId);
  assert.ok(gate, `missing gate for ${choiceId}`);
  return gate;
}

function handoffSeam(live, choiceId) {
  const seam = live.handoffs.seams.find((candidate) => candidate.choiceId === choiceId);
  assert.ok(seam, `missing seam for ${choiceId}`);
  return seam;
}

function crossChoice(live, traveler, choiceId) {
  const gate = transitionGate(live, choiceId);
  resyncLiveRouteTraveler(live, traveler, pointAlongGate(gate, -1));
  const gateUpdate = advanceLiveRouteTraveler(live, traveler, pointAlongGate(gate, 1));
  assert.equal(gateUpdate.routeUpdate?.acceptedChoice?.id, choiceId);
  assert.equal(gateUpdate.committed, false);
  assert.equal(traveler.handoffState.pending?.choiceId, choiceId);

  const seam = handoffSeam(live, choiceId);
  resyncLiveRouteTraveler(live, traveler, pointAlongGate(seam, -1));
  const seamUpdate = advanceLiveRouteTraveler(live, traveler, pointAlongGate(seam, 1));
  assert.equal(seamUpdate.handoffEvent, 'COMMITTED');
  assert.equal(seamUpdate.committed, true);
  assert.equal(traveler.handoffState.pending, null);
  return seamUpdate;
}

test('DEV rival plan is one validated RIGHT-B path ending at GOAL_RB', () => {
  const live = createLiveFixture();
  const plan = createRivalRouteChoicePlan(live);

  assert.deepEqual(
    plan.steps.map((step) => step.choiceId),
    [...RIVAL_ROUTE_CHOICE_IDS],
  );
  assert.deepEqual(
    plan.steps.map((step) => step.stageId),
    ['STAGE_1', 'STAGE_2_R', 'STAGE_3_R', 'STAGE_4_R_FORK'],
  );
  assert.equal(plan.terminalStageId, 'GOAL_RB');

  assert.throws(() => compileLiveRouteChoicePlan(live, ['S1_RIGHT', 'S2L_CONTINUE']), /does not leave stage STAGE_2_R/);
  assert.throws(() => compileLiveRouteChoicePlan(live, ['S1_RIGHT']), /must end at a terminal stage/);
});

test('route intent follows authored junction growth instead of steering directly to the final branch center', () => {
  const live = createLiveFixture();
  const plan = createRivalRouteChoicePlan(live);
  const gate = transitionGate(live, 'S1_RIGHT');
  const traveler = createLiveRouteTravelerState(live, pointAlongGate(gate, -1));

  assert.equal(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 380), 0);
  assert.ok(Math.abs(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 410) - 1.75) < 1e-9);
  assert.ok(Math.abs(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 450) - 4.3) < 1e-9);
  assert.ok(Math.abs(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 530) - 7.5) < 1e-9);

  // RouteDag advances at the physical gate, but until seam COMMIT the old parent chart is still
  // active and must remain the steering coordinate authority.
  resyncLiveRouteTraveler(live, traveler, pointAlongGate(gate, -1));
  advanceLiveRouteTraveler(live, traveler, pointAlongGate(gate, 1));
  assert.equal(traveler.routeState.activeStageId, 'STAGE_2_R');
  assert.equal(traveler.handoffState.activeStageId, 'STAGE_1');
  assert.ok(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 550) > 7.49);
});

test('independent traveler can commit RIGHT child runtime without mutating another traveler', () => {
  const live = createLiveFixture();
  const gate = transitionGate(live, 'S1_RIGHT');
  const start = pointAlongGate(gate, -1);
  const player = createLiveRouteTravelerState(live, start);
  const rival = createLiveRouteTravelerState(live, start);
  const playerSnapshot = JSON.stringify(player);

  crossChoice(live, rival, 'S1_RIGHT');

  assert.equal(rival.routeState.activeStageId, 'STAGE_2_R');
  assert.equal(rival.handoffState.activeStageId, 'STAGE_2_R');
  assert.equal(rival.handoffState.activePackageId, 'CONTENT_STAGE_2_R');
  assert.equal(rival.handoffState.commitCount, 1);
  assert.equal(JSON.stringify(player), playerSnapshot);
});

test('RIGHT-B traveler preserves stage-local target semantics through continuation and second fork', () => {
  const live = createLiveFixture();
  const plan = createRivalRouteChoicePlan(live);
  const firstGate = transitionGate(live, 'S1_RIGHT');
  const traveler = createLiveRouteTravelerState(live, pointAlongGate(firstGate, -1));

  crossChoice(live, traveler, 'S1_RIGHT');
  assert.equal(resolveLiveRouteTravelerRuntime(live, traveler).packageId, 'CONTENT_STAGE_2_R');
  assert.equal(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 100), 0);

  crossChoice(live, traveler, 'S2R_CONTINUE');
  assert.equal(resolveLiveRouteTravelerRuntime(live, traveler).packageId, 'CONTENT_STAGE_3_R');
  assert.equal(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 100), 0);

  crossChoice(live, traveler, 'S3R_CONTINUE');
  const forkRuntime = resolveLiveRouteTravelerRuntime(live, traveler);
  assert.equal(forkRuntime.packageId, 'CONTENT_STAGE_4_R_FORK');
  assert.notEqual(forkRuntime.coordinateFrame.lateralOrigin, 0);
  assert.equal(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 70), 0);
  assert.ok(Math.abs(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 95) - 1.75) < 1e-9);
  assert.ok(Math.abs(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 140) - 5.5) < 1e-9);
  assert.ok(Math.abs(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 170) - 7.5) < 1e-9);

  crossChoice(live, traveler, 'S4R_FORK_B');
  assert.equal(resolveLiveRouteTravelerRuntime(live, traveler).packageId, 'CONTENT_GOAL_RB');
  assert.equal(traveler.routeState.activeStageId, 'GOAL_RB');
});

test('rival sprite compatibility is package identity, not raw world proximity or route intent', () => {
  const live = createLiveFixture();
  const gate = transitionGate(live, 'S1_RIGHT');
  const a = createLiveRouteTravelerState(live, pointAlongGate(gate, -1));
  const b = createLiveRouteTravelerState(live, pointAlongGate(gate, -1));

  assert.equal(
    liveRouteTravelersShareRuntimePackage(
      resolveLiveRouteTravelerRuntime(live, a),
      resolveLiveRouteTravelerRuntime(live, b),
    ),
    true,
  );

  crossChoice(live, b, 'S1_RIGHT');
  assert.equal(
    liveRouteTravelersShareRuntimePackage(
      resolveLiveRouteTravelerRuntime(live, a),
      resolveLiveRouteTravelerRuntime(live, b),
    ),
    false,
  );

  crossChoice(live, a, 'S1_RIGHT');
  assert.equal(
    liveRouteTravelersShareRuntimePackage(
      resolveLiveRouteTravelerRuntime(live, a),
      resolveLiveRouteTravelerRuntime(live, b),
    ),
    true,
  );
});

test('generic traveler stays renderer/physics independent while browser consumes it through batching', () => {
  const source = fs.readFileSync(new URL('../src/runtime/live-route-traveler.ts', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const renderer = fs.readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /render\//);
  assert.doesNotMatch(source, /physics\//);
  assert.doesNotMatch(source, /M5Car|M5Bike|CourseSprite/);
  assert.match(source, /export function advanceLiveRouteTraveler/);

  for (const symbol of [
    'createRivalRouteChoicePlan',
    'createLiveRouteTravelerState',
    'sampleLiveRouteChoicePlanTargetL',
    'resolveLiveRouteTravelerRuntime',
    'liveRouteTravelersShareRuntimePackage',
    'advanceRouteDrivingTick',
  ]) {
    assert.match(main, new RegExp(symbol));
  }
  assert.doesNotMatch(main, /advanceLiveRouteTraveler\(/);
  assert.doesNotMatch(main, /sampleStadiumRightBranchTargetL\(rival\.course\.s\)/);
  assert.doesNotMatch(main, /updateTestVehicle\(guide, heightProfile, surfaceMap, rival/);
  assert.doesNotMatch(renderer, /M[0-9]+(?:[._][0-9]+)?|GOAL_RB|S4R_FORK_B|RIVAL_ROUTE/);
});
