import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createSharedRouteChoiceState } from '../dist/gameplay/shared-route-choice-authority.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { advanceLiveRouteMultiActorTick } from '../dist/runtime/live-route-multi-actor-tick.js';
import {
  advanceLiveRouteTraveler,
  createLiveRouteTravelerState,
  resyncLiveRouteTraveler,
  resolveLiveRouteTravelerRuntime,
} from '../dist/runtime/live-route-traveler.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
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

function gate(live, choiceId) {
  const result = live.gates.gates.find(
    (candidate) => candidate.kind === 'TRANSITION' && candidate.choiceId === choiceId,
  );
  assert.ok(result, `missing transition gate ${choiceId}`);
  return result;
}

function seam(live, choiceId) {
  const result = live.handoffs.seams.find((candidate) => candidate.choiceId === choiceId);
  assert.ok(result, `missing handoff seam ${choiceId}`);
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

test('M6.42 INDEPENDENT multi-actor tick preserves simultaneous divergent M6.40 branch transactions', () => {
  const live = createLiveFixture();
  const left = gate(live, 'S1_LEFT');
  const right = gate(live, 'S1_RIGHT');
  const player = createLiveRouteTravelerState(live, pointAlong(left, -1));
  const rival = createLiveRouteTravelerState(live, pointAlong(right, -1));
  const shared = createSharedRouteChoiceState('INDEPENDENT');

  const tick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'PLAYER', state: player, currentWorldPoint: pointAlong(left, 1) },
    { actorId: 'RIVAL', state: rival, currentWorldPoint: pointAlong(right, 1) },
  ]);

  assert.equal(actorResult(tick, 'PLAYER').routeUpdate?.acceptedChoice?.id, 'S1_LEFT');
  assert.equal(actorResult(tick, 'RIVAL').routeUpdate?.acceptedChoice?.id, 'S1_RIGHT');
  assert.equal(player.handoffState.pending?.choiceId, 'S1_LEFT');
  assert.equal(rival.handoffState.pending?.choiceId, 'S1_RIGHT');
  assert.equal(shared.locks.length, 0);
});

test('M6.42 shared tick observes both actors before mutation and earliest physical crossing wins', () => {
  const live = createLiveFixture();
  const left = gate(live, 'S1_LEFT');
  const right = gate(live, 'S1_RIGHT');
  const player = createLiveRouteTravelerState(live, pointAlong(left, -3));
  const rival = createLiveRouteTravelerState(live, pointAlong(right, -1));
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');

  // PLAYER is intentionally first in the actor array but crosses at u=.75; RIVAL crosses at u=.25.
  const tick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'PLAYER', state: player, currentWorldPoint: pointAlong(left, 1) },
    { actorId: 'RIVAL', state: rival, currentWorldPoint: pointAlong(right, 3) },
  ]);

  assert.equal(tick.arbitration.createdLocks[0]?.choiceId, 'S1_RIGHT');
  assert.equal(tick.arbitration.createdLocks[0]?.lockedByActorId, 'RIVAL');
  assert.equal(actorResult(tick, 'PLAYER').sharedDecision?.accepted, false);
  assert.equal(actorResult(tick, 'RIVAL').sharedDecision?.accepted, true);
  assert.equal(player.routeState.activeStageId, 'STAGE_1');
  assert.equal(rival.routeState.activeStageId, 'STAGE_2_R');
});

test('M6.42 same winning physical gate can advance multiple actors in one arbitration', () => {
  const live = createLiveFixture();
  const right = gate(live, 'S1_RIGHT');
  const a = createLiveRouteTravelerState(live, pointAlong(right, -1));
  const b = createLiveRouteTravelerState(live, pointAlong(right, -2));
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');

  const tick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'A', state: a, currentWorldPoint: pointAlong(right, 3) },
    { actorId: 'B', state: b, currentWorldPoint: pointAlong(right, 2) },
  ]);

  assert.equal(actorResult(tick, 'A').routeUpdate?.acceptedChoice?.id, 'S1_RIGHT');
  assert.equal(actorResult(tick, 'B').routeUpdate?.acceptedChoice?.id, 'S1_RIGHT');
  assert.equal(a.routeState.activeStageId, 'STAGE_2_R');
  assert.equal(b.routeState.activeStageId, 'STAGE_2_R');
});

test('M6.42 batching has no hidden one-rival assumption at 0 and 16 rival extremes', () => {
  for (const rivalCount of [0, 16]) {
    const live = createLiveFixture();
    const right = gate(live, 'S1_RIGHT');
    const actorCount = 1 + rivalCount;
    const actors = Array.from({ length: actorCount }, (_, index) => {
      const actorId = index === 0 ? 'PLAYER' : `RIVAL_${index}`;
      return {
        actorId,
        state: createLiveRouteTravelerState(live, pointAlong(right, -1)),
        currentWorldPoint: pointAlong(right, 1),
      };
    });

    const tick = advanceLiveRouteMultiActorTick(
      live,
      createSharedRouteChoiceState('INDEPENDENT'),
      actors,
    );

    assert.equal(tick.actors.length, actorCount);
    for (const actor of actors) {
      assert.equal(actorResult(tick, actor.actorId).routeUpdate?.acceptedChoice?.id, 'S1_RIGHT');
      assert.equal(actor.state.routeState.activeStageId, 'STAGE_2_R');
      assert.equal(actor.state.handoffState.pending?.choiceId, 'S1_RIGHT');
    }
  }
});

