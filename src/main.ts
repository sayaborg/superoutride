import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { resetCameraRig, updateCamera, type CameraState } from './camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import { SIM_DT } from './core/constants.js';
import { guideCoordinateCurve } from './core/guide-coordinate-frame.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from './core/presentation-scale.js';
import { createM4DebugWorldSprites } from './dev/m4-debug-world.js';
import { createM638DeclarativeForkGrowthRuntime } from './dev/m6-38-declarative-fork-growth-plan.js';
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
import { createTunnelPresentation, createTunnelWorldSprites, selectTunnelBackground } from './dev/tunnel.js';
import { createFieldRouteProgressState, fieldRouteProgressTravelerView } from './gameplay/field-route-progress.js';
import { advanceRaceSession, createRaceSessionState } from './gameplay/race-session.js';
import { createRecoveryState, recoverVehicle } from './gameplay/recovery.js';
import { sampleRivalDrivingInput } from './gameplay/rival-driver.js';
import {
  createRunObjectiveState,
  createValidatedRunFinishFromRoute,
  updateRunObjectiveFromValidatedFinish,
} from './gameplay/run-objective.js';
import { createSharedRouteChoiceState, getSharedRouteChoiceLock } from './gameplay/shared-route-choice-authority.js';
import type { DrivingInput } from './input/driving-input.js';
import { createArcadeVehicle } from './physics/arcade-vehicle-physics.js';
import type { CompiledArcadeVehicleProfile } from './physics/vehicle-profiles.js';
import { renderDriving } from './render/renderer.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import {
  createLiveRouteTravelerState,
  liveRouteTravelersShareRuntimePackage,
  resolveLiveRouteTravelerRuntime,
  sampleLiveRouteChoicePlanTargetL,
  sampleLiveRouteChoiceTargetL,
} from './runtime/live-route-traveler.js';
import { createRivalRoster } from './runtime/rival-roster.js';
import {
  advanceRouteDrivingTick,
  resyncRouteDrivingActor,
  type RouteDrivingActor,
} from './runtime/route-driving-tick.js';
import { stageVehicleWorld, type StageRuntimeContentPackage } from './runtime/stage-runtime-content.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY, vehicleCatalogEntryForId } from './vehicle/vehicle-catalog.js';
import { createFarBackground } from './visual/far-background.js';
import { createSpriteAssets } from './visual/sprite-assets.js';
import { createDynamicVehicleCourseSprite } from './world/dynamic-vehicle-sprite.js';

const parentCourse = createM72DefaultBranchingParent();
const { guide, heightProfile, surfaceMap, groundProfile, terrainProfile } = parentCourse;
const outdoorFarBackground = createFarBackground();
const tunnelPresentation = createTunnelPresentation(guide.length, CURRENT_CAMERA_DISTANCE_METERS);
const spriteAssets = createSpriteAssets();
const staticWorldSprites = [
  ...createM4DebugWorldSprites(guide, heightProfile, spriteAssets),
  ...createTunnelWorldSprites(guide, heightProfile, tunnelPresentation),
];

const shell = createBrowserDrivingShell({ guide, height: heightProfile, surfaces: surfaceMap }, M7_2_PLAYER_START_L);
const { framebuffer, inputManager, cameraRig } = shell;
const raceSession = createRaceSessionState();

