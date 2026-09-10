import { guidePathToWorld } from '../dist/core/guide-curve.js';
import { locateWorldOnGuideCoordinateGlobal } from '../dist/core/guide-coordinate-frame.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { parentShared } from './helpers/stage-parent-fixture.mjs';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM638DeclarativeForkGrowthRuntime } from '../dist/dev/m6-38-declarative-fork-growth-plan.js';
import { createM93TsukubaCourse2000Runtime } from '../dist/dev/m9-3-tsukuba-circuit.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';
import { createArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY } from '../dist/vehicle/vehicle-catalog.js';
import { createRecoveryState, RECOVERY_PROFILE } from '../dist/gameplay/recovery.js';
import {
  createFieldRouteProgressState,
  fieldRouteProgressTravelerView,
} from '../dist/gameplay/field-route-progress.js';
import { createSharedRouteChoiceState } from '../dist/gameplay/shared-route-choice-authority.js';
import { createCircuitRaceProgressState, resyncCircuitRaceProgress } from '../dist/gameplay/circuit-race-progress.js';
import { createRaceSessionState } from '../dist/gameplay/race-session.js';
import { createLiveRouteTravelerState } from '../dist/runtime/live-route-traveler.js';
import { advanceRouteDrivingTick } from '../dist/runtime/route-driving-tick.js';
import { advanceCircuitDrivingActor } from '../dist/runtime/circuit-driving-tick.js';

const neutral = { steering: 0, throttle: 0, brake: 0 };

test('one route lifecycle treats arbitrary actor IDs equally and preserves validated progress through recovery', () => {
  const guide = createM2StadiumGuide(),
    parent = parentShared(guide);
  const live = createM638DeclarativeForkGrowthRuntime(guide, parent, createSpriteAssets());
  const world = { guide, height: parent.heightProfile, surfaces: parent.surfaceMap };
  const gate =
    live.gates.gates.find((g) => g.kind === 'TRANSITION' && g.fromStageId === live.route.startStageId) ??
    live.gates.gates.find((g) => g.kind === 'TRANSITION');
  const point = (distance) => ({
    x: gate.center.x + gate.tangent.x * distance,
    z: gate.center.z + gate.tangent.z * distance,
  });
  const start = locateWorldOnGuideCoordinateGlobal(guide, point(0.1));
  const actors = ['__proto__', 'RIVAL', 'PLAYER'].map((actorId) => {
    const vehicle = createArcadeVehicle(DEFAULT_VEHICLE_CATALOG_ENTRY.profile, world, {
      s: start.s,
      l: start.l,
      initialSpeed: 0,
    });
    const traveler = createLiveRouteTravelerState(live, { x: vehicle.x, z: vehicle.z });
    const fieldProgress = createFieldRouteProgressState(
      live.progress,
      fieldRouteProgressTravelerView(traveler.routeState, traveler.handoffState),
    );
    traveler.previousWorldPoint = point(-1);
    return {
      actorId,
      vehicle,
      traveler,
      fieldProgress,
      recovery: createRecoveryState(vehicle),
      recoveryProfile: RECOVERY_PROFILE,
      sampleInput: () => neutral,
    };
  });
  const shared = createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS');
  advanceRouteDrivingTick(live, shared, actors, { dt: 1 / 60, branchViolationPolicy: 'RECOVER_TO_LOCKED_BRANCH' });
  const floors = actors.map((actor) => actor.fieldProgress.validatedProgressFloor);
  for (const actor of actors) {
    assert.equal(actor.fieldProgress.acceptedTransitionCount, 1);
    assert.ok(actor.fieldProgress.validatedProgressFloor > 0);
    actor.vehicle.pitch = Math.PI;
  }
  const results = advanceRouteDrivingTick(live, createSharedRouteChoiceState('FIRST_PHYSICAL_CROSSING_LOCKS'), actors, {
    dt: 1 / 60,
    branchViolationPolicy: 'RECOVER_TO_LOCKED_BRANCH',
  });
  assert.equal(Object.getPrototypeOf(results), null);
  assert.ok(Object.isFrozen(results));
  for (const [index, actor] of actors.entries()) {
    const result = results[actor.actorId];
    assert.equal(result.route.actorId, actor.actorId);
    assert.ok(result.recovered);
    assert.equal(result.route.observation, null);
    assert.equal(actor.recovery.recoveries, 1);
    assert.equal(actor.fieldProgress.validatedProgressFloor, floors[index]);
    assert.equal(actor.fieldProgress.acceptedTransitionCount, 1);
  }
  const before = actors.map((actor) => [actor.vehicle.x, actor.vehicle.z, actor.recovery.recoveries]);
  assert.throws(
    () =>
      advanceRouteDrivingTick(live, createSharedRouteChoiceState('INDEPENDENT'), [actors[0], actors[0]], {
        dt: 1 / 60,
        branchViolationPolicy: null,
      }),
    /duplicate/,
  );
  assert.deepEqual(
    actors.map((actor) => [actor.vehicle.x, actor.vehicle.z, actor.recovery.recoveries]),
    before,
  );
});

test('common circuit actor recovery resyncs observations without awarding FINISH or restarting its session', () => {
  const { window: w, raceRules: rules } = createM93TsukubaCourse2000Runtime();
  const world = { guide: w.guide, height: w.height, surfaces: w.surface };
  const vehicle = createArcadeVehicle(DEFAULT_VEHICLE_CATALOG_ENTRY.profile, world, {
    s: rules.lapLength + 100,
    initialSpeed: 0,
  });
  const first = guidePathToWorld(w.guide, 100, 0);
  const raceProgress = createCircuitRaceProgressState(rules, { x: first.x, z: first.z, sWindow: 100 });
  resyncCircuitRaceProgress(raceProgress, rules, { x: vehicle.x, z: vehicle.z, sWindow: vehicle.course.s });
  const actor = {
    vehicle,
    raceProgress,
    recovery: createRecoveryState(vehicle),
    raceSession: createRaceSessionState(),
  };
  actor.raceSession.elapsedSeconds = 12;
  vehicle.pitch = Math.PI;
  assert.ok(advanceCircuitDrivingActor(world, actor, { rules, input: neutral, dt: 1 / 60, profile: RECOVERY_PROFILE }));
  assert.equal(raceProgress.acceptedFinishCount, 0);
  assert.ok(vehicle.course.s > rules.lapLength, 'known second copy survives recovery');
  assert.ok(actor.raceSession.elapsedSeconds >= 12);
});