test('M6.42 accepted route transition becomes PENDING while committed package remains the old stage', () => {
  const live = createLiveFixture();
  const right = gate(live, 'S1_RIGHT');
  const traveler = createLiveRouteTravelerState(live, pointAlong(right, -1));
  const shared = createSharedRouteChoiceState('INDEPENDENT');

  const tick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'RIVAL', state: traveler, currentWorldPoint: pointAlong(right, 1) },
  ]);

  assert.equal(actorResult(tick, 'RIVAL').committed, false);
  assert.equal(traveler.routeState.activeStageId, 'STAGE_2_R');
  assert.equal(traveler.handoffState.activeStageId, 'STAGE_1');
  assert.equal(traveler.handoffState.activePackageId, 'CONTENT_STAGE_1');
  assert.equal(traveler.handoffState.pending?.choiceId, 'S1_RIGHT');
});

test('M6.42 seam COMMIT remains per-actor after arbitration and changes only chart/package authority', () => {
  const live = createLiveFixture();
  const right = gate(live, 'S1_RIGHT');
  const traveler = createLiveRouteTravelerState(live, pointAlong(right, -1));
  const other = createLiveRouteTravelerState(live, pointAlong(right, -1));
  const shared = createSharedRouteChoiceState('INDEPENDENT');

  advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'RIVAL', state: traveler, currentWorldPoint: pointAlong(right, 1) },
    { actorId: 'OTHER', state: other, currentWorldPoint: pointAlong(right, -0.5) },
  ]);
  const siblingSnapshot = JSON.stringify(other);
  const handoff = seam(live, 'S1_RIGHT');
  resyncLiveRouteTraveler(live, traveler, pointAlong(handoff, -1));
  const worldAfter = pointAlong(handoff, 1);

  const tick = advanceLiveRouteMultiActorTick(live, shared, [
    { actorId: 'RIVAL', state: traveler, currentWorldPoint: worldAfter },
    { actorId: 'OTHER', state: other, currentWorldPoint: other.previousWorldPoint },
  ]);

  assert.equal(actorResult(tick, 'RIVAL').committed, true);
  assert.equal(traveler.handoffState.activeStageId, 'STAGE_2_R');
  assert.equal(resolveLiveRouteTravelerRuntime(live, traveler).packageId, 'CONTENT_STAGE_2_R');
  assert.deepEqual(traveler.previousWorldPoint, worldAfter);
  assert.equal(JSON.stringify(other), siblingSnapshot);
});

test('M6.42 recovery-suppressed actor cannot manufacture route progress while another actor still advances', () => {
  const live = createLiveFixture();
  const left = gate(live, 'S1_LEFT');
  const right = gate(live, 'S1_RIGHT');
  const recovered = createLiveRouteTravelerState(live, pointAlong(left, -1));
  const moving = createLiveRouteTravelerState(live, pointAlong(right, -1));
  const shared = createSharedRouteChoiceState('INDEPENDENT');

  const tick = advanceLiveRouteMultiActorTick(live, shared, [
    {
      actorId: 'RECOVERED',
      state: recovered,
      currentWorldPoint: pointAlong(left, 1),
      observeRouteBoundary: false,
    },
    { actorId: 'MOVING', state: moving, currentWorldPoint: pointAlong(right, 1) },
  ]);

  assert.equal(actorResult(tick, 'RECOVERED').routeUpdate, null);
  assert.equal(recovered.routeState.activeStageId, 'STAGE_1');
  assert.equal(actorResult(tick, 'MOVING').routeUpdate?.acceptedChoice?.id, 'S1_RIGHT');
});

test('M6.42 single-actor INDEPENDENT multi-actor path is state-equivalent to legacy advanceLiveRouteTraveler', () => {
  const live = createLiveFixture();
  const right = gate(live, 'S1_RIGHT');
  const start = pointAlong(right, -1);
  const legacy = createLiveRouteTravelerState(live, start);
  const batched = createLiveRouteTravelerState(live, start);

  const legacyUpdate = advanceLiveRouteTraveler(live, legacy, pointAlong(right, 1));
  const batch = advanceLiveRouteMultiActorTick(
    live,
    createSharedRouteChoiceState('INDEPENDENT'),
    [{ actorId: 'ONLY', state: batched, currentWorldPoint: pointAlong(right, 1) }],
  );

  const batchUpdate = actorResult(batch, 'ONLY');
  assert.equal(batchUpdate.routeUpdate?.acceptedChoice?.id, legacyUpdate.routeUpdate?.acceptedChoice?.id);
  assert.equal(batchUpdate.handoffEvent, legacyUpdate.handoffEvent);
  assert.deepEqual(batched, legacy);
});

test('M6.42 multi-actor tick orchestration owns no vehicle physics, camera or renderer dependency', () => {
  const source = fs.readFileSync(new URL('../src/runtime/live-route-multi-actor-tick.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:physics|render|camera|input)[^'"]*['"]/i);
  assert.match(source, /observe every actor/);
  assert.match(source, /arbitrateSharedRouteChoiceCandidates/);
});
