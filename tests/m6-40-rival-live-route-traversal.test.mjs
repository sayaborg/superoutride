import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import { createM640RivalRouteChoicePlan } from '../dist/dev/m6-40-rival-live-route.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import {
  advanceLiveRouteTraveler,
  createLiveRouteTravelerState,
  liveRouteTravelersShareRuntimePackage,
  resolveLiveRouteTravelerRuntime,
  sampleLiveRouteChoicePlanTargetL,
} from '../dist/runtime/live-route-traveler.js';

function createLiveFixture() {
  const guide = createM2StadiumGuide();
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const spriteAssets = createM4SpriteAssets();
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  const terrainProfile = {
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
  };
  return createM627LiveRouteRuntime(
    guide,
    {
      heightProfile,
      surfaceMap,
      terrainProfile,
      groundProfile,
      selectFarBackground: () => createM3FarBackground(),
      worldSprites: [],
    },
    spriteAssets,
  );
}

function transitionGate(live, choiceId) {
  const gate = live.gates.gates.find(
    (candidate) => candidate.kind === 'TRANSITION' && candidate.choiceId === choiceId,
  );
  assert.ok(gate, `missing transition gate ${choiceId}`);
  return gate;
}

function seam(live, choiceId) {
  const result = live.handoffs.seams.find((candidate) => candidate.choiceId === choiceId);
  assert.ok(result, `missing handoff seam ${choiceId}`);
  return result;
}

function cross(boundary, distance = 1) {
  return {
    previous: {
      x: boundary.center.x - boundary.tangent.x * distance,
      z: boundary.center.z - boundary.tangent.z * distance,
    },
    current: {
      x: boundary.center.x + boundary.tangent.x * distance,
      z: boundary.center.z + boundary.tangent.z * distance,
    },
  };
}

function crossChoice(live, traveler, choiceId) {
  const gateMotion = cross(transitionGate(live, choiceId));
  traveler.previousWorldPoint = { ...gateMotion.previous };
  const routeUpdate = advanceLiveRouteTraveler(live, traveler, gateMotion.current);
  assert.equal(routeUpdate.routeUpdate?.acceptedChoice?.id, choiceId);
  assert.equal(traveler.handoffState.pending?.choiceId, choiceId);

  const seamMotion = cross(seam(live, choiceId));
  traveler.previousWorldPoint = { ...seamMotion.previous };
  const handoffUpdate = advanceLiveRouteTraveler(live, traveler, seamMotion.current);
  assert.equal(handoffUpdate.committed, true);
}

test('M6.40 DEV rival plan is one validated RIGHT-B path ending at GOAL_RB', () => {
  const live = createLiveFixture();
  const plan = createM640RivalRouteChoicePlan(live);

  assert.deepEqual(plan.choiceIds, [
    'S1_RIGHT',
    'S2R_CONTINUE',
    'S3R_CONTINUE',
    'S4R_FORK_B',
  ]);
  assert.equal(plan.terminalStageId, 'GOAL_RB');
});

test('M6.40 route intent follows authored junction growth instead of steering directly to the final branch center', () => {
  const live = createLiveFixture();
  const traveler = createLiveRouteTravelerState(live, { x: 0, z: 0 });
  const plan = createM640RivalRouteChoicePlan(live);
  const runtime = resolveLiveRouteTravelerRuntime(live, traveler);

  const before = sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 360);
  const widening = sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 410);
  const separated = sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 550);

  assert.equal(runtime.packageId, 'CONTENT_STAGE_1');
  assert.equal(before, 0);
  assert.ok(widening > before);
  assert.ok(separated > widening);
  assert.ok(Math.abs(separated - 7.5) < 1e-9);
});

test('M6.40 independent traveler can commit RIGHT child runtime without mutating another traveler', () => {
  const live = createLiveFixture();
  const a = createLiveRouteTravelerState(live, { x: 0, z: 0 });
  const b = createLiveRouteTravelerState(live, { x: 0, z: 0 });
  const bBefore = JSON.stringify(b);

  crossChoice(live, a, 'S1_RIGHT');

  assert.equal(a.routeState.activeStageId, 'STAGE_2_R');
  assert.equal(a.handoffState.activeStageId, 'STAGE_2_R');
  assert.equal(resolveLiveRouteTravelerRuntime(live, a).packageId, 'CONTENT_STAGE_2_R');
  assert.equal(JSON.stringify(b), bBefore);
});

test('M6.40 RIGHT-B traveler preserves stage-local target semantics through continuation and second fork', () => {
  const live = createLiveFixture();
  const traveler = createLiveRouteTravelerState(live, { x: 0, z: 0 });
  const plan = createM640RivalRouteChoicePlan(live);

  crossChoice(live, traveler, 'S1_RIGHT');
  const stage2Runtime = resolveLiveRouteTravelerRuntime(live, traveler);
  assert.ok(Math.abs(stage2Runtime.coordinateFrame.lateralOrigin - 7.5) < 1e-9);
  assert.equal(sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 100), 0);

  crossChoice(live, traveler, 'S2R_CONTINUE');
  crossChoice(live, traveler, 'S3R_CONTINUE');
  const stage4Runtime = resolveLiveRouteTravelerRuntime(live, traveler);
  const preFork = sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 160);
  const forked = sampleLiveRouteChoicePlanTargetL(live, traveler, plan, 230);
  assert.equal(stage4Runtime.packageId, 'CONTENT_STAGE_4_R_FORK');
  assert.equal(preFork, 0);
  assert.ok(forked > 0);

  crossChoice(live, traveler, 'S4R_FORK_B');
  assert.equal(resolveLiveRouteTravelerRuntime(live, traveler).packageId, 'CONTENT_GOAL_RB');
});

test('M6.40 rival sprite compatibility is package identity, not raw world proximity or route intent', () => {
  const live = createLiveFixture();
  const a = createLiveRouteTravelerState(live, { x: 0, z: 0 });
  const b = createLiveRouteTravelerState(live, { x: 0, z: 0 });

  assert.equal(
    liveRouteTravelersShareRuntimePackage(
      resolveLiveRouteTravelerRuntime(live, a),
      resolveLiveRouteTravelerRuntime(live, b),
    ),
    true,
  );

  crossChoice(live, a, 'S1_RIGHT');
  assert.equal(
    liveRouteTravelersShareRuntimePackage(
      resolveLiveRouteTravelerRuntime(live, a),
      resolveLiveRouteTravelerRuntime(live, b),
    ),
    false,
  );

  crossChoice(live, b, 'S1_RIGHT');
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
  assert.doesNotMatch(main, /updateM5Car\(guide, heightProfile, surfaceMap, rival/);
  assert.doesNotMatch(renderer, /M6_40|M6\.40|M6_42|GOAL_RB|S4R_FORK_B|RIVAL_ROUTE/);
});