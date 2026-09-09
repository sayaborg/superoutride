import { selectBrowserCourseMode } from './browser/course-mode-selection.js';
import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { CURRENT_M5_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import {
  resetM5CameraRig,
  updateM5Camera,
  type M5CameraState,
} from './camera/m5-camera.js';
import { LOGICAL_HEIGHT, SIM_DT } from './core/constants.js';
import {
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from './core/presentation-scale.js';
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
import {
  createCircuitRaceProgressState,
  resyncCircuitRaceProgress,
  updateCircuitRaceProgress,
  type CircuitRaceProgressUpdate,
} from './gameplay/circuit-race-progress.js';
import {
  advanceRaceSession,
  createRaceSessionState,
} from './gameplay/race-session.js';
import {
  createM5RecoveryState,
  recoverM5Vehicle,
  advanceVehicleWithRecovery,
} from './gameplay/recovery.js';
import { sampleRivalDrivingInput } from './gameplay/rival-driver.js';
import type { DrivingInput } from './input/driving-input.js';
import { createArcadeVehicle } from './physics/arcade-vehicle-physics.js';
import type { CompiledArcadeVehicleProfile } from './physics/vehicle-profiles.js';
import { renderM5Driving } from './render/m5-renderer.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import type { TerrainVisualProfile } from './road/terrain-line.js';
import { createRivalRoster } from './runtime/rival-roster.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY, vehicleCatalogEntryForId } from './vehicle/vehicle-catalog.js';
import { createM3FarBackground } from './visual/far-background.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';
import { createDynamicVehicleCourseSprite } from './world/dynamic-vehicle-sprite.js';

const selectedCourseMode = selectBrowserCourseMode(
  new URLSearchParams(location.search).get('mode'),
);
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
  ? circuitBuilders[selectedCourseMode.query as keyof typeof circuitBuilders] : undefined;
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
const background = createM3FarBackground();
const spriteAssets = createM4SpriteAssets();

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
const rivalRoster = createRivalRoster(selectedCircuit.session);
const rivals = rivalRoster.map((entry) => {
  const rivalVehicle = createArcadeVehicle(
    DEFAULT_VEHICLE_CATALOG_ENTRY.profile,
    guide,
    height,
    surfaces,
    95 + entry.rivalIndex * 6,
    selectedCircuit.rivalStartL,
    undefined,
    undefined,
    undefined,
    DEFAULT_VEHICLE_CATALOG_ENTRY.torqueProtection,
  );
  return {
    actorId: entry.actorId,
    vehicle: rivalVehicle,
    recovery: createM5RecoveryState(rivalVehicle),
    raceProgress: createCircuitRaceProgressState(raceRules, {
      x: rivalVehicle.x,
      z: rivalVehicle.z,
      sWindow: rivalVehicle.course.s,
    }),
    raceSession: createRaceSessionState(),
  };
});

const cameraProfile = CURRENT_M5_CAMERA_PROFILE;

let input: DrivingInput = { steering: 0, throttle: false, brake: false };
let camera: M5CameraState = updateM5Camera(
  cameraRig,
  guide,
  height,
  shell.vehicle,
  cameraProfile,
  SIM_DT,
);
shell.mountControls(switchVehicleAtSafeSpawn, () => {
  recoverM5Vehicle(
    shell.recovery,
    guide,
    height,
    surfaces,
    shell.vehicle,
    'manual',
    selectedCircuit.playerRecoveryProfile,
  );
  resetM5CameraRig(cameraRig);
  resyncCircuitRaceProgress(raceProgress, raceRules, raceSample());
  camera = updateM5Camera(cameraRig, guide, height, shell.vehicle, cameraProfile, SIM_DT);
});

let accumulator = 0;
let previousTime = performance.now();

function frame(now: number): void {
  const elapsed = Math.min((now - previousTime) / 1000, 0.25);
  previousTime = now;
  accumulator += elapsed;

  while (accumulator >= SIM_DT) {
    input = inputManager.sample();

    const recovered = advanceVehicleWithRecovery(
      shell.recovery,
      guide,
      height,
      surfaces,
      shell.vehicle,
      input,
      SIM_DT,
      selectedCircuit.playerRecoveryProfile,
    );
    let raceUpdate: CircuitRaceProgressUpdate | null = null;
    if (recovered !== null) {
      resetM5CameraRig(cameraRig);
      resyncCircuitRaceProgress(raceProgress, raceRules, raceSample());
    } else {
      raceUpdate = updateCircuitRaceProgress(raceProgress, raceRules, raceSample());
    }
    advanceRaceSession(raceSession, raceProgress, raceUpdate, SIM_DT);

    for (const rival of rivals) {
      const rivalInput = sampleRivalDrivingInput(guide, rival.vehicle, 0);
      const rivalRecovered = advanceVehicleWithRecovery(
        rival.recovery,
        guide,
        height,
        surfaces,
        rival.vehicle,
        rivalInput,
        SIM_DT,
        selectedCircuit.rivalRecoveryProfile,
      );
      let rivalRaceUpdate: CircuitRaceProgressUpdate | null = null;
      if (rivalRecovered !== null) {
        resyncCircuitRaceProgress(rival.raceProgress, raceRules, {
          x: rival.vehicle.x,
          z: rival.vehicle.z,
          sWindow: rival.vehicle.course.s,
        });
      } else {
        rivalRaceUpdate = updateCircuitRaceProgress(rival.raceProgress, raceRules, {
          x: rival.vehicle.x,
          z: rival.vehicle.z,
          sWindow: rival.vehicle.course.s,
        });
      }
      advanceRaceSession(
        rival.raceSession,
        rival.raceProgress,
        rivalRaceUpdate,
        SIM_DT,
      );
    }
    camera = updateM5Camera(cameraRig, guide, height, shell.vehicle, cameraProfile, SIM_DT);
    accumulator -= SIM_DT;
  }

  render();
  requestAnimationFrame(frame);
}

function render(): void {
  const spriteFamily = deriveVehicleSpriteFamily(shell.presentation);
  const rivalSprites = rivals.map((rival) => createDynamicVehicleCourseSprite(
    rival.actorId,
    rival.vehicle,
    camera.yaw,
    spriteAssets[deriveVehicleSpriteFamily(vehicleCatalogEntryForId(rival.vehicle.profile.id))],
    height,
  ));
  const stats = renderM5Driving(
    framebuffer,
    background,
    guide,
    camera,
    shell.vehicle,
    terrainProfile,
    groundProfile,
    rivalSprites,
    spriteAssets,
    spriteFamily,
  );
  shell.present(selectedCourseMode.query, input, camera, stats.playerScreenY);
}

function switchVehicleAtSafeSpawn(profile: Readonly<CompiledArcadeVehicleProfile>): void {
  recoverM5Vehicle(
    shell.recovery,
    guide,
    height,
    surfaces,
    shell.vehicle,
    'manual',
    selectedCircuit.playerRecoveryProfile,
  );
  shell.replacePlayer(profile, { guide, height, surfaces });
  resyncCircuitRaceProgress(raceProgress, raceRules, raceSample());
}

function raceSample(): { x: number; z: number; sWindow: number } {
  return { x: shell.vehicle.x, z: shell.vehicle.z, sWindow: shell.vehicle.course.s };
}

requestAnimationFrame(frame);
