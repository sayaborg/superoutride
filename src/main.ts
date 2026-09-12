import { composeBrowserCourseContent } from './browser/course-mode-selection.js';
import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { guideCoordinateCurve } from './core/guide-coordinate-frame.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from './core/presentation-scale.js';
import {
  BRANCHING_DEFAULT_BRANCHING_FORK,
  BRANCHING_PLAYER_RECOVERY_PROFILE,
  BRANCHING_PLAYER_START_L,
  BRANCHING_RIVAL_RECOVERY_PROFILE,
  BRANCHING_RIVAL_START_L,
  createDefaultBranchingParent,
} from './dev/courses/branching-highway.js';
import { BRANCHING_COURSE_MODE, BRANCHING_SESSION_CONFIGURATION } from './dev/courses/branching-mode.js';
import { createDeclarativeForkGrowthRuntime } from './dev/courses/fork-growth-plan.js';
import { createRivalRouteChoicePlan } from './dev/courses/rival-route-plan.js';
import { createRoadsideSprites } from './dev/courses/roadside-scenery.js';
import { createTunnelPresentation, createTunnelWorldSprites, selectTunnelBackground } from './dev/courses/tunnel.js';
import { createFieldRouteProgressState, fieldRouteProgressTravelerView } from './gameplay/field-route-progress.js';
import { advanceRaceSession, createRaceSessionState } from './gameplay/race-session.js';
import { createRecoveryState } from './gameplay/recovery.js';
import { sampleRivalDrivingInput } from './gameplay/rival-driver.js';
import {
  createRunObjectiveState,
  createValidatedRunFinishFromRoute,
  updateRunObjectiveFromValidatedFinish,
} from './gameplay/run-objective.js';
import { createSharedRouteChoiceState, getSharedRouteChoiceLock } from './gameplay/shared-route-choice-authority.js';
import type { DrivingInput } from './input/driving-input.js';
import { createArcadeVehicle } from './physics/arcade-vehicle-physics.js';
import { createDynamicVehicleCourseSprite } from './render/dynamic-vehicle-sprite.js';
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

const { mode: selectedCourseMode, content: parentCourse } = composeBrowserCourseContent(
  'BRANCHING',
  { branching: createDefaultBranchingParent },
  new URLSearchParams(location.search).get('mode'),
);
const { guide, heightProfile, surfaceMap, groundProfile, terrainProfile } = parentCourse;
const outdoorFarBackground = createFarBackground();
const tunnelPresentation = createTunnelPresentation(guide.length, CURRENT_CAMERA_DISTANCE_METERS);
const spriteAssets = createSpriteAssets();
const staticWorldSprites = [
  ...createRoadsideSprites(guide, heightProfile, spriteAssets),
  ...createTunnelWorldSprites(guide, heightProfile, tunnelPresentation),
];

const shell = createBrowserDrivingShell(
  { guide, height: heightProfile, surfaces: surfaceMap },
  BRANCHING_PLAYER_START_L,
);
const { framebuffer, inputManager } = shell;
const raceSession = createRaceSessionState();

const liveRoute = createDeclarativeForkGrowthRuntime(
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
  BRANCHING_DEFAULT_BRANCHING_FORK,
);
const playerTraveler = createLiveRouteTravelerState(liveRoute, { x: shell.vehicle.x, z: shell.vehicle.z });
const playerFieldProgress = createFieldRouteProgressState(
  liveRoute.progress,
  fieldRouteProgressTravelerView(playerTraveler.routeState, playerTraveler.handoffState),
);
const routeState = playerTraveler.routeState;
const runObjective = createRunObjectiveState();
const rivalRoster = createRivalRoster(BRANCHING_SESSION_CONFIGURATION);
const rivalRoutePlan = createRivalRouteChoicePlan(liveRoute);
const rivals = rivalRoster.map((entry): RouteDrivingActor => {
  const rivalVehicle = createArcadeVehicle(
    DEFAULT_VEHICLE_CATALOG_ENTRY.profile,
    { guide, height: heightProfile, surfaces: surfaceMap },
    {
      s: 95 + entry.rivalIndex * 6,
      l: BRANCHING_RIVAL_START_L,
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
    recoveryProfile: BRANCHING_RIVAL_RECOVERY_PROFILE,
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
const sharedRouteChoices = createSharedRouteChoiceState(BRANCHING_COURSE_MODE.sharedRouteChoiceMode);

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
  recoveryProfile: BRANCHING_PLAYER_RECOVERY_PROFILE,
  sampleInput: () => input,
};
const drivingActors = [playerActor, ...rivals];
const lifecycle = shell.mountControls({
  world: () => stageVehicleWorld(activeRuntime()),
  recoveryProfile: BRANCHING_PLAYER_RECOVERY_PROFILE,
  resync: () => resyncRouteDrivingActor(liveRoute, playerActor),
});

function tick(dt: number): void {
  input = inputManager.sample();

  const result = advanceRouteDrivingTick(liveRoute, sharedRouteChoices, drivingActors, {
    dt,
    branchViolationPolicy: BRANCHING_COURSE_MODE.branchViolationPolicy,
  }).PLAYER!;
  const routeUpdate = result.route.routeUpdate;

  advanceRaceSession(raceSession, playerFieldProgress, null, dt);
  const finish = createValidatedRunFinishFromRoute(routeState, routeUpdate, playerFieldProgress);
  updateRunObjectiveFromValidatedFinish(runObjective, finish, raceSession.elapsedSeconds);

  lifecycle.update(dt, result.recovered !== null);
}

function render(): void {
  const { camera } = lifecycle;
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
  shell.present(selectedCourseMode.query, input, camera, stats.playerScreenY, rivals);
}

function activeRuntime(): StageRuntimeContentPackage {
  return resolveLiveRouteTravelerRuntime(liveRoute, playerTraveler);
}

shell.start(tick, render);
