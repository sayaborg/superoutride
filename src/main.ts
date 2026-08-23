import { LOGICAL_HEIGHT, LOGICAL_WIDTH, SIM_DT } from './core/constants.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS, PLAYER_PIXELS_PER_METER } from './core/presentation-scale.js';
import { createM2StadiumGuide } from './core/debug-course.js';
import { pseudoDepth, pseudoProject } from './core/projection.js';
import { compileSurfaceRegions } from './compiler/surface-region-compiler.js';
import { M6_13_JUNCTION, sampleM613RightBranchTargetL } from './dev/m6-13-junction.js';
import { createM615VisibleRouteBoundaryGateSet } from './dev/m6-15-visible-route-gates.js';
import { createM5DebugSurfaceRegionAuthoring } from './dev/m5-surface-authoring.js';
import { createM5CameraRig, resetM5CameraRig, updateM5Camera, type M5CameraProfile, type M5CameraState } from './dev/m5-camera.js';
import {
  createGeometricCourseTracker,
  createM6DebugRaceRules,
  createRaceProgressState,
  getRaceProgressWindow,
  resyncGeometricCourseTracker,
  resyncRaceProgressPosition,
  updateGeometricCourseTracker,
  updateRaceProgress,
  type RaceProgressUpdate,
} from './gameplay/race-progress.js';
import {
  advanceRaceSession,
  createRaceSessionState,
  formatRaceTime,
  rankRaceProgress,
} from './gameplay/race-session.js';
import { createM5RecoveryState, recoverM5Vehicle, updateM5Recovery } from './gameplay/recovery.js';
import { sampleRivalDrivingInput } from './gameplay/rival-driver.js';
import { observeRouteBoundaryCrossing } from './gameplay/route-boundary-gates.js';
import { createM6DebugRouteDag, createRouteDagState, updateRouteDag } from './gameplay/route-dag.js';
import { InputManager } from './input/input-manager.js';
import type { DrivingInput } from './input/driving-input.js';
import { createM5Car, updateM5Car, type M5CarState } from './physics/car-physics.js';
import { adoptM5BikeKinematics, adoptM5CarKinematics, createM5Bike, updateM5Bike, type M5BikeState } from './physics/motorcycle-physics.js';
import { CyclicSurfaceMap } from './physics/surface-map.js';
import { renderM5Driving } from './render/m5-renderer.js';
import { SoftwareSurface } from './render/software-surface.js';
import type { TerrainVisualProfile } from './road/terrain-line.js';
import { loadM5BakedGroundMap } from './visual/baked-ground-map.js';
import { createM3FarBackground } from './visual/far-background.js';
import { createM3DebugHeightProfile } from './visual/height-profile.js';
import type { GroundMapProfile } from './visual/ground-map.js';
import {
  createM5TunnelPresentation,
  selectM5FarBackground,
} from './visual/m5-9-tunnel.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from './visual/visual-profile.js';
import { createDynamicVehicleCourseSprite } from './world/dynamic-vehicle-sprite.js';
import { createM4DebugWorldSprites } from './world/m4-debug-world.js';
import { createM5TunnelWorldSprites } from './world/m5-9-tunnel-world.js';

const canvas = mustGet<HTMLCanvasElement>('game');
const steeringPad = mustGet<HTMLElement>('steering-pad');
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

const inputManager = new InputManager(steeringPad, throttleButton, brakeButton);
const guide = createM2StadiumGuide();
const heightProfile = createM3DebugHeightProfile(guide.length);
const surfaceAuthoring = createM5DebugSurfaceRegionAuthoring(guide.length);
const compiledSurfaces = compileSurfaceRegions(guide.length, surfaceAuthoring);
const bakedGroundMap = await loadM5BakedGroundMap();
if (Math.abs(bakedGroundMap.metadata.courseLength - guide.length) > 1e-7) {
  throw new Error('baked GroundMap course length does not match runtime course');
}
const visualProfile = new CyclicVisualProfile(guide.length, compiledSurfaces.visualSections);
const surfaceMap = new CyclicSurfaceMap(guide.length, compiledSurfaces.surfaceSections, M6_13_JUNCTION);
const outdoorFarBackground = createM3FarBackground();
const tunnelPresentation = createM5TunnelPresentation(guide.length, CURRENT_CAMERA_DISTANCE_METERS);
const spriteAssets = createM4SpriteAssets();
const staticWorldSprites = [
  ...createM4DebugWorldSprites(guide, heightProfile, spriteAssets),
  ...createM5TunnelWorldSprites(guide, heightProfile, tunnelPresentation),
];

