import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { resetCameraRig, updateCamera, type CameraState } from './camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import { SIM_DT } from './core/constants.js';
import {
  M8_3_LINEAR_PLAYER_START_L,
  M8_3_LINEAR_RECOVERY_PROFILE,
  createM83LinearHighwayRuntime,
} from './dev/m8-3-linear-highway.js';
import { advanceVehicleWithRecovery, recoverVehicle } from './gameplay/recovery.js';
import type { DrivingInput } from './input/driving-input.js';
import type { CompiledArcadeVehicleProfile } from './physics/vehicle-profiles.js';
import { renderDriving } from './render/renderer.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { createFarBackground } from './visual/far-background.js';
import { createSpriteAssets } from './visual/sprite-assets.js';

const runtime = createM83LinearHighwayRuntime();
const spriteAssets = createSpriteAssets();
const background = createFarBackground();
const shell = createBrowserDrivingShell(
  { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap },
  M8_3_LINEAR_PLAYER_START_L,
);
const { framebuffer, inputManager, cameraRig } = shell;
const cameraProfile = CURRENT_CAMERA_PROFILE;
let input: DrivingInput = { steering: 0, throttle: false, brake: false };
let camera: CameraState = updateCamera(
  cameraRig,
  { guide: runtime.guide, height: runtime.heightProfile },
  shell.vehicle,
  cameraProfile,
  SIM_DT,
);
shell.mountControls(switchVehicleAtSafeSpawn, () => {
  recoverVehicle({ guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap }, shell.vehicle, {
    state: shell.recovery,
    reason: 'manual',
    profile: M8_3_LINEAR_RECOVERY_PROFILE,
  });
  resetCameraRig(cameraRig);
  camera = updateCamera(
    cameraRig,
    { guide: runtime.guide, height: runtime.heightProfile },
    shell.vehicle,
    cameraProfile,
    SIM_DT,
  );
});

function tick(dt: number): void {
  input = inputManager.sample();
  const recovered = advanceVehicleWithRecovery(
    { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap },
    shell.vehicle,
    { state: shell.recovery, input, dt, profile: M8_3_LINEAR_RECOVERY_PROFILE },
  );
  if (recovered !== null) resetCameraRig(cameraRig);
  camera = updateCamera(
    cameraRig,
    { guide: runtime.guide, height: runtime.heightProfile },
    shell.vehicle,
    cameraProfile,
    dt,
  );
}

function render(): void {
  const spriteFamily = deriveVehicleSpriteFamily(shell.presentation);
  const stats = renderDriving(
    framebuffer,
    {
      background,
      guide: runtime.guide,
      camera,
      vehicle: shell.vehicle,
      terrainProfile: runtime.terrainProfile,
      groundProfile: runtime.groundProfile,
      worldSprites: [],
      assets: spriteAssets,
      playerKind: spriteFamily,
    },
    {},
  );
  shell.present('linear', input, camera, stats.playerScreenY);
}

function switchVehicleAtSafeSpawn(profile: Readonly<CompiledArcadeVehicleProfile>): void {
  recoverVehicle({ guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap }, shell.vehicle, {
    state: shell.recovery,
    reason: 'manual',
    profile: M8_3_LINEAR_RECOVERY_PROFILE,
  });
  shell.replacePlayer(profile, { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap });
  camera = updateCamera(
    cameraRig,
    { guide: runtime.guide, height: runtime.heightProfile },
    shell.vehicle,
    cameraProfile,
    SIM_DT,
  );
}

shell.start(tick, render);
