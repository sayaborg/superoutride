import { locateWorldOnGuideCoordinateGlobal } from '../core/guide-coordinate-frame.js';
import { uniqueKey } from '../core/validation.js';
import { lockedBranchRecoveryApproach } from '../gameplay/branch-violation.js';
import type { BranchViolationPolicy } from '../gameplay/course-mode.js';
import {
  fieldRouteProgressBoundaryFromRouteUpdate,
  fieldRouteProgressTravelerView,
  resyncFieldRouteProgress,
  updateFieldRouteProgress,
  type FieldRouteProgressState,
} from '../gameplay/field-route-progress.js';
import {
  advanceVehicleWithRecovery,
  recoverVehicleToGuideCoordinate,
  type RecoveryProfile,
  type RecoveryReason,
  type RecoveryState,
} from '../gameplay/recovery.js';
import { pendingRouteStageRecoveryTarget } from '../gameplay/route-stage-handoff.js';
import type { SharedRouteChoiceState } from '../gameplay/shared-route-choice-authority.js';
import type { DrivingInput } from '../input/driving-input.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { advanceLiveRouteMultiActorTick, type LiveRouteActorTickResult } from './live-route-multi-actor-tick.js';
import type { LiveRouteRuntimeAssembly } from './live-route-runtime.js';
import {
  resolveLiveRouteTravelerRuntime,
  resyncLiveRouteTraveler,
  type LiveRouteTravelerState,
} from './live-route-traveler.js';
import { stageVehicleWorld, type StageRuntimeContentPackage } from './stage-runtime-content.js';

export interface RouteDrivingActor {
  readonly actorId: string;
  readonly vehicle: ArcadeVehicleState;
  readonly recovery: RecoveryState;
  readonly traveler: LiveRouteTravelerState;
  readonly fieldProgress: FieldRouteProgressState;
  readonly recoveryProfile: RecoveryProfile;
  readonly sampleInput: (runtime: StageRuntimeContentPackage) => DrivingInput;
}

export interface RouteDrivingResult {
  readonly route: LiveRouteActorTickResult;
  readonly recovered: RecoveryReason | null;
}

/** Rebase observation after an explicit discontinuity, preserving validated route/race progress. */
export function resyncRouteDrivingActor(live: LiveRouteRuntimeAssembly, actor: RouteDrivingActor): void {
  resyncLiveRouteTraveler(live, actor.traveler, { x: actor.vehicle.x, z: actor.vehicle.z });
  resyncFieldRouteProgress(
    actor.fieldProgress,
    live.progress,
    fieldRouteProgressTravelerView(actor.traveler.routeState, actor.traveler.handoffState),
  );
}

/** All physics completes before field arbitration. Every actor then follows the same lifecycle. */
export function advanceRouteDrivingTick(
  live: LiveRouteRuntimeAssembly,
  shared: SharedRouteChoiceState,
  actors: readonly RouteDrivingActor[],
  { dt, branchViolationPolicy }: { dt: number; branchViolationPolicy: BranchViolationPolicy | null },
): Readonly<Record<string, RouteDrivingResult>> {
  const ids = new Set<string>();
  const travelers = new Set<LiveRouteTravelerState>();
  for (const actor of actors) {
    uniqueKey(ids, actor.actorId, 'driving actor id');
    if (travelers.has(actor.traveler)) throw new Error('driving actors must own distinct travelers');
    travelers.add(actor.traveler);
  }
  const frames = actors.map((actor) => {
    const runtime = resolveLiveRouteTravelerRuntime(live, actor.traveler);
    const recovered = advanceVehicleWithRecovery(stageVehicleWorld(runtime), actor.vehicle, {
      state: actor.recovery,
      input: actor.sampleInput(runtime),
      dt,
      profile: actor.recoveryProfile,
      target: pendingRouteStageRecoveryTarget(actor.traveler.handoffState, actor.recoveryProfile.backtrackDistance),
    });
    if (recovered !== null) resyncLiveRouteTraveler(live, actor.traveler, { x: actor.vehicle.x, z: actor.vehicle.z });
    return { actor, runtime, recovered };
  });
  const tick = advanceLiveRouteMultiActorTick(
    live,
    shared,
    frames.map(({ actor, recovered }) => ({
      actorId: actor.actorId,
      state: actor.traveler,
      currentWorldPoint: { x: actor.vehicle.x, z: actor.vehicle.z },
      observeRouteBoundary: recovered === null,
    })),
  );
  const results: Record<string, RouteDrivingResult> = Object.create(null);
  for (const { actor, runtime, recovered } of frames) {
    const route = tick.actors[actor.actorId]!;
    let recoveryReason = recovered;
    if (route.branchViolation !== null) {
      if (branchViolationPolicy !== 'RECOVER_TO_LOCKED_BRANCH') {
        throw new Error('branch violation requires a recovery policy');
      }
      const approach = lockedBranchRecoveryApproach(
        live.gates,
        route.branchViolation.lockedChoiceId,
        actor.recoveryProfile.backtrackDistance,
      );
      const target = locateWorldOnGuideCoordinateGlobal(runtime.coordinateFrame, approach.worldPoint);
      recoverVehicleToGuideCoordinate(stageVehicleWorld(runtime), actor.vehicle, {
        state: actor.recovery,
        target,
        reason: 'wrong-course',
        profile: actor.recoveryProfile,
      });
      resyncLiveRouteTraveler(live, actor.traveler, { x: actor.vehicle.x, z: actor.vehicle.z });
      recoveryReason = 'wrong-course';
    } else if (route.committed) {
      actor.vehicle.course = { ...actor.traveler.handoffState.coordinate };
    }
    const progress = fieldRouteProgressTravelerView(actor.traveler.routeState, actor.traveler.handoffState);
    if (recoveryReason !== null) resyncFieldRouteProgress(actor.fieldProgress, live.progress, progress);
    else
      updateFieldRouteProgress(
        actor.fieldProgress,
        live.progress,
        progress,
        fieldRouteProgressBoundaryFromRouteUpdate(route.routeUpdate),
      );
    results[actor.actorId] = Object.freeze({ route, recovered: recoveryReason });
  }
  return Object.freeze(results);
}