const car = createM5Car(guide, heightProfile, surfaceMap, 45);
const bike = createM5Bike(guide, heightProfile, surfaceMap, 45);
let vehicle: M5CarState | M5BikeState = car;
let vehicleKind: 'car' | 'bike' = 'car';
const rival = createM5Car(guide, heightProfile, surfaceMap, 95);

const cameraRig = createM5CameraRig();
const recovery = createM5RecoveryState(vehicle);
const rivalRecovery = createM5RecoveryState(rival);
const raceRules = createM6DebugRaceRules(guide);
const geometricCourse = createGeometricCourseTracker(guide.length, vehicle.course.s);
const raceProgress = createRaceProgressState(raceRules, raceSample());
const rivalRaceProgress = createRaceProgressState(raceRules, rivalRaceSample());
const raceSession = createRaceSessionState();
const rivalRaceSession = createRaceSessionState();
const routeDag = createM6DebugRouteDag();
const routeGates = createM615VisibleRouteBoundaryGateSet(routeDag, guide);
const routeState = createRouteDagState(routeDag);
let previousRoutePoint = { x: vehicle.x, z: vehicle.z };

const cameraProfile: M5CameraProfile = {
  dCam: CURRENT_CAMERA_DISTANCE_METERS,
  lCamMax: 12,
  height: 2.469902425419539,
  pitch: (8 * Math.PI) / 180,
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  centerX: 160,
  centerY: 120,
  kPsi: 0.65,
  thetaLagMax: (20 * Math.PI) / 180,
  sDotMin: 8,
  tauLat: 0.18,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
  playerSafeXMin: 48,
  playerSafeXMax: 272,
};

const groundProfile: GroundMapProfile = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  shoulderWidth: 1,
  junction: M6_13_JUNCTION,
  logical: compiledSurfaces.groundMap,
  baked: bakedGroundMap,
};

const terrainProfile: TerrainVisualProfile = {
  screenHeight: LOGICAL_HEIGHT,
  dMin: 2.5,
  dMax: 150,
  groundLeft: groundProfile.groundLeft,
  groundRight: groundProfile.groundRight,
  roadLeft: groundProfile.roadLeft,
  roadRight: groundProfile.roadRight,
  height: heightProfile,
  visual: visualProfile,
  thinSpanScreenRows: 1,
};

let input: DrivingInput = { steering: 0, throttle: false, brake: false };

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'KeyR') {
    recoverM5Vehicle(recovery, guide, heightProfile, surfaceMap, vehicle, 'manual');
    resetM5CameraRig(cameraRig);
    resyncGeometricCourseTracker(geometricCourse, guide.length, vehicle.course.s);
    resyncRaceProgressPosition(raceProgress, raceRules, raceSample());
    previousRoutePoint = { x: vehicle.x, z: vehicle.z };
    camera = updateM5Camera(cameraRig, guide, heightProfile, vehicle, cameraProfile, SIM_DT);
    return;
  }
  if (event.code !== 'KeyV') return;
  if (vehicleKind === 'car') {
    adoptM5BikeKinematics(bike, vehicle);
    vehicle = bike;
    vehicleKind = 'bike';
  } else {
    adoptM5CarKinematics(car, vehicle as M5BikeState);
    vehicle = car;
    vehicleKind = 'car';
  }
});
let accumulator = 0;
let previousTime = performance.now();
let camera: M5CameraState = updateM5Camera(cameraRig, guide, heightProfile, vehicle, cameraProfile, SIM_DT);

