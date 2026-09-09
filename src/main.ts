import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { CURRENT_M5_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import {
  resetM5CameraRig,
  updateM5Camera,
  type M5CameraState,
} from './camera/m5-camera.js';
import { SIM_DT } from './core/constants.js';
import {
  guideCoordinateCurve,
  locateWorldOnGuideCoordinateGlobal,
} from './core/guide-coordinate-frame.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from './core/presentation-scale.js';
import { createM4DebugWorldSprites } from './dev/m4-debug-world.js';
import { createM627LiveRouteRuntime } from './dev/m6-27-live-route-runtime.js';
import { createM640RivalRouteChoicePlan } from './dev/m6-40-rival-live-route.js';
import {
  M7_2_DEFAULT_BRANCHING_FORK,
  M7_2_PLAYER_RECOVERY_PROFILE,
  M7_2_PLAYER_START_L,
  M7_2_RIVAL_RECOVERY_PROFILE,
  M7_2_RIVAL_START_L,
  createM72DefaultBranchingParent,
} from './dev/m7-2-default-branching-highway.js';
import { M8_3_BRANCHING_COURSE_MODE, M8_3_BRANCHING_SESSION_CONFIGURATION } from './dev/m8-3-course-debug-mode.js';
import { lockedBranchRecoveryApproach } from './gameplay/branch-violation.js';
import {
  createFieldRouteProgressState,
  fieldRouteProgressBoundaryFromRouteUpdate,
  fieldRouteProgressTravelerView,
  resyncFieldRouteProgress,
  updateFieldRouteProgress,
} from './gameplay/field-route-progress.js';
import {
  advanceRaceSession,
  createRaceSessionState,
} from './gameplay/race-session.js';
import {
  M5_RECOVERY_PROFILE,
  createM5RecoveryState,
  recoverM5Vehicle,
  recoverM5VehicleToGuideCoordinate,
  advanceVehicleWithRecovery,
  type M5RecoveryState,
  type M5VehicleState,
} from './gameplay/recovery.js';
import { sampleRivalDrivingInput } from './gameplay/rival-driver.js';
import { pendingRouteStageRecoveryTarget } from './gameplay/route-stage-handoff.js';
import {
  createRunObjectiveState,
  createValidatedRunFinishFromRoute,
  updateRunObjectiveFromValidatedFinish,
} from './gameplay/run-objective.js';
import {
  createSharedRouteChoiceState,
  getSharedRouteChoiceLock,
} from './gameplay/shared-route-choice-authority.js';
import type { DrivingInput } from './input/driving-input.js';
import { createArcadeVehicle } from './physics/arcade-vehicle-physics.js';
import type { CompiledArcadeVehicleProfile } from './physics/vehicle-profiles.js';
import { renderM5Driving } from './render/m5-renderer.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { advanceLiveRouteMultiActorTick } from './runtime/live-route-multi-actor-tick.js';
import {
  createLiveRouteTravelerState,
  liveRouteTravelersShareRuntimePackage,
  resolveLiveRouteTravelerRuntime,
  resyncLiveRouteTraveler,
  sampleLiveRouteChoicePlanTargetL,
  sampleLiveRouteChoiceTargetL,
  type LiveRouteTravelerState,
} from './runtime/live-route-traveler.js';
import { createRivalRoster } from './runtime/rival-roster.js';
import {
  resolveActiveStageRuntimeContent,
  type StageRuntimeContentPackage,
} from './runtime/stage-runtime-content.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY, vehicleCatalogEntryForId } from './vehicle/vehicle-catalog.js';
import { createM3FarBackground } from './visual/far-background.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';
import {
  createM5TunnelPresentation,
  selectM5FarBackground,
} from './visual/m5-9-tunnel.js';
import { createDynamicVehicleCourseSprite } from './world/dynamic-vehicle-sprite.js';
import { createM5TunnelWorldSprites } from './world/m5-9-tunnel-world.js';

const parentCourse = createM72DefaultBranchingParent();
const {
  guide,
  heightProfile,
  surfaceMap,
  groundProfile,
  terrainProfile,
} = parentCourse;
const outdoorFarBackground = createM3FarBackground();
const tunnelPresentation = createM5TunnelPresentation(guide.length, CURRENT_CAMERA_DISTANCE_METERS);
const spriteAssets = createM4SpriteAssets();
const staticWorldSprites = [
  ...createM4DebugWorldSprites(guide, heightProfile, spriteAssets),
  ...createM5TunnelWorldSprites(guide, heightProfile, tunnelPresentation),
];

const shell = createBrowserDrivingShell({ guide, height: heightProfile, surfaces: surfaceMap }, M7_2_PLAYER_START_L);
const { framebuffer, inputManager, cameraRig } = shell;
const raceSession = createRaceSessionState();

const liveRoute = createM627LiveRouteRuntime(
  guide,
  {
    heightProfile,
    surfaceMap,
    terrainProfile,
    groundProfile,
    selectFarBackground: (cameraS) => selectM5FarBackground(
      cameraS,
      guide.length,
      outdoorFarBackground,
      tunnelPresentation,
    ).background,
    worldSprites: staticWorldSprites,
  },
  spriteAssets,
  M7_2_DEFAULT_BRANCHING_FORK,
);
const playerTraveler = createLiveRouteTravelerState(liveRoute, { x: shell.vehicle.x, z: shell.vehicle.z });
const playerFieldProgress = createFieldRouteProgressState(
  liveRoute.progress,
  fieldRouteProgressTravelerView(playerTraveler.routeState, playerTraveler.handoffState),
);
const routeState = playerTraveler.routeState;
const routeHandoffState = playerTraveler.handoffState;
const stageRuntimeRegistry = liveRoute.registry;
const runObjective = createRunObjectiveState();
const rivalRoster = createRivalRoster(M8_3_BRANCHING_SESSION_CONFIGURATION);
const rivalRoutePlan = createM640RivalRouteChoicePlan(liveRoute);
const rivals = rivalRoster.map((entry) => {
  const rivalVehicle = createArcadeVehicle(
    DEFAULT_VEHICLE_CATALOG_ENTRY.profile,
    guide,
    heightProfile,
    surfaceMap,
    95 + entry.rivalIndex * 6,
    M7_2_RIVAL_START_L,
    undefined,
    undefined,
    undefined,
    DEFAULT_VEHICLE_CATALOG_ENTRY.torqueProtection,
  );
  const traveler = createLiveRouteTravelerState(
    liveRoute,
    { x: rivalVehicle.x, z: rivalVehicle.z },
  );
  return {
    actorId: entry.actorId,
    vehicle: rivalVehicle,
    recovery: createM5RecoveryState(rivalVehicle),
    traveler,
    fieldProgress: createFieldRouteProgressState(
      liveRoute.progress,
      fieldRouteProgressTravelerView(traveler.routeState, traveler.handoffState),
    ),
    routePlan: rivalRoutePlan,
  };
});
const sharedRouteChoices = createSharedRouteChoiceState(M8_3_BRANCHING_COURSE_MODE.sharedRouteChoiceMode);

const cameraProfile = CURRENT_M5_CAMERA_PROFILE;

let input: DrivingInput = { steering: 0, throttle: false, brake: false };
shell.mountControls(switchVehicleAtSafeSpawn, () => {
  const runtime = activeRuntime();
  recoverM5Vehicle(
    shell.recovery,
    runtime.coordinateFrame,
    runtime.heightProfile,
    runtime.surfaceMap,
    shell.vehicle,
    'manual',
    M7_2_PLAYER_RECOVERY_PROFILE,
  );
  resetM5CameraRig(cameraRig);
  resyncLiveRouteTraveler(liveRoute, playerTraveler, { x: shell.vehicle.x, z: shell.vehicle.z });
  resyncFieldRouteProgress(
    playerFieldProgress,
    liveRoute.progress,
    fieldRouteProgressTravelerView(playerTraveler.routeState, playerTraveler.handoffState),
  );
  camera = updateM5Camera(
    cameraRig,
    runtime.coordinateFrame,
    runtime.heightProfile,
    shell.vehicle,
    cameraProfile,
    SIM_DT,
  );
});

let accumulator = 0;
let previousTime = performance.now();
const initialRuntime = activeRuntime();
let camera: M5CameraState = updateM5Camera(
  cameraRig,
  initialRuntime.coordinateFrame,
  initialRuntime.heightProfile,
  shell.vehicle,
  cameraProfile,
  SIM_DT,
);

function frame(now: number): void {
  const elapsed = Math.min((now - previousTime) / 1000, 0.25);
  previousTime = now;
  accumulator += elapsed;

  while (accumulator >= SIM_DT) {
    input = inputManager.sample();

    const runtimeBefore = activeRuntime();
    const recovered = advanceVehicleWithRecovery(
      shell.recovery,
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      shell.vehicle,
      input,
      SIM_DT,
      M7_2_PLAYER_RECOVERY_PROFILE,
      pendingRouteStageRecoveryTarget(
        playerTraveler.handoffState,
        M7_2_PLAYER_RECOVERY_PROFILE.backtrackDistance,
      ),
    );
    if (recovered !== null) {
      resetM5CameraRig(cameraRig);
      resyncLiveRouteTraveler(liveRoute, playerTraveler, { x: shell.vehicle.x, z: shell.vehicle.z });
    }

    const rivalFrames = rivals.map((rival) => {
      const rivalRuntimeBefore = resolveLiveRouteTravelerRuntime(liveRoute, rival.traveler);
      const sharedLock = getSharedRouteChoiceLock(
        sharedRouteChoices,
        rival.traveler.handoffState.activeStageId,
      );
      const rivalTargetL = sharedLock === null
        ? sampleLiveRouteChoicePlanTargetL(
          liveRoute,
          rival.traveler,
          rival.routePlan,
          rival.vehicle.course.s,
        )
        : sampleLiveRouteChoiceTargetL(
          liveRoute,
          rival.traveler,
          sharedLock.choiceId,
          rival.vehicle.course.s,
        );
      const rivalInput = sampleRivalDrivingInput(
        rivalRuntimeBefore.coordinateFrame,
        rival.vehicle,
        rivalTargetL,
      );
      const rivalRecovered = advanceVehicleWithRecovery(
        rival.recovery,
        rivalRuntimeBefore.coordinateFrame,
        rivalRuntimeBefore.heightProfile,
        rivalRuntimeBefore.surfaceMap,
        rival.vehicle,
        rivalInput,
        SIM_DT,
        M7_2_RIVAL_RECOVERY_PROFILE,
        pendingRouteStageRecoveryTarget(
          rival.traveler.handoffState,
          M7_2_RIVAL_RECOVERY_PROFILE.backtrackDistance,
        ),
      );
      if (rivalRecovered !== null) {
        resyncLiveRouteTraveler(
          liveRoute,
          rival.traveler,
          { x: rival.vehicle.x, z: rival.vehicle.z },
        );
      }
      return {
        rival,
        runtimeBefore: rivalRuntimeBefore,
        recovered: rivalRecovered,
      };
    });

    const routeTick = advanceLiveRouteMultiActorTick(
      liveRoute,
      sharedRouteChoices,
      [
        {
          actorId: 'PLAYER',
          state: playerTraveler,
          currentWorldPoint: { x: shell.vehicle.x, z: shell.vehicle.z },
          observeRouteBoundary: recovered === null,
        },
        ...rivalFrames.map(({ rival, recovered: rivalRecovered }) => ({
          actorId: rival.actorId,
          state: rival.traveler,
          currentWorldPoint: { x: rival.vehicle.x, z: rival.vehicle.z },
          observeRouteBoundary: rivalRecovered === null,
        })),
      ],
    );
    const playerRouteTick = routeTick.actors[0]!;
    const routeUpdate = playerRouteTick.routeUpdate;

    if (playerRouteTick.branchViolation !== null) {
      recoverActorToLockedBranch(
        runtimeBefore,
        shell.recovery,
        shell.vehicle,
        playerTraveler,
        playerRouteTick.branchViolation.lockedChoiceId,
      );
      resetM5CameraRig(cameraRig);
    } else if (playerRouteTick.committed) {
      shell.vehicle.course = { ...routeHandoffState.coordinate };
    }
    const playerProgressView = fieldRouteProgressTravelerView(
      playerTraveler.routeState,
      playerTraveler.handoffState,
    );
    if (recovered !== null || playerRouteTick.branchViolation !== null) {
      resyncFieldRouteProgress(playerFieldProgress, liveRoute.progress, playerProgressView);
    } else {
      updateFieldRouteProgress(
        playerFieldProgress,
        liveRoute.progress,
        playerProgressView,
        fieldRouteProgressBoundaryFromRouteUpdate(routeUpdate),
      );
    }
    for (let rivalIndex = 0; rivalIndex < rivalFrames.length; rivalIndex += 1) {
      const rivalFrame = rivalFrames[rivalIndex]!;
      const rivalRouteTick = routeTick.actors[rivalIndex + 1]!;
      if (rivalRouteTick.actorId !== rivalFrame.rival.actorId) {
        throw new Error('multi-actor route tick changed roster order');
      }
      if (rivalRouteTick.branchViolation !== null) {
        recoverActorToLockedBranch(
          rivalFrame.runtimeBefore,
          rivalFrame.rival.recovery,
          rivalFrame.rival.vehicle,
          rivalFrame.rival.traveler,
          rivalRouteTick.branchViolation.lockedChoiceId,
        );
      } else if (rivalRouteTick.committed) {
        rivalFrame.rival.vehicle.course = { ...rivalFrame.rival.traveler.handoffState.coordinate };
      }
      const rivalProgressView = fieldRouteProgressTravelerView(
        rivalFrame.rival.traveler.routeState,
        rivalFrame.rival.traveler.handoffState,
      );
      if (rivalFrame.recovered !== null || rivalRouteTick.branchViolation !== null) {
        resyncFieldRouteProgress(
          rivalFrame.rival.fieldProgress,
          liveRoute.progress,
          rivalProgressView,
        );
      } else {
        updateFieldRouteProgress(
          rivalFrame.rival.fieldProgress,
          liveRoute.progress,
          rivalProgressView,
          fieldRouteProgressBoundaryFromRouteUpdate(rivalRouteTick.routeUpdate),
        );
      }
    }

    advanceRaceSession(raceSession, playerFieldProgress, null, SIM_DT);
    const finish = createValidatedRunFinishFromRoute(routeState, routeUpdate, playerFieldProgress);
    updateRunObjectiveFromValidatedFinish(
      runObjective,
      finish,
      raceSession.elapsedSeconds,
    );

    const runtimeAfterTick = activeRuntime();
    camera = updateM5Camera(
      cameraRig,
      runtimeAfterTick.coordinateFrame,
      runtimeAfterTick.heightProfile,
      shell.vehicle,
      cameraProfile,
      SIM_DT,
    );
    accumulator -= SIM_DT;
  }

  render();
  requestAnimationFrame(frame);
}

function render(): void {
  const runtime = activeRuntime();
  const spriteFamily = deriveVehicleSpriteFamily(shell.presentation);
  const selectedBackground = runtime.selectFarBackground(camera.s);
  const rivalSprites = rivals.flatMap((rival) => {
    const rivalRuntime = resolveLiveRouteTravelerRuntime(liveRoute, rival.traveler);
    if (!liveRouteTravelersShareRuntimePackage(runtime, rivalRuntime)) return [];
    return [createDynamicVehicleCourseSprite(
      rival.actorId,
      rival.vehicle,
      camera.yaw,
      spriteAssets[deriveVehicleSpriteFamily(vehicleCatalogEntryForId(rival.vehicle.profile.id))],
      rivalRuntime.heightProfile,
    )];
  });
  const renderWorldSprites = [...runtime.worldSprites, ...rivalSprites];
  const stats = renderM5Driving(
    framebuffer,
    selectedBackground,
    guideCoordinateCurve(runtime.coordinateFrame),
    camera,
    shell.vehicle,
    runtime.terrainProfile,
    runtime.groundProfile,
    renderWorldSprites,
    spriteAssets,
    spriteFamily,
    runtime.roadView ?? undefined,
  );
  shell.present('branching', input, camera, stats.playerScreenY);
}

/** DEV selection is an explicit safe-spawn reconstruction, never a running-state conversion. */
function switchVehicleAtSafeSpawn(profile: Readonly<CompiledArcadeVehicleProfile>): void {
  const runtime = activeRuntime();
  recoverM5Vehicle(
    shell.recovery,
    runtime.coordinateFrame,
    runtime.heightProfile,
    runtime.surfaceMap,
    shell.vehicle,
    'manual',
    M7_2_PLAYER_RECOVERY_PROFILE,
  );
  shell.replacePlayer(profile, { guide: runtime.coordinateFrame, height: runtime.heightProfile, surfaces: runtime.surfaceMap });
  resyncLiveRouteTraveler(liveRoute, playerTraveler, { x: shell.vehicle.x, z: shell.vehicle.z });
  resyncFieldRouteProgress(
    playerFieldProgress,
    liveRoute.progress,
    fieldRouteProgressTravelerView(playerTraveler.routeState, playerTraveler.handoffState),
  );
}

function recoverActorToLockedBranch(
  runtime: StageRuntimeContentPackage,
  recoveryState: M5RecoveryState,
  actorVehicle: M5VehicleState,
  traveler: LiveRouteTravelerState,
  lockedChoiceId: string,
): void {
  if (M8_3_BRANCHING_COURSE_MODE.branchViolationPolicy !== 'RECOVER_TO_LOCKED_BRANCH') {
    throw new Error('branch violation reached browser without a recovery policy');
  }
  const approach = lockedBranchRecoveryApproach(
    liveRoute.gates,
    lockedChoiceId,
    M5_RECOVERY_PROFILE.backtrackDistance,
  );
  const target = locateWorldOnGuideCoordinateGlobal(
    runtime.coordinateFrame,
    approach.worldPoint,
    false,
  );
  recoverM5VehicleToGuideCoordinate(
    recoveryState,
    runtime.coordinateFrame,
    runtime.heightProfile,
    runtime.surfaceMap,
    actorVehicle,
    { s: target.s, l: target.l },
    'wrong-course',
  );
  resyncLiveRouteTraveler(
    liveRoute,
    traveler,
    { x: actorVehicle.x, z: actorVehicle.z },
  );
}

function activeRuntime(): StageRuntimeContentPackage {
  return resolveActiveStageRuntimeContent(stageRuntimeRegistry, routeHandoffState);
}

requestAnimationFrame(frame);
