import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import {
  M6_40_RIVAL_ROUTE_CHOICE_IDS,
  createM640RivalRouteChoicePlan,
} from '../dist/dev/m6-40-rival-live-route.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import {
  advanceLiveRouteTraveler,
  compileLiveRouteChoicePlan,
  createLiveRouteTravelerState,
  liveRouteTravelersShareRuntimePackage,
  resyncLiveRouteTraveler,
  resolveLiveRouteTravelerRuntime,
  sampleLiveRouteChoicePlanTargetL,
} from '../dist/runtime/live-route-traveler.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

function createLiveFixture() {
  const guide = createM2StadiumGuide();
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  return createM627LiveRouteRuntime(
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
}

function pointAlongGate(gate, signedMeters) {
  return {
    x: gate.center.x + gate.tangent.x * signedMeters,
    z: gate.center.z + gate.tangent.z * signedMeters,
  };
}

function transitionGate(live, choiceId) {
  const gate = live.gates.gates.find(
    (candidate) => candidate.kind === 'TRANSITION' && candidate.choiceId === choiceId,
  );
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

test('M6.40 DEV rival plan is one validated RIGHT-B path ending at GOAL_RB', () => {
  const live = createLiveFixture();
  const plan = createM640RivalRouteChoicePlan(live);

  assert.deepEqual(plan.steps.map((step) => step.choiceId), [...M6_40_RIVAL_ROUTE_CHOICE_IDS]);
  assert.deepEqual(plan.steps.map((step) => step.stageId), [
    'STAGE_1',
    'STAGE_2_R',
    'STAGE_3_R',
    'STAGE_4_R_FORK',
  ]);
  assert.equal(plan.terminalStageId, 'GOAL_RB');

  assert.throws(
    () => compileLiveRouteChoicePlan(live, ['S1_RIGHT', 'S2L_CONTINUE']),
    /does not leave stage STAGE_2_R/,
  );
  assert.throws(
    () => compileLiveRouteChoicePlan(live, ['S1_RIGHT']),
    /must end at a terminal stage/,
  );
});

test('M6.40 route intent follows authored junction growth instead of steering directly to the final branch center', () => {
  const live = createLiveFixture();
  const plan = createM640RivalRouteChoicePlan(live);
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

test('M6.40 independent traveler can commit RIGHT child runtime without mutating another traveler', () => {
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

test('M6.40 RIGHT-B traveler preserves stage-local target semantics through continuation and second fork', () => {
  const live = createLiveFixture();
  const plan = createM640RivalRouteChoicePlan(live);
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

test('M6.40 rival sprite compatibility is package identity, not raw world proximity or route intent', () => {
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

test('M6.40 generic traveler stays renderer/physics independent while browser consumes it through M6.42 batching', () => {
  const source = fs.readFileSync(new URL('../src/runtime/live-route-traveler.ts', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const renderer = fs.readFileSync(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /render\//);
  assert.doesNotMatch(source, /physics\//);
  assert.doesNotMatch(source, /M5Car|M5Bike|CourseSprite/);
  assert.match(source, /export function advanceLiveRouteTraveler/);

  for (const symbol of [
    'createM640RivalRouteChoicePlan',
    'createLiveRouteTravelerState',
    'sampleLiveRouteChoicePlanTargetL',
    'resolveLiveRouteTravelerRuntime',
    'liveRouteTravelersShareRuntimePackage',
    'advanceLiveRouteMultiActorTick',
  ]) {
    assert.match(main, new RegExp(symbol));
  }
  assert.doesNotMatch(main, /advanceLiveRouteTraveler\(/);
  assert.doesNotMatch(main, /sampleM613RightBranchTargetL\(rival\.course\.s\)/);
  assert.doesNotMatch(main, /updateTestVehicle\(guide, heightProfile, surfaceMap, rival/);
  assert.doesNotMatch(renderer, /M6_40|M6\.40|M6_42|GOAL_RB|S4R_FORK_B|RIVAL_ROUTE/);
});
