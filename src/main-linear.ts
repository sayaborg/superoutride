import { browserVehicleProfileForKey } from './browser/vehicle-profile-selection.js';
import { mountBrowserSteeringCalibrationControls } from './browser/steering-calibration-controls.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from './browser/tire-friction-selection.js';
import { mountBrowserTireFrictionControls } from './browser/tire-friction-controls.js';
import { mountBrowserEnginePowerControls } from './browser/engine-power-controls.js';
import { setEngineTorqueMultiplier } from './physics/automatic-powertrain.js';
import {
  mountMobileCameraYawSelector,
  mountMobileVehicleSelector,
} from './browser/mobile-selector-controls.js';
import { browserRequestsCameraYawToggle } from './browser/camera-yaw-mode-selection.js';
import { browserUsesTouchInterface } from './browser/touch-interface.js';
import { drawVehicleDebugHud } from './browser/vehicle-debug-hud.js';
import {
  createM5CameraRig,
  resetM5CameraRig,
  setM5CameraYawMode,
  toggleM5CameraYawMode,
  updateM5Camera,
  type M5CameraYawMode,
  type M5CameraState,
} from './camera/m5-camera.js';
import { CURRENT_M5_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, SIM_DT } from './core/constants.js';
import {
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
import type { CompiledArcadeVehicleProfile } from './physics/vehicle-profiles.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY } from './vehicle/vehicle-catalog.js';
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
const cameraSelectorButtons = mustGet<HTMLElement>('camera-selector-buttons');
const steeringOffsetSelectorButtons = mustGet<HTMLElement>('steering-offset-selector-buttons');
const maxSteerSelectorButtons = mustGet<HTMLElement>('max-steer-selector-buttons');
const steeringResponseSelectorButtons = mustGet<HTMLElement>('steering-response-selector-buttons');
const tireFrictionSelectorButtons = mustGet<HTMLElement>('tire-friction-selector-buttons');

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
  DEFAULT_VEHICLE_CATALOG_ENTRY.profile,
  runtime.guide,
  runtime.heightProfile,
  runtime.surfaceMap,
  45,
  M8_3_LINEAR_PLAYER_START_L,
  45,
  undefined,
  DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
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
const cameraYawSelector = mountMobileCameraYawSelector(
  cameraSelectorButtons,
  cameraRig.yawMode,
  selectCameraYawMode,
);
const steeringCalibrationControls = mountBrowserSteeringCalibrationControls(
  {
    steeringOffset: steeringOffsetSelectorButtons,
    maxRoadWheelSteer: maxSteerSelectorButtons,
    steeringResponse: steeringResponseSelectorButtons,
  },
  () => vehicle,
);
const tireFrictionControls = mountBrowserTireFrictionControls(
  tireFrictionSelectorButtons,
  () => vehicle,
);
const enginePowerControls = mountBrowserEnginePowerControls(
  tireFrictionSelectorButtons,
  () => vehicle,
);

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (browserRequestsCameraYawToggle(event.code)) {
    cameraYawSelector.setActive(toggleM5CameraYawMode(cameraRig));
    return;
  }
  if (steeringCalibrationControls.handleKey(event.code)) return;
  if (tireFrictionControls.handleKey(event.code)) return;
  if (enginePowerControls.handleKey(event.code)) return;
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

function selectCameraYawMode(mode: M5CameraYawMode): void {
  setM5CameraYawMode(cameraRig, mode);
  cameraYawSelector.setActive(mode);
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

  drawVehicleDebugHud(ctx, 'linear', input, vehicle);
  drawVehicleYawDebug(
    ctx,
    camera.playerScreenX,
    stats.playerScreenY,
    vehicle.yaw,
    camera.movementYaw,
    camera.yaw,
    camera.yawMode,
  );
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
  const steeringCalibration = vehicle.steeringCalibration;
  const tireFrictionCalibration = vehicle.tireFrictionCalibration;
  const engineTorqueMultiplier = vehicle.powertrain.engineTorqueMultiplier;
  vehicle = createArcadeVehicle(
    profile,
    runtime.guide,
    runtime.heightProfile,
    runtime.surfaceMap,
    spawnS,
    spawnL,
    speed,
    steeringCalibration,
    tireFrictionCalibration,
  );
  setEngineTorqueMultiplier(vehicle.powertrain, engineTorqueMultiplier);
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