const liveRoute = createM638DeclarativeForkGrowthRuntime(
  guide,
  {
    heightProfile,
    surfaceMap,
    terrainProfile,
    groundProfile,
    selectFarBackground: (cameraS) =>
      selectTunnelBackground(cameraS, guide.length, outdoorFarBackground, tunnelPresentation).background,
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
const runObjective = createRunObjectiveState();
const rivalRoster = createRivalRoster(M8_3_BRANCHING_SESSION_CONFIGURATION);
const rivalRoutePlan = createM640RivalRouteChoicePlan(liveRoute);
const rivals = rivalRoster.map((entry): RouteDrivingActor => {
  const rivalVehicle = createArcadeVehicle(
    DEFAULT_VEHICLE_CATALOG_ENTRY.profile,
    { guide, height: heightProfile, surfaces: surfaceMap },
    {
      s: 95 + entry.rivalIndex * 6,
      l: M7_2_RIVAL_START_L,
      torqueProtection: DEFAULT_VEHICLE_CATALOG_ENTRY.torqueProtection,
    },
  );
  const traveler = createLiveRouteTravelerState(liveRoute, { x: rivalVehicle.x, z: rivalVehicle.z });
  return {
    actorId: entry.actorId,
    vehicle: rivalVehicle,
    recovery: createRecoveryState(rivalVehicle),
    traveler,
    fieldProgress: createFieldRouteProgressState(
      liveRoute.progress,
      fieldRouteProgressTravelerView(traveler.routeState, traveler.handoffState),
    ),
    recoveryProfile: M7_2_RIVAL_RECOVERY_PROFILE,
    sampleInput(runtime) {
      const lock = getSharedRouteChoiceLock(sharedRouteChoices, traveler.handoffState.activeStageId);
      const targetL =
        lock === null
          ? sampleLiveRouteChoicePlanTargetL(liveRoute, traveler, rivalRoutePlan, rivalVehicle.course.s)
          : sampleLiveRouteChoiceTargetL(liveRoute, traveler, lock.choiceId, rivalVehicle.course.s);
      return sampleRivalDrivingInput(runtime.coordinateFrame, rivalVehicle, targetL);
    },
  };
});
const sharedRouteChoices = createSharedRouteChoiceState(M8_3_BRANCHING_COURSE_MODE.sharedRouteChoiceMode);

const cameraProfile = CURRENT_CAMERA_PROFILE;

let input: DrivingInput = { steering: 0, throttle: false, brake: false };
const playerActor: RouteDrivingActor = {
  actorId: 'PLAYER',
  get vehicle() {
    return shell.vehicle;
  },
  get recovery() {
    return shell.recovery;
  },
  traveler: playerTraveler,
  fieldProgress: playerFieldProgress,
  recoveryProfile: M7_2_PLAYER_RECOVERY_PROFILE,
  sampleInput: () => input,
};
const drivingActors = [playerActor, ...rivals];
shell.mountControls(switchVehicleAtSafeSpawn, () => {
  const runtime = activeRuntime();
  recoverVehicle(stageVehicleWorld(runtime), shell.vehicle, {
    state: shell.recovery,
    reason: 'manual',
    profile: M7_2_PLAYER_RECOVERY_PROFILE,
  });
  resetCameraRig(cameraRig);
  resyncRouteDrivingActor(liveRoute, playerActor);
  camera = updateCamera(
    cameraRig,
    { guide: runtime.coordinateFrame, height: runtime.heightProfile },
    shell.vehicle,
    cameraProfile,
    SIM_DT,
  );
});

const initialRuntime = activeRuntime();
let camera: CameraState = updateCamera(
  cameraRig,
  { guide: initialRuntime.coordinateFrame, height: initialRuntime.heightProfile },
  shell.vehicle,
  cameraProfile,
  SIM_DT,
);

function tick(dt: number): void {
  input = inputManager.sample();

  const result = advanceRouteDrivingTick(liveRoute, sharedRouteChoices, drivingActors, {
    dt,
    branchViolationPolicy: M8_3_BRANCHING_COURSE_MODE.branchViolationPolicy,
  }).PLAYER!;
  if (result.recovered !== null) resetCameraRig(cameraRig);
  const routeUpdate = result.route.routeUpdate;

  advanceRaceSession(raceSession, playerFieldProgress, null, dt);
  const finish = createValidatedRunFinishFromRoute(routeState, routeUpdate, playerFieldProgress);
  updateRunObjectiveFromValidatedFinish(runObjective, finish, raceSession.elapsedSeconds);

  const runtimeAfterTick = activeRuntime();
  camera = updateCamera(
    cameraRig,
    { guide: runtimeAfterTick.coordinateFrame, height: runtimeAfterTick.heightProfile },
    shell.vehicle,
    cameraProfile,
    dt,
  );
}

function render(): void {
  const runtime = activeRuntime();
  const spriteFamily = deriveVehicleSpriteFamily(shell.presentation);
  const selectedBackground = runtime.selectFarBackground(camera.s);
  const rivalSprites = rivals.flatMap((rival) => {
    const rivalRuntime = resolveLiveRouteTravelerRuntime(liveRoute, rival.traveler);
    if (!liveRouteTravelersShareRuntimePackage(runtime, rivalRuntime)) return [];
    return [
      createDynamicVehicleCourseSprite(
        rival.actorId,
        rival.vehicle,
        camera.yaw,
        spriteAssets[deriveVehicleSpriteFamily(vehicleCatalogEntryForId(rival.vehicle.profile.id))],
        rivalRuntime.heightProfile,
      ),
    ];
  });
  const renderWorldSprites = [...runtime.worldSprites, ...rivalSprites];
  const stats = renderDriving(
    framebuffer,
    {
      background: selectedBackground,
      guide: guideCoordinateCurve(runtime.coordinateFrame),
      camera,
      vehicle: shell.vehicle,
      terrainProfile: runtime.terrainProfile,
      groundProfile: runtime.groundProfile,
      worldSprites: renderWorldSprites,
      assets: spriteAssets,
      playerKind: spriteFamily,
    },
    { roadView: runtime.roadView ?? undefined },
  );
  shell.present('branching', input, camera, stats.playerScreenY);
}

/** DEV selection is an explicit safe-spawn reconstruction, never a running-state conversion. */
function switchVehicleAtSafeSpawn(profile: Readonly<CompiledArcadeVehicleProfile>): void {
  const runtime = activeRuntime();
  recoverVehicle(stageVehicleWorld(runtime), shell.vehicle, {
    state: shell.recovery,
    reason: 'manual',
    profile: M7_2_PLAYER_RECOVERY_PROFILE,
  });
  shell.replacePlayer(profile, stageVehicleWorld(runtime));
  resyncRouteDrivingActor(liveRoute, playerActor);
  camera = updateCamera(
    cameraRig,
    { guide: runtime.coordinateFrame, height: runtime.heightProfile },
    shell.vehicle,
    cameraProfile,
    SIM_DT,
  );
}

function activeRuntime(): StageRuntimeContentPackage {
  return resolveLiveRouteTravelerRuntime(liveRoute, playerTraveler);
}

shell.start(tick, render);
