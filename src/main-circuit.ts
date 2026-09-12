import { composeBrowserCourseContent } from './browser/course-mode-selection.js';
import { createTerrainVisualProfile } from './runtime/stage-authoring-compiler.js';
import { createBrowserDrivingShell } from './browser/driving-shell.js';
import {
  createFiscoGroundProfile,
  createFiscoRuntime,
  FISCO_DEV_SESSION_CONFIGURATION,
  FISCO_PLAYER_RECOVERY_PROFILE,
  FISCO_PLAYER_START_L,
  FISCO_RIVAL_RECOVERY_PROFILE,
  FISCO_RIVAL_START_L,
} from './dev/courses/fisco-circuit.js';
import {
  createTsukubaCourse2000Runtime,
  createTsukubaGroundProfile,
  TSUKUBA_PLAYER_RECOVERY_PROFILE,
  TSUKUBA_PLAYER_START_L,
  TSUKUBA_RIVAL_RECOVERY_PROFILE,
  TSUKUBA_RIVAL_START_L,
  TSUKUBA_SESSION_CONFIGURATION,
} from './dev/courses/tsukuba-circuit.js';
import { createCircuitRaceProgressState, resyncCircuitRaceProgress } from './gameplay/circuit-race-progress.js';
import { createRaceSessionState } from './gameplay/race-session.js';
import { createRecoveryState } from './gameplay/recovery.js';
import { sampleRivalDrivingInput } from './gameplay/rival-driver.js';
import type { DrivingInput } from './input/driving-input.js';
import { createArcadeVehicle } from './physics/arcade-vehicle-physics.js';
import { createDynamicVehicleCourseSprite } from './render/dynamic-vehicle-sprite.js';
import { renderDriving } from './render/renderer.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { advanceCircuitDrivingActor, type CircuitDrivingActor } from './runtime/circuit-driving-tick.js';
import { createRivalRoster } from './runtime/rival-roster.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY, vehicleCatalogEntryForId } from './vehicle/vehicle-catalog.js';
import { createFarBackground } from './visual/far-background.js';
import { createSpriteAssets } from './visual/sprite-assets.js';

const { mode: selectedCourseMode, content: selectedCircuit } = composeBrowserCourseContent(
  'CIRCUIT',
  {
    fisco: () => ({
      session: FISCO_DEV_SESSION_CONFIGURATION,
      playerRecoveryProfile: FISCO_PLAYER_RECOVERY_PROFILE,
      playerStartL: FISCO_PLAYER_START_L,
      rivalRecoveryProfile: FISCO_RIVAL_RECOVERY_PROFILE,
      rivalStartL: FISCO_RIVAL_START_L,
      live: createFiscoRuntime(),
      groundProfile: createFiscoGroundProfile(),
    }),
    circuit: () => ({
      session: TSUKUBA_SESSION_CONFIGURATION,
      playerRecoveryProfile: TSUKUBA_PLAYER_RECOVERY_PROFILE,
      playerStartL: TSUKUBA_PLAYER_START_L,
      rivalRecoveryProfile: TSUKUBA_RIVAL_RECOVERY_PROFILE,
      rivalStartL: TSUKUBA_RIVAL_START_L,
      live: createTsukubaCourse2000Runtime(),
      groundProfile: createTsukubaGroundProfile(),
    }),
  },
  new URLSearchParams(location.search).get('mode'),
);

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
const terrainProfile = createTerrainVisualProfile(groundProfile, height, windowRuntime.visual);

const shell = createBrowserDrivingShell({ guide, height, surfaces }, selectedCircuit.playerStartL);
const { framebuffer, inputManager } = shell;
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

let input: DrivingInput = { steering: 0, throttle: false, brake: false };
const lifecycle = shell.mountControls({
  world: () => vehicleWorld,
  recoveryProfile: selectedCircuit.playerRecoveryProfile,
  resync: () => resyncCircuitRaceProgress(raceProgress, raceRules, raceSample()),
});

function tick(dt: number): void {
  input = inputManager.sample();

  const recovered = advanceCircuitDrivingActor(vehicleWorld, playerActor, {
    rules: raceRules,
    input,
    dt,
    profile: selectedCircuit.playerRecoveryProfile,
  });
  for (const rival of rivals) {
    advanceCircuitDrivingActor(vehicleWorld, rival, {
      rules: raceRules,
      input: sampleRivalDrivingInput(guide, rival.vehicle, 0),
      dt,
      profile: selectedCircuit.rivalRecoveryProfile,
    });
  }
  lifecycle.update(dt, recovered !== null);
}

function render(): void {
  const { camera } = lifecycle;
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

function raceSample(): { x: number; z: number; sWindow: number } {
  return { x: shell.vehicle.x, z: shell.vehicle.z, sWindow: shell.vehicle.course.s };
}

shell.start(tick, render);
