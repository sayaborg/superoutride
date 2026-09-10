import { selectBrowserCourseMode } from './browser/course-mode-selection.js';
import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { resetCameraRig, updateCamera, type CameraState } from './camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import { LOGICAL_HEIGHT, SIM_DT } from './core/constants.js';
import { CURRENT_RENDER_FAR_DEPTH_METERS, CURRENT_RENDER_NEAR_DEPTH_METERS } from './core/presentation-scale.js';
import {
  M9_3_DEV_SESSION_CONFIGURATION,
  M9_3_TSUKUBA_PLAYER_RECOVERY_PROFILE,
  M9_3_TSUKUBA_PLAYER_START_L,
  M9_3_TSUKUBA_RIVAL_RECOVERY_PROFILE,
  M9_3_TSUKUBA_RIVAL_START_L,
  createM93TsukubaCourse2000Runtime,
  createM93TsukubaGroundProfile,
} from './dev/m9-3-tsukuba-circuit.js';
import {
  M9_6_FISCO_DEV_SESSION_CONFIGURATION,
  M9_6_FISCO_PLAYER_RECOVERY_PROFILE,
  M9_6_FISCO_PLAYER_START_L,
  M9_6_FISCO_RIVAL_RECOVERY_PROFILE,
  M9_6_FISCO_RIVAL_START_L,
  createM96FiscoGroundProfile,
  createM96FiscoRuntime,
} from './dev/m9-6-fisco-circuit.js';
import { createCircuitRaceProgressState, resyncCircuitRaceProgress } from './gameplay/circuit-race-progress.js';
import { createRaceSessionState } from './gameplay/race-session.js';
import { createRecoveryState, recoverVehicle } from './gameplay/recovery.js';
import { sampleRivalDrivingInput } from './gameplay/rival-driver.js';
import type { DrivingInput } from './input/driving-input.js';
import { createArcadeVehicle } from './physics/arcade-vehicle-physics.js';
import type { CompiledArcadeVehicleProfile } from './physics/vehicle-profiles.js';
import { renderDriving } from './render/renderer.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import type { TerrainVisualProfile } from './road/terrain-line.js';
import { advanceCircuitDrivingActor, type CircuitDrivingActor } from './runtime/circuit-driving-tick.js';
import { createRivalRoster } from './runtime/rival-roster.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY, vehicleCatalogEntryForId } from './vehicle/vehicle-catalog.js';
import { createFarBackground } from './visual/far-background.js';
import { createSpriteAssets } from './visual/sprite-assets.js';
import { createDynamicVehicleCourseSprite } from './world/dynamic-vehicle-sprite.js';

const selectedCourseMode = selectBrowserCourseMode(new URLSearchParams(location.search).get('mode'));
const circuitBuilders = {
  fisco: () => ({
    session: M9_6_FISCO_DEV_SESSION_CONFIGURATION,
    playerRecoveryProfile: M9_6_FISCO_PLAYER_RECOVERY_PROFILE,
    playerStartL: M9_6_FISCO_PLAYER_START_L,
    rivalRecoveryProfile: M9_6_FISCO_RIVAL_RECOVERY_PROFILE,
    rivalStartL: M9_6_FISCO_RIVAL_START_L,
    live: createM96FiscoRuntime(),
    groundProfile: createM96FiscoGroundProfile(),
  }),
  circuit: () => ({
    session: M9_3_DEV_SESSION_CONFIGURATION,
    playerRecoveryProfile: M9_3_TSUKUBA_PLAYER_RECOVERY_PROFILE,
    playerStartL: M9_3_TSUKUBA_PLAYER_START_L,
    rivalRecoveryProfile: M9_3_TSUKUBA_RIVAL_RECOVERY_PROFILE,
    rivalStartL: M9_3_TSUKUBA_RIVAL_START_L,
    live: createM93TsukubaCourse2000Runtime(),
    groundProfile: createM93TsukubaGroundProfile(),
  }),
};
const buildCircuit = Object.hasOwn(circuitBuilders, selectedCourseMode.query)
  ? circuitBuilders[selectedCourseMode.query as keyof typeof circuitBuilders]
  : undefined;
if (selectedCourseMode.routeKind !== 'CIRCUIT' || buildCircuit === undefined) {
  throw new Error(`main-circuit cannot compose ${selectedCourseMode.query}`);
}
const selectedCircuit = buildCircuit();

const live = selectedCircuit.live;
const windowRuntime = live.window;
const raceRules = live.raceRules;
const guide = windowRuntime.guide;
const height = windowRuntime.height;
const surfaces = windowRuntime.surface;
const vehicleWorld = { guide, height, surfaces };
const background = createFarBackground();
const spriteAssets = createSpriteAssets();

