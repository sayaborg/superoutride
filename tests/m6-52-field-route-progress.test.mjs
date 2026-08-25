import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { locateWorldOnGuideCoordinateGlobal } from '../dist/core/guide-coordinate-frame.js';
import { sampleGuideCurve } from '../dist/core/guide-curve.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import {
  compileFieldRouteProgressRules,
  createFieldRouteProgressState,
  fieldRouteGeometricProgress,
  fieldRouteProgressBoundaryFromRouteUpdate,
  fieldRouteProgressTravelerView,
  resyncFieldRouteProgress,
  updateFieldRouteProgress,
} from '../dist/gameplay/field-route-progress.js';
import { createSharedRouteChoiceState } from '../dist/gameplay/shared-route-choice-authority.js';
import { rankRaceProgress } from '../dist/gameplay/race-session.js';
import { createValidatedRunFinishFromRoute } from '../dist/gameplay/run-objective.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { advanceLiveRouteMultiActorTick } from '../dist/runtime/live-route-multi-actor-tick.js';
import {
  createLiveRouteTravelerState,
  resyncLiveRouteTraveler,
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

function stageSources(live) {
  return live.content.bindings.map((binding) => {
    const runtime = live.registry.packages.find((candidate) => candidate.packageId === binding.packageId);
    assert.ok(runtime);
    return { stageId: binding.stageId, coordinateFrame: runtime.coordinateFrame };
  });
}

function stageFrame(live, stageId) {
  return stageSources(live).find((candidate) => candidate.stageId === stageId).coordinateFrame;
}

function gate(live, choiceId) {
  const result = live.gates.gates.find(
    (candidate) => candidate.kind === 'TRANSITION' && candidate.choiceId === choiceId,
  );
  assert.ok(result, `missing transition gate ${choiceId}`);
  return result;
}

function finishGate(live, stageId) {
  const result = live.gates.gates.find(
    (candidate) => candidate.kind === 'FINISH' && candidate.stageId === stageId,
  );
  assert.ok(result, `missing FINISH gate ${stageId}`);
  return result;
}

function seam(live, choiceId) {
  const result = live.handoffs.seams.find((candidate) => candidate.choiceId === choiceId);
  assert.ok(result, `missing handoff seam ${choiceId}`);
  return result;
}

function pointAlong(boundary, meters) {
  return {
    x: boundary.center.x + boundary.tangent.x * meters,
    z: boundary.center.z + boundary.tangent.z * meters,
  };
}

function createActor(live, actorId, world) {
  const traveler = createLiveRouteTravelerState(live, world);
  return {
    actorId,
    traveler,
    progress: createFieldRouteProgressState(
      live.progress,
      fieldRouteProgressTravelerView(traveler.routeState, traveler.handoffState),
    ),
  };
}

function resyncActor(live, actor, world, stagedCoordinate = null) {
  resyncLiveRouteTraveler(live, actor.traveler, world);
  if (stagedCoordinate !== null) {
    const chart = live.charts.find(
      (candidate) => candidate.id === actor.traveler.handoffState.activeChartId,
    );
    assert.ok(chart);
    const sample = sampleGuideCurve(chart.guide, stagedCoordinate.s);
    actor.traveler.handoffState.coordinate = {
      s: stagedCoordinate.s,
      l: stagedCoordinate.l,
      segmentIndex: sample.segmentIndex,
      distanceSquared: 0,
    };
  }
  resyncFieldRouteProgress(
    actor.progress,
    live.progress,
    fieldRouteProgressTravelerView(actor.traveler.routeState, actor.traveler.handoffState),
  );
}

function applyActorProgress(live, actor, result) {
  updateFieldRouteProgress(
    actor.progress,
    live.progress,
    fieldRouteProgressTravelerView(actor.traveler.routeState, actor.traveler.handoffState),
    fieldRouteProgressBoundaryFromRouteUpdate(result.routeUpdate),
  );
}

function actorResult(tick, actorId) {
  const result = tick.actors.find((candidate) => candidate.actorId === actorId);
  assert.ok(result, `missing actor tick result ${actorId}`);
  return result;
}

function tickActors(live, shared, samples) {
  const tick = advanceLiveRouteMultiActorTick(
    live,
    shared,
    samples.map(({ actor, world }) => ({
      actorId: actor.actorId,
      state: actor.traveler,
      currentWorldPoint: world,
    })),
  );
  for (const { actor } of samples) applyActorProgress(live, actor, actorResult(tick, actor.actorId));
  return tick;
}

function crossChoice(live, shared, actor, choiceId) {
  const transition = gate(live, choiceId);
  const choice = live.progress.choices.find((candidate) => candidate.choiceId === choiceId);
  const stage = live.progress.stages.find((candidate) => candidate.stageId === choice.fromStageId);
  assert.ok(choice);
  assert.ok(stage);
  resyncActor(live, actor, pointAlong(transition, -1), {
    s: choice.gateProgress - stage.progressOffset - 1,
    l: 0,
  });
  const tick = tickActors(live, shared, [{ actor, world: pointAlong(transition, 1) }]);
  assert.equal(actorResult(tick, actor.actorId).routeUpdate?.acceptedChoice?.id, choiceId);
}

function commitChoice(live, shared, actor, choiceId) {
  const handoff = seam(live, choiceId);
  resyncActor(live, actor, pointAlong(handoff, -1), {
    s: handoff.sourceSeamS - 1,
    l: handoff.sourceLocalL,
  });
  const before = actor.progress.sProgress;
  const tick = tickActors(live, shared, [{ actor, world: pointAlong(handoff, 1) }]);
  assert.equal(actorResult(tick, actor.actorId).committed, true);
  assert.ok(actor.progress.sProgress >= before - 1e-6, `${choiceId}: ${before} -> ${actor.progress.sProgress}`);
  assert.ok(
    actor.progress.sProgress <= before + 3,
    `${choiceId}: COMMIT must not add a chart-rebase jump (${before} -> ${actor.progress.sProgress})`,
  );
}

function crossAndCommitChoice(live, shared, actor, choiceId) {
  crossChoice(live, shared, actor, choiceId);
  commitChoice(live, shared, actor, choiceId);
}

test('M6.52 compiler derives one finite progress ruler with invariant handoff rebases', () => {
  const live = createLiveFixture();

  for (const choice of live.route.choices) {
    const rule = live.progress.choices.find((candidate) => candidate.choiceId === choice.id);
    const handoff = seam(live, choice.id);
    assert.ok(rule);
    const sourceProgress = fieldRouteGeometricProgress(
      live.progress,
      choice.fromStageId,
      locateWorldOnGuideCoordinateGlobal(stageFrame(live, choice.fromStageId), handoff.center, false).s,
    );
    const targetProgress = fieldRouteGeometricProgress(
      live.progress,
      choice.toStageId,
      locateWorldOnGuideCoordinateGlobal(stageFrame(live, choice.toStageId), handoff.center, false).s,
    );
    assert.ok(Math.abs(sourceProgress - targetProgress) < 1e-6, choice.id);
    assert.ok(Math.abs(sourceProgress - rule.handoffProgress) < 1e-6, choice.id);
  }

  for (const stage of live.route.stages.filter((candidate) => candidate.outgoingChoiceIds.length > 1)) {
    const boundaries = stage.outgoingChoiceIds.map((choiceId) =>
      live.progress.choices.find((candidate) => candidate.choiceId === choiceId).gateProgress);
    assert.ok(boundaries.every((value) => Math.abs(value - boundaries[0]) < 1e-6), stage.id);
  }
});

test('M6.52 compiler rejects sibling gates that would create two ranking authorities at one fork', () => {
  const live = createLiveFixture();
  const movedChoiceId = 'S1_LEFT';
  const moved = gate(live, movedChoiceId);
  const gates = {
    gates: live.gates.gates.map((candidate) => candidate === moved
      ? {
          ...candidate,
          center: pointAlong(candidate, 5),
        }
      : candidate),
  };

  assert.throws(
    () => compileFieldRouteProgressRules(live.route, gates, live.handoffs, stageSources(live)),
    /sibling route gates must share one field progress boundary: STAGE_1/,
  );
});

test('M6.52 first and second fork rank the shared physical route across PENDING, COMMIT, and recovery', () => {
  const live = createLiveFixture();
  const firstWinnerGate = gate(live, 'S1_RIGHT');
  const firstLosingGate = gate(live, 'S1_LEFT');
  const winner = createActor(live, 'WINNER', pointAlong(firstWinnerGate, -1));
  const loser = createActor(live, 'LOSER', pointAlong(firstLosingGate, -3));
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');

  const firstConflict = tickActors(live, shared, [
    { actor: loser, world: pointAlong(firstLosingGate, 1) },
    { actor: winner, world: pointAlong(firstWinnerGate, 3) },
  ]);
  assert.equal(firstConflict.arbitration.createdLocks[0]?.choiceId, 'S1_RIGHT');
  assert.equal(actorResult(firstConflict, 'LOSER').branchViolation?.lockedChoiceId, 'S1_RIGHT');
  assert.equal(winner.progress.lastEvent, 'TRANSITION');
  assert.equal(loser.progress.lastEvent, 'NONE');
  assert.equal(loser.traveler.routeState.activeStageId, 'STAGE_1');

  const loserProgressBeforeRecovery = loser.progress.sProgress;
  const firstChoice = live.progress.choices.find((candidate) => candidate.choiceId === 'S1_RIGHT');
  const firstStage = live.progress.stages.find((candidate) => candidate.stageId === 'STAGE_1');
  resyncActor(live, loser, pointAlong(firstWinnerGate, -8), {
    s: firstChoice.gateProgress - firstStage.progressOffset - 8,
    l: 0,
  });
  assert.equal(loser.progress.sProgress, loserProgressBeforeRecovery);
  assert.equal(loser.progress.validatedProgressFloor, live.progress.startProgress);

  crossChoice(live, shared, loser, 'S1_RIGHT');
  assert.deepEqual(winner.traveler.routeState.selectedChoiceIds, ['S1_RIGHT']);
  assert.deepEqual(loser.traveler.routeState.selectedChoiceIds, ['S1_RIGHT']);
  commitChoice(live, shared, winner, 'S1_RIGHT');
  commitChoice(live, shared, loser, 'S1_RIGHT');

  for (const choiceId of ['S2R_CONTINUE', 'S3R_CONTINUE']) {
    crossAndCommitChoice(live, shared, winner, choiceId);
    crossAndCommitChoice(live, shared, loser, choiceId);
  }
  assert.equal(winner.traveler.routeState.activeStageId, 'STAGE_4_R_FORK');
  assert.equal(loser.traveler.routeState.activeStageId, 'STAGE_4_R_FORK');

  const secondWinnerGate = gate(live, 'S4R_FORK_B');
  const secondLosingGate = gate(live, 'S4R_FORK_A');
  const secondChoice = live.progress.choices.find((candidate) => candidate.choiceId === 'S4R_FORK_B');
  const secondStage = live.progress.stages.find((candidate) => candidate.stageId === 'STAGE_4_R_FORK');
  resyncActor(live, winner, pointAlong(secondWinnerGate, -1), {
    s: secondChoice.gateProgress - secondStage.progressOffset - 1,
    l: 0,
  });
  resyncActor(live, loser, pointAlong(secondLosingGate, -3), {
    s: secondChoice.gateProgress - secondStage.progressOffset - 3,
    l: 0,
  });
  const secondConflict = tickActors(live, shared, [
    { actor: loser, world: pointAlong(secondLosingGate, 1) },
    { actor: winner, world: pointAlong(secondWinnerGate, 3) },
  ]);
  assert.equal(secondConflict.arbitration.createdLocks[0]?.choiceId, 'S4R_FORK_B');
  assert.equal(actorResult(secondConflict, 'LOSER').branchViolation?.lockedChoiceId, 'S4R_FORK_B');
  const secondFloor = winner.progress.validatedProgressFloor;
  assert.ok(secondFloor > loser.progress.validatedProgressFloor);

  const loserBeforeSecondRecovery = loser.progress.sProgress;
  resyncActor(live, loser, pointAlong(secondWinnerGate, -8), {
    s: secondChoice.gateProgress - secondStage.progressOffset - 8,
    l: 0,
  });
  assert.equal(loser.progress.sProgress, loserBeforeSecondRecovery);
  crossChoice(live, shared, loser, 'S4R_FORK_B');
  commitChoice(live, shared, winner, 'S4R_FORK_B');
  commitChoice(live, shared, loser, 'S4R_FORK_B');

  assert.deepEqual(
    winner.traveler.routeState.selectedChoiceIds,
    loser.traveler.routeState.selectedChoiceIds,
  );
  const standings = rankRaceProgress([
    {
      competitorId: winner.actorId,
      sProgress: winner.progress.sProgress,
      validatedProgressFloor: winner.progress.validatedProgressFloor,
    },
    {
      competitorId: loser.actorId,
      sProgress: loser.progress.sProgress,
      validatedProgressFloor: loser.progress.validatedProgressFloor,
    },
  ]);
  assert.deepEqual(standings.map((entry) => entry.competitorId), ['WINNER', 'LOSER']);

  const finish = finishGate(live, 'GOAL_RB');
  const finishRule = live.progress.stages.find((candidate) => candidate.stageId === 'GOAL_RB');
  resyncActor(live, winner, pointAlong(finish, -1), {
    s: finishRule.boundaryProgress - finishRule.progressOffset - 1,
    l: 0,
  });
  const finishTick = tickActors(live, shared, [{ actor: winner, world: pointAlong(finish, 1) }]);
  assert.equal(actorResult(finishTick, 'WINNER').routeUpdate?.justFinished, true);
  assert.equal(winner.progress.status, 'FINISHED');
  assert.equal(winner.progress.sProgress, winner.progress.validatedProgressFloor);
  assert.deepEqual(
    createValidatedRunFinishFromRoute(
      winner.traveler.routeState,
      actorResult(finishTick, 'WINNER').routeUpdate,
      winner.progress,
    ),
    {
      source: 'ROUTE_DAG',
      id: 'GOAL_RB',
      validatedProgress: winner.progress.validatedProgressFloor,
    },
  );

  const postFinish = tickActors(live, shared, [{ actor: winner, world: pointAlong(finish, 2) }]);
  assert.equal(actorResult(postFinish, 'WINNER').routeUpdate?.justFinished, false);
  assert.equal(winner.progress.status, 'FINISHED');
});

test('M6.52 browser standings consume field-route progress and lower engine layers stay unchanged', () => {
  const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const progress = fs.readFileSync(new URL('../src/gameplay/field-route-progress.ts', import.meta.url), 'utf8');
  assert.match(main, /sProgress: playerFieldProgress\.sProgress/);
  assert.match(main, /sProgress: rival\.fieldProgress\.sProgress/);
  assert.match(main, /resyncFieldRouteProgress/);
  assert.match(main, /createValidatedRunFinishFromRoute\(routeState, routeUpdate, playerFieldProgress\)/);
  assert.doesNotMatch(progress, /render\//);
  assert.doesNotMatch(progress, /physics\//);
  assert.doesNotMatch(progress, /camera\//);
  assert.doesNotMatch(progress, /src\/dev|\.\.\/dev\//);
  assert.doesNotMatch(progress, /routeKind|CIRCUIT|LINEAR|BRANCHING/);
});
