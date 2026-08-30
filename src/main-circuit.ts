import { LOGICAL_HEIGHT, LOGICAL_WIDTH, SIM_DT } from './core/constants.js';
import { COURSE_MODE_HOTKEY_LABEL } from './browser/course-mode-selection.js';
import { CURRENT_M5_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import {
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
  PLAYER_PIXELS_PER_METER,
} from './core/presentation-scale.js';
import { pseudoDepth, pseudoProject } from './core/projection.js';
import {
  M7_1_HIGHWAY_RECOVERY_PROFILE,
  M7_1_HIGHWAY_RIVAL_RECOVERY_PROFILE,
  M7_1_PLAYER_START_L,
  M7_1_RIVAL_START_L,
  createM71HighwayGroundProfile,
} from './dev/m7-1-highway-calibration-course.js';
import {
  M8_7_DEV_COURSE_MODE,
  createM87VariedElevationCircuitRuntime,
} from './dev/m8-7-varied-elevation-circuit.js';
import {
  createM5CameraRig,
  resetM5CameraRig,
  updateM5Camera,
  type M5CameraState,
} from './camera/m5-camera.js';
import {
  createCircuitRaceProgressState,
  getCircuitRaceProgressWindow,
  getValidatedCircuitLapCount,
  resyncCircuitRaceProgress,
  updateCircuitRaceProgress,
  type CircuitRaceProgressUpdate,
} from './gameplay/circuit-race-progress.js';
import { decomposeCircuitChainage } from './gameplay/circuit-topology.js';
import {
  advanceRaceSession,
  createRaceSessionState,
  formatRaceTime,
  rankRaceProgress,
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
  updateArcadeVehicle,
  type ArcadeVehicleState,
} from './physics/arcade-vehicle-physics.js';
import { BIKE_VEHICLE_PROFILE, CAR_VEHICLE_PROFILE } from './physics/vehicle-profiles.js';
import { renderM5Driving } from './render/m5-renderer.js';
import {
  drawCarSteeringHud,
  formatVehicleControlHud,
  formatVehicleSuspensionHud,
} from './render/vehicle-control-hud.js';
import { drawVehicleYawDebug } from './render/vehicle-yaw-debug.js';
import {
  deriveVehicleLeanRadians,
  deriveVehicleSpriteFamily,
  formatVehiclePresentationName,
} from './render/vehicle-presentation.js';
import { SoftwareSurface } from './render/software-surface.js';
import type { TerrainVisualProfile } from './road/terrain-line.js';
import { circuitWindowToUnwrappedChainage } from './runtime/circuit-runtime-window.js';
import { createRivalRoster } from './runtime/rival-roster.js';
import { createM3FarBackground } from './visual/far-background.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';
import { createDynamicVehicleCourseSprite } from './world/dynamic-vehicle-sprite.js';

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

const live = createM87VariedElevationCircuitRuntime();
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
  CAR_VEHICLE_PROFILE,
  guide,
  height,
  surfaces,
  45,
  M7_1_PLAYER_START_L,
);
let recovery = createM5RecoveryState(vehicle);
const raceProgress = createCircuitRaceProgressState(raceRules, raceSample());
const raceSession = createRaceSessionState();
const rivalRoster = createRivalRoster(M8_7_DEV_COURSE_MODE);
const rivals = rivalRoster.map((entry) => {
  const rivalVehicle = createArcadeVehicle(
    CAR_VEHICLE_PROFILE,
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

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'KeyR') {
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
  if (event.code !== 'KeyV') return;
  switchVehicleAtSafeSpawn();
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

  const playerProjection = pseudoProject(
    { x: vehicle.x, y: vehicle.presentationY, z: vehicle.z, s: vehicle.course.s },
    camera,
  );
  const dCar = pseudoDepth(vehicle.course.s, camera.s);
  const roadDeltaDeg = camera.vehicleGuideYawDelta * 180 / Math.PI;
  const bodySlipAngle = Math.atan2(vehicle.lateralSpeed, Math.max(0.01, vehicle.longitudinalSpeed));
  const slipDeg = bodySlipAngle * 180 / Math.PI;
  const bankDeg = spriteFamily === 'bike'
    ? deriveVehicleLeanRadians(vehicle) * 180 / Math.PI
    : 0;
  const controlHud = formatVehicleControlHud(vehicle.control, vehicle.powertrain, vehicle.speed);
  const suspensionHud = formatVehicleSuspensionHud(vehicle);
  const progressWindow = getCircuitRaceProgressWindow(raceProgress, raceRules);
  const validatedLaps = getValidatedCircuitLapCount(raceProgress);
  const unwrappedS = circuitWindowToUnwrappedChainage(windowRuntime, vehicle.course.s);
  const topologyPosition = decomposeCircuitChainage(windowRuntime.topology, unwrappedS);
  const standings = rankRaceProgress([
    {
      competitorId: 'PLAYER',
      sProgress: raceProgress.sProgress,
      validatedProgressFloor: raceProgress.validatedProgressFloor,
      finishElapsedSeconds: raceProgress.status === 'FINISHED'
        ? raceSession.boundaryTimings.at(-1)?.elapsedSeconds ?? null
        : null,
    },
    ...rivals.map((rival) => ({
      competitorId: rival.actorId,
      sProgress: rival.raceProgress.sProgress,
      validatedProgressFloor: rival.raceProgress.validatedProgressFloor,
      finishElapsedSeconds: rival.raceProgress.status === 'FINISHED'
        ? rival.raceSession.boundaryTimings.at(-1)?.elapsedSeconds ?? null
        : null,
    })),
  ]);
  const playerStanding = standings.find((entry) => entry.competitorId === 'PLAYER')!;
  const firstRival = rivals[0] ?? null;
  const nextGate = raceProgress.status === 'FINISHED'
    ? null
    : raceRules.gates[raceProgress.nextGateIndex] ?? null;
  const finalBoundarySeconds = raceSession.boundaryTimings.at(-1)?.elapsedSeconds ?? raceSession.elapsedSeconds;
  const raceState = raceProgress.status === 'FINISHED'
    ? `FINISHED ${formatRaceTime(finalBoundarySeconds)}`
    : 'RUNNING';

  ctx.fillStyle = '#d7f3ff';
  ctx.font = 'bold 13px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('SUPER OUTRIDE', 8, 6);
  ctx.fillStyle = '#a6bac4';
  ctx.font = '9px monospace';
  ctx.fillText(`M9.0 COURSE DEBUG ${M8_7_DEV_COURSE_MODE.routeKind} / ${formatVehiclePresentationName(vehicle)} SWITCH [V] RECOVER [R]`, 8, 23);
  ctx.fillText(controlHud.instruments, 8, 36);
  ctx.fillText(`S ${vehicle.course.s.toFixed(1).padStart(7)} L ${formatSigned(vehicle.course.l)} ${vehicle.surfaceType.padEnd(8)} ${vehicle.supported ? 'LOAD' : 'FREE'}`, 8, 48);
  ctx.fillText(`LAP ${validatedLaps}/${raceRules.lapCount}  POS ${playerStanding.rank}/${standings.length}  EVT ${raceProgress.lastEvent}`, 8, 60);
  ctx.fillText(`NEXT ${nextGate?.name ?? 'NONE'}  WIN ${progressWindow.floor.toFixed(0)}..${progressWindow.ceiling.toFixed(0)}`, 8, 72);
  ctx.fillText(`PROG ${raceProgress.sProgress.toFixed(1)}  R1 ${firstRival?.raceProgress.sProgress.toFixed(1) ?? 'NONE'}  CUT ${raceProgress.shortcutViolationCount}`, 8, 84);
  ctx.fillText(`TIME ${formatRaceTime(raceSession.elapsedSeconds)}  ${raceState}`, 8, 96);
  ctx.fillText(`${controlHud.steering}  SLIP ${formatSigned(slipDeg, 1)}deg`, 8, 108);
  ctx.fillText(`YAW ${formatSigned(roadDeltaDeg, 1)}deg  RATE ${formatSigned(vehicle.yawRate * 180 / Math.PI, 1)}deg/s  BANK ${formatSigned(bankDeg, 1)}deg`, 8, 120);
  ctx.fillText(suspensionHud, 8, 132);
  ctx.fillText(controlHud.pedals, 8, 144);
  ctx.fillText(`LAP ${(raceRules.lapLength / 1000).toFixed(3)}km / WINDOW ${windowRuntime.repeatCount} copies / RACE ${raceRules.lapCount} laps`, 8, 156);
  ctx.fillText(`WINDOW ${topologyPosition.winding}/${windowRuntime.repeatCount - 1}`, 8, 168);
  ctx.fillText('Physical CPs + forward FINISH are lap authority; winding is not.', 8, 180);
  ctx.fillText(`D ${dCar.toFixed(2)}  ${playerProjection.scale.toFixed(2)} px/m  CENTER X ${camera.playerScreenX.toFixed(1)}`, 8, 192);
  ctx.fillStyle = raceProgress.status === 'FINISHED' ? '#ffd08a' : '#8fa3ad';
  ctx.fillText(
    raceProgress.status === 'FINISHED'
      ? 'THREE-LAP CIRCUIT FINISH / extra open runout remains live'
      : `CIRCUIT FIELD: ${rivals.length} DEV rival / ordinary open runtime`,
    8,
    207,
  );
  ctx.fillStyle = '#8fa3ad';
  ctx.fillText(COURSE_MODE_HOTKEY_LABEL, 8, 218);
  ctx.fillText(`World CG authority / FIXED PLAYER SCALE 2.0m=80px (${PLAYER_PIXELS_PER_METER} px/m)`, 8, 229);
  if (vehicle.profile.id === 'CAR') {
    drawCarSteeringHud(ctx, input.steering, vehicle.control, bodySlipAngle);
  }
  drawVehicleYawDebug(ctx, camera.playerScreenX, stats.playerScreenY, vehicle.yaw, camera.yaw);
}

function switchVehicleAtSafeSpawn(): void {
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
  vehicle = createArcadeVehicle(
    vehicle.profile.id === 'CAR' ? BIKE_VEHICLE_PROFILE : CAR_VEHICLE_PROFILE,
    guide,
    height,
    surfaces,
    s,
    l,
    speed,
  );
  recovery = createM5RecoveryState(vehicle);
  resetM5CameraRig(cameraRig);
  resyncCircuitRaceProgress(raceProgress, raceRules, raceSample());
}

function raceSample(): { x: number; z: number; sWindow: number } {
  return { x: vehicle.x, z: vehicle.z, sWindow: vehicle.course.s };
}

function formatSigned(value: number, digits = 2): string {
  const normalized = Math.abs(value) < 0.0005 ? 0 : value;
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
