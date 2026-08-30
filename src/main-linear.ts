import { COURSE_MODE_HOTKEY_LABEL } from './browser/course-mode-selection.js';
import {
  createM5CameraRig,
  resetM5CameraRig,
  updateM5Camera,
  type M5CameraState,
} from './camera/m5-camera.js';
import { CURRENT_M5_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, SIM_DT } from './core/constants.js';
import { PLAYER_PIXELS_PER_METER } from './core/presentation-scale.js';
import { pseudoDepth, pseudoProject } from './core/projection.js';
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
import { createM5Car, updateM5Car, type M5CarState } from './physics/car-physics.js';
import { createM5Bike, updateM5Bike, type M5BikeState } from './physics/motorcycle-physics.js';
import { renderM5Driving } from './render/m5-renderer.js';
import { SoftwareSurface } from './render/software-surface.js';
import {
  drawCarSteeringHud,
  formatVehicleControlHud,
  formatVehicleSuspensionHud,
} from './render/vehicle-control-hud.js';
import { drawVehicleYawDebug } from './render/vehicle-yaw-debug.js';
import { createM3FarBackground } from './visual/far-background.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';

const canvas = mustGet<HTMLCanvasElement>('game');
const steerLeftButton = mustGet<HTMLElement>('steer-left-button');
const steerRightButton = mustGet<HTMLElement>('steer-right-button');
const throttleButton = mustGet<HTMLElement>('throttle-button');
const brakeButton = mustGet<HTMLElement>('brake-button');

canvas.width = LOGICAL_WIDTH;
canvas.height = LOGICAL_HEIGHT;
document.documentElement.classList.toggle('touch-capable', isTouchCapable());

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
let vehicle: M5CarState | M5BikeState = createM5Car(
  runtime.guide,
  runtime.heightProfile,
  runtime.surfaceMap,
  45,
  M8_3_LINEAR_PLAYER_START_L,
);
let vehicleKind: 'car' | 'bike' = 'car';
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

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'KeyR') {
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
  if (event.code === 'KeyV') switchVehicleAtSafeSpawn();
});

let accumulator = 0;
let previousTime = performance.now();

function frame(now: number): void {
  const elapsed = Math.min((now - previousTime) / 1000, 0.25);
  previousTime = now;
  accumulator += elapsed;

  while (accumulator >= SIM_DT) {
    inputManager.update(SIM_DT);
    input = inputManager.sample();
    if (vehicleKind === 'car') {
      updateM5Car(
        runtime.guide,
        runtime.heightProfile,
        runtime.surfaceMap,
        vehicle as M5CarState,
        input,
        SIM_DT,
      );
    } else {
      updateM5Bike(
        runtime.guide,
        runtime.heightProfile,
        runtime.surfaceMap,
        vehicle as M5BikeState,
        input,
        SIM_DT,
      );
    }
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
    vehicleKind,
  );
  ctx.putImageData(imageData, 0, 0);

  const playerProjection = pseudoProject(
    { x: vehicle.x, y: vehicle.presentationY, z: vehicle.z, s: vehicle.course.s },
    camera,
  );
  const controlHud = formatVehicleControlHud(vehicle.control, vehicle.powertrain, vehicle.speed);
  const bodySlipAngle = Math.atan2(
    vehicle.lateralSpeed,
    Math.max(0.01, vehicle.longitudinalSpeed),
  );

  ctx.fillStyle = '#d7f3ff';
  ctx.font = 'bold 16px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('SUPER OUTRIDE', 8, 6);
  ctx.fillStyle = '#a6bac4';
  ctx.font = '9px monospace';
  ctx.fillText(`M8.7 COURSE DEBUG ${M8_3_LINEAR_COURSE_MODE.routeKind} / ${vehicleKind === 'car' ? 'CAR' : 'MOTORCYCLE'} SWITCH [V] RECOVER [R]`, 8, 23);
  ctx.fillText(controlHud.instruments, 8, 36);
  ctx.fillText(`S ${vehicle.course.s.toFixed(1).padStart(7)} / ${runtime.guide.length.toFixed(0)}  L ${formatSigned(vehicle.course.l)}  ${vehicle.surfaceType.padEnd(8)} ${vehicle.supported ? 'LOAD' : 'FREE'}`, 8, 48);
  ctx.fillText(`ST ${formatSigned(input.steering, 1)}  ${input.throttle ? 'THR' : '---'}  ${input.brake ? 'BRK' : '---'}  YAW ${formatSigned(vehicle.yaw * 180 / Math.PI, 1)}deg`, 8, 60);
  ctx.fillText(formatVehicleSuspensionHud(vehicle), 8, 72);
  ctx.fillText('FINITE OPEN 0..8000m / NO BRANCH / NO MODULO / NO LAP', 8, 84);
  ctx.fillText(COURSE_MODE_HOTKEY_LABEL, 8, 96);
  ctx.fillText(`D ${pseudoDepth(vehicle.course.s, camera.s).toFixed(2)}  ${playerProjection.scale.toFixed(2)} px/m  CENTER X ${camera.playerScreenX.toFixed(1)}`, 8, 108);
  ctx.fillText(`World CG authority / FIXED PLAYER SCALE 2.0m=80px (${PLAYER_PIXELS_PER_METER} px/m)`, 8, 229);
  if (vehicleKind === 'car') {
    drawCarSteeringHud(ctx, input.steering, vehicle.control, bodySlipAngle);
  }
  drawVehicleYawDebug(ctx, camera.playerScreenX, stats.playerScreenY, vehicle.yaw, camera.yaw);
}

function switchVehicleAtSafeSpawn(): void {
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
  vehicleKind = vehicleKind === 'car' ? 'bike' : 'car';
  vehicle = vehicleKind === 'car'
    ? createM5Car(runtime.guide, runtime.heightProfile, runtime.surfaceMap, spawnS, spawnL)
    : createM5Bike(runtime.guide, runtime.heightProfile, runtime.surfaceMap, spawnS, spawnL);
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

function formatSigned(value: number, digits = 2): string {
  const normalized = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return `${normalized >= 0 ? '+' : '-'}${Math.abs(normalized).toFixed(digits)}`;
}

function isTouchCapable(): boolean {
  return navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

requestAnimationFrame(frame);
