import { browserVehicleProfileForKey } from './browser/vehicle-profile-selection.js';
import { mountMobileVehicleSelector } from './browser/mobile-selector-controls.js';
import { browserUsesTouchInterface } from './browser/touch-interface.js';
import { drawVehicleDebugHud } from './browser/vehicle-debug-hud.js';
import {
  createM5CameraRig,
  resetM5CameraRig,
  updateM5Camera,
  type M5CameraState,
} from './camera/m5-camera.js';
import { CURRENT_M5_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, SIM_DT } from './core/constants.js';
import {
  M8_3_LINEAR_COURSE_MODE,
  M8_3_LINEAR_PLAYER_START_L,
  M8_3_LINEAR_RECOVERY_PROFILE,
  createM83LinearHighwayRuntime,
} from './dev/m8-3-linear-highway.js';
import {
  createM5RecoveryState,
  recoverM5Vehicle,
  updateM5Recovery,
} from './gameplay/recovery.js';
import type { DrivingInput } from './input/driving-input.js';
import { InputManager } from './input/input-manager.js';
import {
  createArcadeVehicle,
  updateArcadeVehicle,
  type ArcadeVehicleState,
} from './physics/arcade-vehicle-physics.js';
import {
  FR_VEHICLE_PROFILE,
  type CompiledArcadeVehicleProfile,
} from './physics/vehicle-profiles.js';
import { renderM5Driving } from './render/m5-renderer.js';
import { SoftwareSurface } from './render/software-surface.js';
import { drawVehicleYawDebug } from './render/vehicle-yaw-debug.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { createM3FarBackground } from './visual/far-background.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';

const canvas = mustGet<HTMLCanvasElement>('game');
const steerLeftButton = mustGet<HTMLElement>('steer-left-button');
const steerRightButton = mustGet<HTMLElement>('steer-right-button');
const throttleButton = mustGet<HTMLElement>('throttle-button');
const brakeButton = mustGet<HTMLElement>('brake-button');
const vehicleSelectorButtons = mustGet<HTMLElement>('vehicle-selector-buttons');

canvas.width = LOGICAL_WIDTH;
canvas.height = LOGICAL_HEIGHT;
document.documentElement.classList.toggle('touch-capable', browserUsesTouchInterface());

const maybeContext = canvas.getContext('2d', { alpha: false });
if (!maybeContext) throw new Error('2D canvas context unavailable');
const ctx: CanvasRenderingContext2D = maybeContext;
ctx.imageSmoothingEnabled = false;

const imageData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
const framebufferPixels = new Uint32Array(imageData.data.buffer);
const framebuffer = new SoftwareSurface(LOGICAL_WIDTH, LOGICAL_HEIGHT, framebufferPixels);
const inputManager = new InputManager(
  steerLeftButton,
  steerRightButton,
  throttleButton,
  brakeButton,
);

const runtime = createM83LinearHighwayRuntime();
const spriteAssets = createM4SpriteAssets();
const background = createM3FarBackground();
let vehicle: ArcadeVehicleState = createArcadeVehicle(
  FR_VEHICLE_PROFILE,
  runtime.guide,
  runtime.heightProfile,
  runtime.surfaceMap,
  45,
  M8_3_LINEAR_PLAYER_START_L,
);
let recovery = createM5RecoveryState(vehicle);
const cameraRig = createM5CameraRig();
const cameraProfile = CURRENT_M5_CAMERA_PROFILE;
let input: DrivingInput = { steering: 0, throttle: false, brake: false };
let camera: M5CameraState = updateM5Camera(
  cameraRig,
  runtime.guide,
  runtime.heightProfile,
  vehicle,
  cameraProfile,
  SIM_DT,
);
const vehicleSelector = mountMobileVehicleSelector(
  vehicleSelectorButtons,
  vehicle.profile.id,
  selectVehicleProfile,
);

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const selectedProfile = browserVehicleProfileForKey(event.code);
  if (selectedProfile !== null) {
    selectVehicleProfile(selectedProfile);
    return;
  }
  if (event.code === 'Backspace') {
    event.preventDefault();
    recoverM5Vehicle(
      recovery,
      runtime.guide,
      runtime.heightProfile,
      runtime.surfaceMap,
      vehicle,
      'manual',
      M8_3_LINEAR_RECOVERY_PROFILE,
    );
    resetM5CameraRig(cameraRig);
    camera = updateM5Camera(
      cameraRig,
      runtime.guide,
      runtime.heightProfile,
      vehicle,
      cameraProfile,
      SIM_DT,
    );
    return;
  }
});

function selectVehicleProfile(profile: Readonly<CompiledArcadeVehicleProfile>): void {
  if (profile.id === vehicle.profile.id) return;
  switchVehicleAtSafeSpawn(profile);
  vehicleSelector.setActive(vehicle.profile.id);
}

let accumulator = 0;
let previousTime = performance.now();

function frame(now: number): void {
  const elapsed = Math.min((now - previousTime) / 1000, 0.25);
  previousTime = now;
  accumulator += elapsed;

  while (accumulator >= SIM_DT) {
    inputManager.update(SIM_DT);
    input = inputManager.sample();
    updateArcadeVehicle(
      runtime.guide,
      runtime.heightProfile,
      runtime.surfaceMap,
      vehicle,
      input,
      SIM_DT,
    );
    const recovered = updateM5Recovery(
      recovery,
      runtime.guide,
      runtime.heightProfile,
      runtime.surfaceMap,
      vehicle,
      SIM_DT,
      M8_3_LINEAR_RECOVERY_PROFILE,
    );
    if (recovered !== null) resetM5CameraRig(cameraRig);
    camera = updateM5Camera(
      cameraRig,
      runtime.guide,
      runtime.heightProfile,
      vehicle,
      cameraProfile,
      SIM_DT,
    );
    accumulator -= SIM_DT;
  }

  render();
  requestAnimationFrame(frame);
}

function render(): void {
  const spriteFamily = deriveVehicleSpriteFamily(vehicle);
  const stats = renderM5Driving(
    framebuffer,
    background,
    runtime.guide,
    camera,
    vehicle,
    runtime.terrainProfile,
    runtime.groundProfile,
    [],
    spriteAssets,
    spriteFamily,
  );
  ctx.putImageData(imageData, 0, 0);

  drawVehicleDebugHud(ctx, M8_3_LINEAR_COURSE_MODE.routeKind, input, vehicle);
  drawVehicleYawDebug(ctx, camera.playerScreenX, stats.playerScreenY, vehicle.yaw, camera.yaw);
}

function switchVehicleAtSafeSpawn(profile: Readonly<CompiledArcadeVehicleProfile>): void {
  recoverM5Vehicle(
    recovery,
    runtime.guide,
    runtime.heightProfile,
    runtime.surfaceMap,
    vehicle,
    'manual',
    M8_3_LINEAR_RECOVERY_PROFILE,
  );
  const spawnS = vehicle.course.s;
  const spawnL = vehicle.course.l;
  const speed = vehicle.longitudinalSpeed;
  vehicle = createArcadeVehicle(
    profile,
    runtime.guide,
    runtime.heightProfile,
    runtime.surfaceMap,
    spawnS,
    spawnL,
    speed,
  );
  recovery = createM5RecoveryState(vehicle);
  resetM5CameraRig(cameraRig);
  camera = updateM5Camera(
    cameraRig,
    runtime.guide,
    runtime.heightProfile,
    vehicle,
    cameraProfile,
    SIM_DT,
  );
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

requestAnimationFrame(frame);