const groundProfile = selectedCircuit.groundProfile;
const terrainProfile: TerrainVisualProfile = {
  screenHeight: LOGICAL_HEIGHT,
  dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
  dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
  groundLeft: groundProfile.groundLeft,
  groundRight: groundProfile.groundRight,
  roadLeft: groundProfile.roadLeft,
  roadRight: groundProfile.roadRight,
  height,
  visual: windowRuntime.visual,
  thinSpanScreenRows: 1,
};

const shell = createBrowserDrivingShell({ guide, height, surfaces }, selectedCircuit.playerStartL);
const { framebuffer, inputManager, cameraRig } = shell;
const raceProgress = createCircuitRaceProgressState(raceRules, raceSample());
const raceSession = createRaceSessionState();
const playerActor: CircuitDrivingActor = {
  get vehicle() {
    return shell.vehicle;
  },
  get recovery() {
    return shell.recovery;
  },
  raceProgress,
  raceSession,
};
const rivalRoster = createRivalRoster(selectedCircuit.session);
const rivals = rivalRoster.map((entry) => {
  const rivalVehicle = createArcadeVehicle(
    DEFAULT_VEHICLE_CATALOG_ENTRY.profile,
    { guide, height, surfaces },
    {
      s: 95 + entry.rivalIndex * 6,
      l: selectedCircuit.rivalStartL,
      torqueProtection: DEFAULT_VEHICLE_CATALOG_ENTRY.torqueProtection,
    },
  );
  return {
    actorId: entry.actorId,
    vehicle: rivalVehicle,
    recovery: createRecoveryState(rivalVehicle),
    raceProgress: createCircuitRaceProgressState(raceRules, {
      x: rivalVehicle.x,
      z: rivalVehicle.z,
      sWindow: rivalVehicle.course.s,
    }),
    raceSession: createRaceSessionState(),
  };
});

const cameraProfile = CURRENT_CAMERA_PROFILE;

let input: DrivingInput = { steering: 0, throttle: false, brake: false };
let camera: CameraState = updateCamera(cameraRig, { guide, height }, shell.vehicle, cameraProfile, SIM_DT);
shell.mountControls(switchVehicleAtSafeSpawn, () => {
  recoverVehicle({ guide, height, surfaces }, shell.vehicle, {
    state: shell.recovery,
    reason: 'manual',
    profile: selectedCircuit.playerRecoveryProfile,
  });
  resetCameraRig(cameraRig);
  resyncCircuitRaceProgress(raceProgress, raceRules, raceSample());
  camera = updateCamera(cameraRig, { guide, height }, shell.vehicle, cameraProfile, SIM_DT);
});

function tick(dt: number): void {
  input = inputManager.sample();

  const recovered = advanceCircuitDrivingActor(vehicleWorld, playerActor, {
    rules: raceRules,
    input,
    dt,
    profile: selectedCircuit.playerRecoveryProfile,
  });
  if (recovered !== null) resetCameraRig(cameraRig);
  for (const rival of rivals) {
    advanceCircuitDrivingActor(vehicleWorld, rival, {
      rules: raceRules,
      input: sampleRivalDrivingInput(guide, rival.vehicle, 0),
      dt,
      profile: selectedCircuit.rivalRecoveryProfile,
    });
  }
  camera = updateCamera(cameraRig, { guide, height }, shell.vehicle, cameraProfile, dt);
}

function render(): void {
  const spriteFamily = deriveVehicleSpriteFamily(shell.presentation);
  const rivalSprites = rivals.map((rival) =>
    createDynamicVehicleCourseSprite(
      rival.actorId,
      rival.vehicle,
      camera.yaw,
      spriteAssets[deriveVehicleSpriteFamily(vehicleCatalogEntryForId(rival.vehicle.profile.id))],
      height,
    ),
  );
  const stats = renderDriving(
    framebuffer,
    {
      background,
      guide,
      camera,
      vehicle: shell.vehicle,
      terrainProfile,
      groundProfile,
      worldSprites: rivalSprites,
      assets: spriteAssets,
      playerKind: spriteFamily,
    },
    {},
  );
  shell.present(selectedCourseMode.query, input, camera, stats.playerScreenY);
}

function switchVehicleAtSafeSpawn(profile: Readonly<CompiledArcadeVehicleProfile>): void {
  recoverVehicle({ guide, height, surfaces }, shell.vehicle, {
    state: shell.recovery,
    reason: 'manual',
    profile: selectedCircuit.playerRecoveryProfile,
  });
  shell.replacePlayer(profile, { guide, height, surfaces });
  resyncCircuitRaceProgress(raceProgress, raceRules, raceSample());
  camera = updateCamera(cameraRig, { guide, height }, shell.vehicle, cameraProfile, SIM_DT);
}

function raceSample(): { x: number; z: number; sWindow: number } {
  return { x: shell.vehicle.x, z: shell.vehicle.z, sWindow: shell.vehicle.course.s };
}

shell.start(tick, render);