function frame(now: number): void {
  const elapsed = Math.min((now - previousTime) / 1000, 0.25);
  previousTime = now;
  accumulator += elapsed;

  while (accumulator >= SIM_DT) {
    inputManager.update(SIM_DT);
    input = inputManager.sample();
    if (vehicleKind === 'car') updateM5Car(guide, heightProfile, surfaceMap, vehicle, input, SIM_DT);
    else updateM5Bike(guide, heightProfile, surfaceMap, vehicle as M5BikeState, input, SIM_DT);

    const recovered = updateM5Recovery(recovery, guide, heightProfile, surfaceMap, vehicle, SIM_DT);
    let raceUpdate: RaceProgressUpdate | null = null;
    if (recovered !== null) {
      resetM5CameraRig(cameraRig);
      resyncGeometricCourseTracker(geometricCourse, guide.length, vehicle.course.s);
      resyncRaceProgressPosition(raceProgress, raceRules, raceSample());
      previousRoutePoint = { x: vehicle.x, z: vehicle.z };
    } else {
      updateGeometricCourseTracker(geometricCourse, guide.length, vehicle.course.s);
      raceUpdate = updateRaceProgress(raceProgress, raceRules, raceSample());
      const currentRoutePoint = { x: vehicle.x, z: vehicle.z };
      const routeObservation = observeRouteBoundaryCrossing(
        routeDag,
        routeState,
        routeGates,
        previousRoutePoint,
        currentRoutePoint,
      );
      updateRouteDag(routeState, routeDag, routeObservation.boundary);
      previousRoutePoint = currentRoutePoint;
    }
    advanceRaceSession(raceSession, raceProgress, raceUpdate, SIM_DT);

    const rivalTargetL = sampleM613RightBranchTargetL(rival.course.s);
    const rivalInput = sampleRivalDrivingInput(guide, rival, rivalTargetL);
    updateM5Car(guide, heightProfile, surfaceMap, rival, rivalInput, SIM_DT);
    const rivalRecovered = updateM5Recovery(rivalRecovery, guide, heightProfile, surfaceMap, rival, SIM_DT);
    let rivalRaceUpdate: RaceProgressUpdate | null = null;
    if (rivalRecovered !== null) {
      resyncRaceProgressPosition(rivalRaceProgress, raceRules, rivalRaceSample());
    } else {
      rivalRaceUpdate = updateRaceProgress(rivalRaceProgress, raceRules, rivalRaceSample());
    }
    advanceRaceSession(rivalRaceSession, rivalRaceProgress, rivalRaceUpdate, SIM_DT);

    camera = updateM5Camera(cameraRig, guide, heightProfile, vehicle, cameraProfile, SIM_DT);
    accumulator -= SIM_DT;
  }

  render();
  requestAnimationFrame(frame);
}

