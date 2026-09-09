import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { CURRENT_M5_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import {
  resetM5CameraRig,
  updateM5Camera,
  type M5CameraState,
} from './camera/m5-camera.js';
import { SIM_DT } from './core/constants.js';
import {
  M8_3_LINEAR_PLAYER_START_L,
  M8_3_LINEAR_RECOVERY_PROFILE,
  createM83LinearHighwayRuntime,
} from './dev/m8-3-linear-highway.js';
import {
  recoverM5Vehicle,
  advanceVehicleWithRecovery,
} from './gameplay/recovery.js';
import type { DrivingInput } from './input/driving-input.js';
import type { CompiledArcadeVehicleProfile } from './physics/vehicle-profiles.js';
import { renderM5Driving } from './render/m5-renderer.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { createM3FarBackground } from './visual/far-background.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';

const runtime = createM83LinearHighwayRuntime();
const spriteAssets = createM4SpriteAssets();
const background = createM3FarBackground();
const shell = createBrowserDrivingShell({ guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap }, M8_3_LINEAR_PLAYER_START_L);
const { framebuffer, inputManager, cameraRig } = shell;
const cameraProfile = CURRENT_M5_CAMERA_PROFILE;
let input: DrivingInput = { steering: 0, throttle: false, brake: false };
let camera: M5CameraState = updateM5Camera(
  cameraRig,
  runtime.guide,
  runtime.heightProfile,
  shell.vehicle,
  cameraProfile,
  SIM_DT,
);
shell.mountControls(switchVehicleAtSafeSpawn, () => {
  recoverM5Vehicle(
    shell.recovery,
    runtime.guide,
    runtime.heightProfile,
    runtime.surfaceMap,
    shell.vehicle,
    'manual',
    M8_3_LINEAR_RECOVERY_PROFILE,
  );
  resetM5CameraRig(cameraRig);
  camera = updateM5Camera(
    cameraRig,
    runtime.guide,
    runtime.heightProfile,
    shell.vehicle,
    cameraProfile,
    SIM_DT,
  );
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
      runtime.guide,
      runtime.heightProfile,
      runtime.surfaceMap,
      shell.vehicle,
      input,
      SIM_DT,
      M8_3_LINEAR_RECOVERY_PROFILE,
    );
    if (recovered !== null) resetM5CameraRig(cameraRig);
    camera = updateM5Camera(
      cameraRig,
      runtime.guide,
      runtime.heightProfile,
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
  const spriteFamily = deriveVehicleSpriteFamily(shell.presentation);
  const stats = renderM5Driving(
    framebuffer,
    background,
    runtime.guide,
    camera,
    shell.vehicle,
    runtime.terrainProfile,
    runtime.groundProfile,
    [],
    spriteAssets,
    spriteFamily,
  );
  shell.present('linear', input, camera, stats.playerScreenY);
}

function switchVehicleAtSafeSpawn(profile: Readonly<CompiledArcadeVehicleProfile>): void {
  recoverM5Vehicle(
    shell.recovery,
    runtime.guide,
    runtime.heightProfile,
    runtime.surfaceMap,
    shell.vehicle,
    'manual',
    M8_3_LINEAR_RECOVERY_PROFILE,
  );
  shell.replacePlayer(profile, { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap });
  camera = updateM5Camera(
    cameraRig,
    runtime.guide,
    runtime.heightProfile,
    shell.vehicle,
    cameraProfile,
    SIM_DT,
  );
}

requestAnimationFrame(frame);
