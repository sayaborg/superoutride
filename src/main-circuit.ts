import { LOGICAL_HEIGHT, LOGICAL_WIDTH, SIM_DT } from './core/constants.js';
import { browserVehicleProfileForKey } from './browser/vehicle-profile-selection.js';
import {
  BROWSER_STEERING_RESPONSE_CYCLE_CODE,
  BROWSER_YAW_PREVIEW_CYCLE_CODE,
  DEFAULT_BROWSER_STEERING_CALIBRATION,
  browserSelfSteerGainForKey,
  nextBrowserSteeringResponseRate,
  nextBrowserYawPreviewTime,
  type BrowserSelfSteerGain,
  type BrowserYawPreviewTime,
} from './browser/steering-calibration-selection.js';
import {
  mountMobileCameraYawSelector,
  mountMobileSelfSteerGainSelector,
  mountMobileSteeringResponseSelector,
  mountMobileVehicleSelector,
  mountMobileYawPreviewSelector,
} from './browser/mobile-selector-controls.js';
import { browserRequestsCameraYawToggle } from './browser/camera-yaw-mode-selection.js';
import { browserUsesTouchInterface } from './browser/touch-interface.js';
import { drawVehicleDebugHud } from './browser/vehicle-debug-hud.js';
import { CURRENT_M5_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import {
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from './core/presentation-scale.js';
import {
  M7_1_HIGHWAY_RECOVERY_PROFILE,
  M7_1_HIGHWAY_RIVAL_RECOVERY_PROFILE,
  M7_1_PLAYER_START_L,
  M7_1_RIVAL_START_L,
  createM71HighwayGroundProfile,
} from './dev/m7-1-highway-calibration-course.js';
import {
  M9_1_DEV_COURSE_MODE,
  createM91LowMidSpeedMountainCircuitRuntime,
} from './dev/m9-1-low-mid-speed-mountain-circuit.js';
import {
  createM5CameraRig,
  resetM5CameraRig,
  setM5CameraYawMode,
  toggleM5CameraYawMode,
  updateM5Camera,
  type M5CameraYawMode,
  type M5CameraState,
} from './camera/m5-camera.js';
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
  updateM5Recovery,
} from './gameplay/recovery.js';
import { sampleRivalDrivingInput } from './gameplay/rival-driver.js';
import { InputManager } from './input/input-manager.js';
import type { DrivingInput } from './input/driving-input.js';
import {
  createArcadeVehicle,
  setArcadeVehicleSteeringYawPreviewTime,
  setArcadeVehicleSymmetricSteeringActuatorRate,
  setArcadeVehicleTravelDirectionSteeringGain,
  updateArcadeVehicle,
  type ArcadeVehicleState,
} from './physics/arcade-vehicle-physics.js';
import {
  FR_VEHICLE_PROFILE,
  type CompiledArcadeVehicleProfile,
} from './physics/vehicle-profiles.js';
import { renderM5Driving } from './render/m5-renderer.js';
import { drawVehicleYawDebug } from './render/vehicle-yaw-debug.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { SoftwareSurface } from './render/software-surface.js';
import type { TerrainVisualProfile } from './road/terrain-line.js';
import { createRivalRoster } from './runtime/rival-roster.js';
import { createM3FarBackground } from './visual/far-background.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';
import { createDynamicVehicleCourseSprite } from './world/dynamic-vehicle-sprite.js';

const canvas = mustGet<HTMLCanvasElement>('game');
const steerLeftButton = mustGet<HTMLElement>('steer-left-button');
const steerRightButton = mustGet<HTMLElement>('steer-right-button');
const throttleButton = mustGet<HTMLElement>('throttle-button');
const brakeButton = mustGet<HTMLElement>('brake-button');
const vehicleSelectorButtons = mustGet<HTMLElement>('vehicle-selector-buttons');
const cameraSelectorButtons = mustGet<HTMLElement>('camera-selector-buttons');
const selfSteerSelectorButtons = mustGet<HTMLElement>('self-steer-selector-buttons');
const yawPreviewSelectorButtons = mustGet<HTMLElement>('yaw-preview-selector-buttons');
const steeringResponseSelectorButtons = mustGet<HTMLElement>('steering-response-selector-buttons');

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

const live = createM91LowMidSpeedMountainCircuitRuntime();
const windowRuntime = live.window;
const raceRules = live.raceRules;
const guide = windowRuntime.guide;
const height = windowRuntime.height;
const surfaces = windowRuntime.surface;
const background = createM3FarBackground();
const spriteAssets = createM4SpriteAssets();

const groundProfile = createM71HighwayGroundProfile();
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

let vehicle: ArcadeVehicleState = createArcadeVehicle(
  FR_VEHICLE_PROFILE,
  guide,
  height,
  surfaces,
  45,
  M7_1_PLAYER_START_L,
  45,
  DEFAULT_BROWSER_STEERING_CALIBRATION,
);
let recovery = createM5RecoveryState(vehicle);
const raceProgress = createCircuitRaceProgressState(raceRules, raceSample());
const raceSession = createRaceSessionState();
const rivalRoster = createRivalRoster(M9_1_DEV_COURSE_MODE);
const rivals = rivalRoster.map((entry) => {
  const rivalVehicle = createArcadeVehicle(
    FR_VEHICLE_PROFILE,
    guide,
    height,
    surfaces,
    95 + entry.rivalIndex * 6,
    M7_1_RIVAL_START_L,
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
const cameraRig = createM5CameraRig();

const cameraProfile = CURRENT_M5_CAMERA_PROFILE;

let input: DrivingInput = { steering: 0, throttle: false, brake: false };
let camera: M5CameraState = updateM5Camera(
  cameraRig,
  guide,
  height,
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
const selfSteerGainSelector = mountMobileSelfSteerGainSelector(
  selfSteerSelectorButtons,
  vehicle.steeringCalibration.travelDirectionGain,
  selectSelfSteerGain,
);
const yawPreviewSelector = mountMobileYawPreviewSelector(
  yawPreviewSelectorButtons,
  vehicle.steeringCalibration.yawPreviewTime,
  selectYawPreviewTime,
);
const steeringResponseSelector = mountMobileSteeringResponseSelector(
  steeringResponseSelectorButtons,
  vehicle.steeringCalibration.steeringActuatorResponse.applyRate,
  selectSteeringResponseRate,
);

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (browserRequestsCameraYawToggle(event.code)) {
    cameraYawSelector.setActive(toggleM5CameraYawMode(cameraRig));
    return;
  }
  if (event.code === BROWSER_YAW_PREVIEW_CYCLE_CODE) {
    selectYawPreviewTime(nextBrowserYawPreviewTime(vehicle.steeringCalibration.yawPreviewTime));
    return;
  }
  if (event.code === BROWSER_STEERING_RESPONSE_CYCLE_CODE) {
    selectSteeringResponseRate(nextBrowserSteeringResponseRate(
      vehicle.steeringCalibration.steeringActuatorResponse.applyRate,
    ));
    return;
  }
  const selectedSelfSteerGain = browserSelfSteerGainForKey(event.code);
  if (selectedSelfSteerGain !== null) {
    selectSelfSteerGain(selectedSelfSteerGain);
    return;
  }
  const selectedProfile = browserVehicleProfileForKey(event.code);
  if (selectedProfile !== null) {
    selectVehicleProfile(selectedProfile);
    return;
  }
  if (event.code === 'Backspace') {
    event.preventDefault();
    recoverM5Vehicle(
      recovery,
      guide,
      height,
      surfaces,
      vehicle,
      'manual',
      M7_1_HIGHWAY_RECOVERY_PROFILE,
    );
    resetM5CameraRig(cameraRig);
    resyncCircuitRaceProgress(raceProgress, raceRules, raceSample());
    camera = updateM5Camera(cameraRig, guide, height, vehicle, cameraProfile, SIM_DT);
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

function selectSelfSteerGain(gain: BrowserSelfSteerGain): void {
  setArcadeVehicleTravelDirectionSteeringGain(vehicle, gain);
  selfSteerGainSelector.setActive(gain);
}

function selectYawPreviewTime(yawPreviewTime: BrowserYawPreviewTime): void {
  setArcadeVehicleSteeringYawPreviewTime(vehicle, yawPreviewTime);
  yawPreviewSelector.setActive(yawPreviewTime);
}

function selectSteeringResponseRate(rate: number): void {
  setArcadeVehicleSymmetricSteeringActuatorRate(vehicle, rate);
  steeringResponseSelector.setActive(rate);
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

    updateArcadeVehicle(guide, height, surfaces, vehicle, input, SIM_DT);

    const recovered = updateM5Recovery(
      recovery,
      guide,
      height,
      surfaces,
      vehicle,
      SIM_DT,
      M7_1_HIGHWAY_RECOVERY_PROFILE,
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
      updateArcadeVehicle(guide, height, surfaces, rival.vehicle, rivalInput, SIM_DT);
      const rivalRecovered = updateM5Recovery(
        rival.recovery,
        guide,
        height,
        surfaces,
        rival.vehicle,
        SIM_DT,
        M7_1_HIGHWAY_RIVAL_RECOVERY_PROFILE,
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
    camera = updateM5Camera(cameraRig, guide, height, vehicle, cameraProfile, SIM_DT);
    accumulator -= SIM_DT;
  }

  render();
  requestAnimationFrame(frame);
}

function render(): void {
  const spriteFamily = deriveVehicleSpriteFamily(vehicle);
  const rivalSprites = rivals.map((rival) => createDynamicVehicleCourseSprite(
    rival.actorId,
    rival.vehicle,
    camera.yaw,
    spriteAssets.car,
    height,
  ));
  const stats = renderM5Driving(
    framebuffer,
    background,
    guide,
    camera,
    vehicle,
    terrainProfile,
    groundProfile,
    rivalSprites,
    spriteAssets,
    spriteFamily,
  );
  ctx.putImageData(imageData, 0, 0);
  drawVehicleDebugHud(ctx, M9_1_DEV_COURSE_MODE.routeKind, input, vehicle);
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
    guide,
    height,
    surfaces,
    vehicle,
    'manual',
    M7_1_HIGHWAY_RECOVERY_PROFILE,
  );
  const s = vehicle.course.s;
  const l = vehicle.course.l;
  const speed = vehicle.longitudinalSpeed;
  const steeringCalibration = vehicle.steeringCalibration;
  vehicle = createArcadeVehicle(
    profile,
    guide,
    height,
    surfaces,
    s,
    l,
    speed,
    steeringCalibration,
  );
  recovery = createM5RecoveryState(vehicle);
  resetM5CameraRig(cameraRig);
  resyncCircuitRaceProgress(raceProgress, raceRules, raceSample());
}

function raceSample(): { x: number; z: number; sWindow: number } {
  return { x: vehicle.x, z: vehicle.z, sWindow: vehicle.course.s };
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

requestAnimationFrame(frame);