function render(): void {
  const selectedBackground = selectM5FarBackground(
    camera.s,
    guide.length,
    outdoorFarBackground,
    tunnelPresentation,
  );
  const rivalSprite = createDynamicVehicleCourseSprite('RIVAL', rival, camera.yaw, spriteAssets.car);
  const renderWorldSprites = [...staticWorldSprites, rivalSprite];
  const stats = renderM5Driving(
    framebuffer,
    selectedBackground.background,
    guide,
    camera,
    vehicle,
    terrainProfile,
    groundProfile,
    renderWorldSprites,
    spriteAssets,
    vehicleKind,
  );
  ctx.putImageData(imageData, 0, 0);

  const standings = rankRaceProgress([
    {
      competitorId: 'PLAYER',
      sProgress: raceProgress.sProgress,
      validatedProgressFloor: raceProgress.validatedProgressFloor,
    },
    {
      competitorId: 'RIVAL',
      sProgress: rivalRaceProgress.sProgress,
      validatedProgressFloor: rivalRaceProgress.validatedProgressFloor,
    },
  ]);
  const playerStanding = standings.find((entry) => entry.competitorId === 'PLAYER')!;

  const playerProjection = pseudoProject(
    { x: vehicle.x, y: vehicle.y, z: vehicle.z, s: vehicle.course.s },
    camera,
  );
  const dCar = pseudoDepth(vehicle.course.s, camera.s, guide.length);
  const roadDeltaDeg = camera.vehicleGuideYawDelta * 180 / Math.PI;
  const slipDeg = Math.atan2(vehicle.lateralSpeed, Math.max(0.01, vehicle.longitudinalSpeed)) * 180 / Math.PI;
  const bankDeg = vehicleKind === 'bike' ? (vehicle as M5BikeState).bankAngle * 180 / Math.PI : vehicle.sprungRoll * 180 / Math.PI;
  const nextGate = raceRules.gates[raceProgress.nextGateIndex]!;
  const progressWindow = getRaceProgressWindow(raceProgress, raceRules);
  const bestBoundary = raceSession.bestBoundaryIntervalSeconds === null
    ? '--:--.---'
    : formatRaceTime(raceSession.bestBoundaryIntervalSeconds);
  const junctionSection = M6_13_JUNCTION.sample(vehicle.course.s);

  ctx.fillStyle = '#d7f3ff';
  ctx.font = 'bold 13px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('SUPER OUTRIDE', 8, 6);
  ctx.fillStyle = '#a6bac4';
  ctx.font = '9px monospace';
  ctx.fillText(`M6.15 VISIBLE ROUTE GATES / ${vehicleKind === 'car' ? 'CAR' : 'MOTORCYCLE'} [V]  RECOVER [R]`, 8, 23);
  ctx.fillText(`SPD ${(vehicle.speed * 3.6).toFixed(0).padStart(3)} km/h  ${vehicle.surfaceType.padEnd(8)} ${vehicle.supported ? 'GROUND' : 'AIR'}  BG ${selectedBackground.kind}`, 8, 36);
  ctx.fillText(`S ${vehicle.course.s.toFixed(1).padStart(6)}  L ${formatSigned(vehicle.course.l)}  JCT ${junctionSection.phase}`, 8, 48);
  ctx.fillText(`STEER ${formatSigned(vehicle.steerAngle * 180 / Math.PI, 1)}deg  SLIP ${formatSigned(slipDeg, 1)}deg`, 8, 60);
  ctx.fillText(`YAW ${formatSigned(roadDeltaDeg, 1)}deg  RATE ${formatSigned(vehicle.yawRate * 180 / Math.PI, 1)}deg/s  BANK ${formatSigned(bankDeg, 1)}`, 8, 72);
  ctx.fillText(`D ${dCar.toFixed(2)}  ${playerProjection.scale.toFixed(2)} px/m  CAR 2m=${(2 * playerProjection.scale).toFixed(0)}px`, 8, 84);
  ctx.fillText(`TL ${stats.terrainLineCount} SPR ${stats.visibleSpriteCount}  GM LOD 0-${stats.groundMapMaxLevel}  ${stats.activeSection}`, 8, 96);
  ctx.fillText(`LOAD T ${stats.terrainOutputPixels}/${stats.terrainOutputPixelsPerScreenRowMax}  S ${stats.spriteOutputSamplesIncludingPlayer}/${stats.spriteOutputSamplesPerScanlineMax}`, 8, 108);
  ctx.fillText(`POS ${playerStanding.rank}/2  YOU ${raceProgress.sProgress.toFixed(1)}  RIVAL ${rivalRaceProgress.sProgress.toFixed(1)}`, 8, 120);
  ctx.fillText(`NEXT ${nextGate.name}  WIN ${progressWindow.floor.toFixed(0)}..${progressWindow.ceiling.toFixed(0)}  CUT ${raceProgress.shortcutViolationCount}`, 8, 132);
  ctx.fillText(`TIME ${formatRaceTime(raceSession.elapsedSeconds)}  BND ${raceSession.boundaryTimings.length}  BEST ${bestBoundary}`, 8, 144);
  ctx.fillText(`ROUTE ${routeState.activeStageId}  ${routeState.status}  EVT ${routeState.lastEvent}`, 8, 156);
  if (camera.playerSafetyActive) {
    ctx.fillStyle = '#ffd08a';
    ctx.fillText(`PLAYER SAFETY CAMERA  X ${camera.playerScreenX.toFixed(1)}`, 8, 168);
    ctx.fillStyle = '#a6bac4';
  }

  ctx.fillStyle = '#8fa3ad';
  ctx.fillText('Route = physical L/R gate crossing only; median selects nothing', 8, 207);
  ctx.fillText('Junction = one (s,l) strip: widen road -> grow median -> two asphalt bands', 8, 218);
  ctx.fillText(`World physics unchanged / FIXED PLAYER SCALE 2.0m=80px (${PLAYER_PIXELS_PER_METER} px/m)`, 8, 229);
}

function raceSample(): { x: number; z: number; sLocal: number } {
  return { x: vehicle.x, z: vehicle.z, sLocal: vehicle.course.s };
}

function rivalRaceSample(): { x: number; z: number; sLocal: number } {
  return { x: rival.x, z: rival.z, sLocal: rival.course.s };
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
