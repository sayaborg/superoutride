import { LOGICAL_HEIGHT, LOGICAL_WIDTH, SIM_DT } from './core/constants.js';
import {
  guideCoordinateCurve,
  locateWorldOnGuideCoordinateGlobal,
} from './core/guide-coordinate-frame.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS, PLAYER_PIXELS_PER_METER } from './core/presentation-scale.js';
import { createM2StadiumGuide } from './dev/debug-course.js';
import { pseudoDepth, pseudoProject } from './core/projection.js';
import { compileSurfaceRegions } from './compiler/surface-region-compiler.js';
import { M6_13_JUNCTION } from './dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from './dev/m6-27-live-route-runtime.js';
import { createM640RivalRouteChoicePlan } from './dev/m6-40-rival-live-route.js';
import { M6_43_DEV_COURSE_MODE } from './dev/m6-43-course-mode.js';
import { createM5DebugSurfaceRegionAuthoring } from './dev/m5-surface-authoring.js';
import {
  createM5CameraRig,
  rebaseM5CameraRigCoordinateFrame,
  resetM5CameraRig,
  updateM5Camera,
  type M5CameraProfile,
  type M5CameraState,
} from './camera/m5-camera.js';
import { lockedBranchRecoveryApproach } from './gameplay/branch-violation.js';
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
import {
  M5_RECOVERY_PROFILE,
  createM5RecoveryState,
  recoverM5Vehicle,
  recoverM5VehicleToGuideCoordinate,
  updateM5Recovery,
  type M5RecoveryState,
  type M5VehicleState,
} from './gameplay/recovery.js';
import { sampleRivalDrivingInput } from './gameplay/rival-driver.js';
import {
  createSharedRouteChoiceState,
  getSharedRouteChoiceLock,
} from './gameplay/shared-route-choice-authority.js';
import {
  POINT_TO_POINT_OBJECTIVE,
  createRunObjectiveState,
  createValidatedRunFinishFromRoute,
  updateRunObjectiveFromValidatedFinish,
} from './gameplay/run-objective.js';
import { InputManager } from './input/input-manager.js';
import type { DrivingInput } from './input/driving-input.js';
import { createM5Car, updateM5Car, type M5CarState } from './physics/car-physics.js';
import { adoptM5BikeKinematics, adoptM5CarKinematics, createM5Bike, updateM5Bike, type M5BikeState } from './physics/motorcycle-physics.js';
import { SurfaceMap } from './physics/surface-map.js';
import { renderM5Driving } from './render/m5-renderer.js';
import { SoftwareSurface } from './render/software-surface.js';
import type { TerrainVisualProfile } from './road/terrain-line.js';
import { advanceLiveRouteMultiActorTick } from './runtime/live-route-multi-actor-tick.js';
import {
  createLiveRouteTravelerState,
  liveRouteTravelersShareRuntimePackage,
  resyncLiveRouteTraveler,
  resolveLiveRouteTravelerRuntime,
  sampleLiveRouteChoicePlanTargetL,
  sampleLiveRouteChoiceTargetL,
  type LiveRouteTravelerState,
} from './runtime/live-route-traveler.js';
import { createRivalRoster } from './runtime/rival-roster.js';
import {
  resolveActiveStageRuntimeContent,
  type StageRuntimeContentPackage,
} from './runtime/stage-runtime-content.js';
import { loadM5BakedGroundMap } from './visual/baked-ground-map.js';
import { createM3FarBackground } from './visual/far-background.js';
import { createM3DebugHeightProfile } from './visual/height-profile.js';
import type { GroundMapProfile } from './visual/ground-map.js';
import {
  createM5TunnelPresentation,
  selectM5FarBackground,
} from './visual/m5-9-tunnel.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';
import { VisualProfile } from './visual/visual-profile.js';
import { createDynamicVehicleCourseSprite } from './world/dynamic-vehicle-sprite.js';
import { createM4DebugWorldSprites } from './dev/m4-debug-world.js';
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
const visualProfile = new VisualProfile(guide.length, compiledSurfaces.visualSections);
const surfaceMap = new SurfaceMap(guide.length, compiledSurfaces.surfaceSections, M6_13_JUNCTION);
const outdoorFarBackground = createM3FarBackground();
const tunnelPresentation = createM5TunnelPresentation(guide.length, CURRENT_CAMERA_DISTANCE_METERS);
const spriteAssets = createM4SpriteAssets();
const staticWorldSprites = [
  ...createM4DebugWorldSprites(guide, heightProfile, spriteAssets),
  ...createM5TunnelWorldSprites(guide, heightProfile, tunnelPresentation),
];

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

const car = createM5Car(guide, heightProfile, surfaceMap, 45);
const bike = createM5Bike(guide, heightProfile, surfaceMap, 45);
let vehicle: M5CarState | M5BikeState = car;
let vehicleKind: 'car' | 'bike' = 'car';

const cameraRig = createM5CameraRig();
const recovery = createM5RecoveryState(vehicle);
const raceRules = createM6DebugRaceRules(guide);
const geometricCourse = createGeometricCourseTracker(guide.length, vehicle.course.s);
const raceProgress = createRaceProgressState(raceRules, raceSample());
const raceSession = createRaceSessionState();

const liveRoute = createM627LiveRouteRuntime(
  guide,
  {
    heightProfile,
    surfaceMap,
    terrainProfile,
    groundProfile,
    selectFarBackground: (cameraS) => selectM5FarBackground(
      cameraS,
      guide.length,
      outdoorFarBackground,
      tunnelPresentation,
    ).background,
    worldSprites: staticWorldSprites,
  },
  spriteAssets,
);
const playerTraveler = createLiveRouteTravelerState(liveRoute, { x: vehicle.x, z: vehicle.z });
const routeState = playerTraveler.routeState;
const routeHandoffState = playerTraveler.handoffState;
const stageRuntimeRegistry = liveRoute.registry;
const runObjective = createRunObjectiveState();
const rivalRoster = createRivalRoster(M6_43_DEV_COURSE_MODE);
const rivalRoutePlan = createM640RivalRouteChoicePlan(liveRoute);
const rivals = rivalRoster.map((entry) => {
  const rivalVehicle = createM5Car(
    guide,
    heightProfile,
    surfaceMap,
    95 + entry.rivalIndex * 6,
  );
  return {
    actorId: entry.actorId,
    vehicle: rivalVehicle,
    recovery: createM5RecoveryState(rivalVehicle),
    raceProgress: createRaceProgressState(raceRules, {
      x: rivalVehicle.x,
      z: rivalVehicle.z,
      sLocal: rivalVehicle.course.s,
    }),
    raceSession: createRaceSessionState(),
    traveler: createLiveRouteTravelerState(liveRoute, { x: rivalVehicle.x, z: rivalVehicle.z }),
    routePlan: rivalRoutePlan,
  };
});
const sharedRouteChoices = createSharedRouteChoiceState(M6_43_DEV_COURSE_MODE.sharedRouteChoiceMode);

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

let input: DrivingInput = { steering: 0, throttle: false, brake: false };

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'KeyR') {
    const runtime = activeRuntime();
    recoverM5Vehicle(recovery, runtime.coordinateFrame, runtime.heightProfile, runtime.surfaceMap, vehicle, 'manual');
    resetM5CameraRig(cameraRig);
    if (isParentRaceDiagnostic(runtime)) {
      resyncGeometricCourseTracker(geometricCourse, guide.length, vehicle.course.s);
      resyncRaceProgressPosition(raceProgress, raceRules, raceSample());
    }
    resyncLiveRouteTraveler(liveRoute, playerTraveler, { x: vehicle.x, z: vehicle.z });
    camera = updateM5Camera(
      cameraRig,
      runtime.coordinateFrame,
      runtime.heightProfile,
      vehicle,
      cameraProfile,
      SIM_DT,
    );
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
const initialRuntime = activeRuntime();
let camera: M5CameraState = updateM5Camera(
  cameraRig,
  initialRuntime.coordinateFrame,
  initialRuntime.heightProfile,
  vehicle,
  cameraProfile,
  SIM_DT,
);

function frame(now: number): void {
  const elapsed = Math.min((now - previousTime) / 1000, 0.25);
  previousTime = now;
  accumulator += elapsed;

  while (accumulator >= SIM_DT) {
    inputManager.update(SIM_DT);
    input = inputManager.sample();

    // Phase 1: finish every actor's world physics before any route authority is mutated.
    const runtimeBefore = activeRuntime();
    const parentDiagnosticBefore = isParentRaceDiagnostic(runtimeBefore);
    if (vehicleKind === 'car') {
      updateM5Car(
        runtimeBefore.coordinateFrame,
        runtimeBefore.heightProfile,
        runtimeBefore.surfaceMap,
        vehicle,
        input,
        SIM_DT,
      );
    } else {
      updateM5Bike(
        runtimeBefore.coordinateFrame,
        runtimeBefore.heightProfile,
        runtimeBefore.surfaceMap,
        vehicle as M5BikeState,
        input,
        SIM_DT,
      );
    }

    const recovered = updateM5Recovery(
      recovery,
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      vehicle,
      SIM_DT,
    );
    let raceUpdate: RaceProgressUpdate | null = null;
    if (recovered !== null) {
      resetM5CameraRig(cameraRig);
      if (parentDiagnosticBefore) {
        resyncGeometricCourseTracker(geometricCourse, guide.length, vehicle.course.s);
        resyncRaceProgressPosition(raceProgress, raceRules, raceSample());
      }
      resyncLiveRouteTraveler(liveRoute, playerTraveler, { x: vehicle.x, z: vehicle.z });
    } else if (parentDiagnosticBefore) {
      updateGeometricCourseTracker(geometricCourse, guide.length, vehicle.course.s);
      raceUpdate = updateRaceProgress(raceProgress, raceRules, raceSample());
    }

    const rivalFrames = rivals.map((rival) => {
      const rivalRuntimeBefore = resolveLiveRouteTravelerRuntime(liveRoute, rival.traveler);
      const rivalParentDiagnosticBefore = isParentRaceDiagnostic(rivalRuntimeBefore);
      const sharedLock = getSharedRouteChoiceLock(
        sharedRouteChoices,
        rival.traveler.handoffState.activeStageId,
      );
      const rivalTargetL = sharedLock === null
        ? sampleLiveRouteChoicePlanTargetL(
          liveRoute,
          rival.traveler,
          rival.routePlan,
          rival.vehicle.course.s,
        )
        : sampleLiveRouteChoiceTargetL(
          liveRoute,
          rival.traveler,
          sharedLock.choiceId,
          rival.vehicle.course.s,
        );
      const rivalInput = sampleRivalDrivingInput(
        rivalRuntimeBefore.coordinateFrame,
        rival.vehicle,
        rivalTargetL,
      );
      updateM5Car(
        rivalRuntimeBefore.coordinateFrame,
        rivalRuntimeBefore.heightProfile,
        rivalRuntimeBefore.surfaceMap,
        rival.vehicle,
        rivalInput,
        SIM_DT,
      );
      const rivalRecovered = updateM5Recovery(
        rival.recovery,
        rivalRuntimeBefore.coordinateFrame,
        rivalRuntimeBefore.heightProfile,
        rivalRuntimeBefore.surfaceMap,
        rival.vehicle,
        SIM_DT,
      );
      let rivalRaceUpdate: RaceProgressUpdate | null = null;
      if (rivalRecovered !== null) {
        if (rivalParentDiagnosticBefore) {
          resyncRaceProgressPosition(rival.raceProgress, raceRules, {
            x: rival.vehicle.x,
            z: rival.vehicle.z,
            sLocal: rival.vehicle.course.s,
          });
        }
        resyncLiveRouteTraveler(
          liveRoute,
          rival.traveler,
          { x: rival.vehicle.x, z: rival.vehicle.z },
        );
      } else if (rivalParentDiagnosticBefore) {
        rivalRaceUpdate = updateRaceProgress(rival.raceProgress, raceRules, {
          x: rival.vehicle.x,
          z: rival.vehicle.z,
          sLocal: rival.vehicle.course.s,
        });
      }
      return {
        rival,
        runtimeBefore: rivalRuntimeBefore,
        parentDiagnosticBefore: rivalParentDiagnosticBefore,
        recovered: rivalRecovered,
        raceUpdate: rivalRaceUpdate,
      };
    });

    // Phase 2: observe the complete field, arbitrate once, then apply actor route/handoff transactions.
    const routeTick = advanceLiveRouteMultiActorTick(
      liveRoute,
      sharedRouteChoices,
      [
        {
          actorId: 'PLAYER',
          state: playerTraveler,
          currentWorldPoint: { x: vehicle.x, z: vehicle.z },
          observeRouteBoundary: recovered === null,
        },
        ...rivalFrames.map(({ rival, recovered: rivalRecovered }) => ({
          actorId: rival.actorId,
          state: rival.traveler,
          currentWorldPoint: { x: rival.vehicle.x, z: rival.vehicle.z },
          observeRouteBoundary: rivalRecovered === null,
        })),
      ],
    );
    const playerRouteTick = routeTick.actors[0]!;
    const routeUpdate = playerRouteTick.routeUpdate;

    if (playerRouteTick.branchViolation !== null) {
      recoverActorToLockedBranch(
        runtimeBefore,
        recovery,
        vehicle,
        playerTraveler,
        playerRouteTick.branchViolation.lockedChoiceId,
      );
      resetM5CameraRig(cameraRig);
      if (parentDiagnosticBefore) {
        resyncGeometricCourseTracker(geometricCourse, guide.length, vehicle.course.s);
        resyncRaceProgressPosition(raceProgress, raceRules, raceSample());
      }
    } else if (playerRouteTick.committed) {
      const runtimeAfter = activeRuntime();
      vehicle.course = { ...routeHandoffState.coordinate };
      rebaseM5CameraRigCoordinateFrame(
        cameraRig,
        runtimeBefore.coordinateFrame,
        runtimeAfter.coordinateFrame,
      );
    }
    for (let rivalIndex = 0; rivalIndex < rivalFrames.length; rivalIndex += 1) {
      const rivalFrame = rivalFrames[rivalIndex]!;
      const rivalRouteTick = routeTick.actors[rivalIndex + 1]!;
      if (rivalRouteTick.actorId !== rivalFrame.rival.actorId) {
        throw new Error('multi-actor route tick changed roster order');
      }
      if (rivalRouteTick.branchViolation !== null) {
        recoverActorToLockedBranch(
          rivalFrame.runtimeBefore,
          rivalFrame.rival.recovery,
          rivalFrame.rival.vehicle,
          rivalFrame.rival.traveler,
          rivalRouteTick.branchViolation.lockedChoiceId,
        );
        if (rivalFrame.parentDiagnosticBefore) {
          resyncRaceProgressPosition(rivalFrame.rival.raceProgress, raceRules, {
            x: rivalFrame.rival.vehicle.x,
            z: rivalFrame.rival.vehicle.z,
            sLocal: rivalFrame.rival.vehicle.course.s,
          });
        }
      } else if (rivalRouteTick.committed) {
        rivalFrame.rival.vehicle.course = { ...rivalFrame.rival.traveler.handoffState.coordinate };
      }
    }

    // A validated point-to-point finish records the objective; it does not pause DEV simulation.
    const finish = createValidatedRunFinishFromRoute(routeState, routeUpdate);
    updateRunObjectiveFromValidatedFinish(
      runObjective,
      POINT_TO_POINT_OBJECTIVE,
      finish,
      raceSession.elapsedSeconds + SIM_DT,
    );
    advanceRaceSession(raceSession, raceProgress, raceUpdate, SIM_DT);
    for (const rivalFrame of rivalFrames) {
      advanceRaceSession(
        rivalFrame.rival.raceSession,
        rivalFrame.rival.raceProgress,
        rivalFrame.raceUpdate,
        SIM_DT,
      );
    }

    const runtimeAfterTick = activeRuntime();
    camera = updateM5Camera(
      cameraRig,
      runtimeAfterTick.coordinateFrame,
      runtimeAfterTick.heightProfile,
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
  const runtime = activeRuntime();
  const selectedBackground = runtime.selectFarBackground(camera.s);
  const backgroundDiagnosticKind = isParentRaceDiagnostic(runtime)
    ? selectM5FarBackground(
        camera.s,
        guide.length,
        outdoorFarBackground,
        tunnelPresentation,
      ).kind
    : runtime.packageId;
  const rivalSprites = rivals.flatMap((rival) => {
    const rivalRuntime = resolveLiveRouteTravelerRuntime(liveRoute, rival.traveler);
    if (!liveRouteTravelersShareRuntimePackage(runtime, rivalRuntime)) return [];
    return [createDynamicVehicleCourseSprite(
      rival.actorId,
      rival.vehicle,
      camera.yaw,
      spriteAssets.car,
    )];
  });
  const renderWorldSprites = [...runtime.worldSprites, ...rivalSprites];
  const stats = renderM5Driving(
    framebuffer,
    selectedBackground,
    guideCoordinateCurve(runtime.coordinateFrame),
    camera,
    vehicle,
    runtime.terrainProfile,
    runtime.groundProfile,
    renderWorldSprites,
    spriteAssets,
    vehicleKind,
    runtime.roadView ?? undefined,
  );
  ctx.putImageData(imageData, 0, 0);

  const standings = rankRaceProgress([
    {
      competitorId: 'PLAYER',
      sProgress: raceProgress.sProgress,
      validatedProgressFloor: raceProgress.validatedProgressFloor,
    },
    ...rivals.map((rival) => ({
      competitorId: rival.actorId,
      sProgress: rival.raceProgress.sProgress,
      validatedProgressFloor: rival.raceProgress.validatedProgressFloor,
    })),
  ]);
  const playerStanding = standings.find((entry) => entry.competitorId === 'PLAYER')!;

  const playerProjection = pseudoProject(
    { x: vehicle.x, y: vehicle.y, z: vehicle.z, s: vehicle.course.s },
    camera,
  );
  const dCar = pseudoDepth(vehicle.course.s, camera.s);
  const roadDeltaDeg = camera.vehicleGuideYawDelta * 180 / Math.PI;
  const slipDeg = Math.atan2(vehicle.lateralSpeed, Math.max(0.01, vehicle.longitudinalSpeed)) * 180 / Math.PI;
  const bankDeg = vehicleKind === 'bike'
    ? (vehicle as M5BikeState).bankAngle * 180 / Math.PI
    : vehicle.sprungRoll * 180 / Math.PI;
  const nextGate = raceRules.gates[raceProgress.nextGateIndex]!;
  const progressWindow = getRaceProgressWindow(raceProgress, raceRules);
  const junctionPhase = isParentRaceDiagnostic(runtime)
    ? M6_13_JUNCTION.sample(vehicle.course.s).phase
    : 'STAGE';
  const pendingHandoff = routeHandoffState.pending === null
    ? 'NONE'
    : `${routeHandoffState.pending.targetChartId}/${routeHandoffState.pending.targetStageId}`;
  const runtimeView = runtime.roadView?.id ?? 'PARENT';
  const runFinish = runObjective.finishId === null
    ? 'RUNNING'
    : `${runObjective.finishId} ${formatRaceTime(runObjective.finishElapsedSeconds ?? raceSession.elapsedSeconds)}`;
  const firstRivalRoute = rivals[0]?.traveler.routeState;
  const rivalRouteSummary = firstRivalRoute === undefined
    ? 'NONE'
    : `${firstRivalRoute.activeStageId} ${firstRivalRoute.status}${rivals.length > 1 ? ` +${rivals.length - 1}` : ''}`;

  ctx.fillStyle = '#d7f3ff';
  ctx.font = 'bold 13px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('SUPER OUTRIDE', 8, 6);
  ctx.fillStyle = '#a6bac4';
  ctx.font = '9px monospace';
  ctx.fillText(`M6.51 BUILD ${M6_43_DEV_COURSE_MODE.routeKind} / ${vehicleKind === 'car' ? 'CAR' : 'MOTORCYCLE'} [V] RECOVER [R]`, 8, 23);
  ctx.fillText(`SPD ${(vehicle.speed * 3.6).toFixed(0).padStart(3)} km/h  ${vehicle.surfaceType.padEnd(8)} ${vehicle.supported ? 'GROUND' : 'AIR'}  BG ${backgroundDiagnosticKind}`, 8, 36);
  ctx.fillText(`S ${vehicle.course.s.toFixed(1).padStart(6)}  L ${formatSigned(vehicle.course.l)}  JCT ${junctionPhase}`, 8, 48);
  ctx.fillText(`STEER ${formatSigned(vehicle.steerAngle * 180 / Math.PI, 1)}deg  SLIP ${formatSigned(slipDeg, 1)}deg`, 8, 60);
  ctx.fillText(`YAW ${formatSigned(roadDeltaDeg, 1)}deg  RATE ${formatSigned(vehicle.yawRate * 180 / Math.PI, 1)}deg/s  BANK ${formatSigned(bankDeg, 1)}deg`, 8, 72);
  ctx.fillText(`D ${dCar.toFixed(2)}  ${playerProjection.scale.toFixed(2)} px/m  CAR 2m=${(2 * playerProjection.scale).toFixed(0)}px`, 8, 84);
  ctx.fillText(`TL ${stats.terrainLineCount} SPR ${stats.visibleSpriteCount}  GM LOD 0-${stats.groundMapMaxLevel}  ${stats.activeSection}`, 8, 96);
  ctx.fillText(`LOAD T ${stats.terrainOutputPixels}/${stats.terrainOutputPixelsPerScreenRowMax}  S ${stats.spriteOutputSamplesIncludingPlayer}/${stats.spriteOutputSamplesPerScanlineMax}`, 8, 108);
  ctx.fillText(`POS ${playerStanding.rank}/${standings.length}  YOU ${raceProgress.sProgress.toFixed(1)}  RIVALS ${rivals.length}`, 8, 120);
  ctx.fillText(`NEXT ${nextGate.name}  WIN ${progressWindow.floor.toFixed(0)}..${progressWindow.ceiling.toFixed(0)}  CUT ${raceProgress.shortcutViolationCount}`, 8, 132);
  ctx.fillText(`TIME ${formatRaceTime(raceSession.elapsedSeconds)}  RUN ${runFinish}`, 8, 144);
  ctx.fillText(`ROUTE ${routeState.activeStageId} ${routeState.status} EVT ${routeState.lastEvent}`, 8, 156);
  ctx.fillText(`CHART ${routeHandoffState.activeChartId} L ${formatSigned(routeHandoffState.coordinate.l)} C${routeHandoffState.commitCount}`, 8, 168);
  ctx.fillText(`PKG ${runtime.packageId} VIEW ${runtimeView}  PENDING ${pendingHandoff}`, 8, 180);
  if (camera.playerSafetyActive) {
    ctx.fillStyle = '#ffd08a';
    ctx.fillText(`PLAYER SAFETY CAMERA  X ${camera.playerScreenX.toFixed(1)}`, 8, 192);
    ctx.fillStyle = '#a6bac4';
  }

  ctx.fillStyle = runObjective.status === 'FINISHED' ? '#ffd08a' : '#8fa3ad';
  ctx.fillText(
    runObjective.status === 'FINISHED'
      ? `POINT-TO-POINT FINISH: ${runObjective.finishId}`
      : 'BRANCH: first physical vehicle locks field / wrong branch recovers',
    8,
    207,
  );
  ctx.fillStyle = '#8fa3ad';
  ctx.fillText(`FIELD RIV ${rivals.length} LOCKS ${sharedRouteChoices.locks.length}  R1 ${rivalRouteSummary}`, 8, 218);
  ctx.fillText(`World pose continuous / FIXED PLAYER SCALE 2.0m=80px (${PLAYER_PIXELS_PER_METER} px/m)`, 8, 229);
}

function recoverActorToLockedBranch(
  runtime: StageRuntimeContentPackage,
  recoveryState: M5RecoveryState,
  actorVehicle: M5VehicleState,
  traveler: LiveRouteTravelerState,
  lockedChoiceId: string,
): void {
  if (M6_43_DEV_COURSE_MODE.branchViolationPolicy !== 'RECOVER_TO_LOCKED_BRANCH') {
    throw new Error('branch violation reached browser without a recovery policy');
  }
  const approach = lockedBranchRecoveryApproach(
    liveRoute.gates,
    lockedChoiceId,
    M5_RECOVERY_PROFILE.backtrackDistance,
  );
  const target = locateWorldOnGuideCoordinateGlobal(
    runtime.coordinateFrame,
    approach.worldPoint,
    false,
  );
  recoverM5VehicleToGuideCoordinate(
    recoveryState,
    runtime.coordinateFrame,
    runtime.heightProfile,
    runtime.surfaceMap,
    actorVehicle,
    { s: target.s, l: target.l },
    'wrong-course',
  );
  resyncLiveRouteTraveler(
    liveRoute,
    traveler,
    { x: actorVehicle.x, z: actorVehicle.z },
  );
}

function activeRuntime(): StageRuntimeContentPackage {
  return resolveActiveStageRuntimeContent(stageRuntimeRegistry, routeHandoffState);
}

function isParentRaceDiagnostic(runtime: StageRuntimeContentPackage): boolean {
  return runtime.packageId === 'CONTENT_STAGE_1';
}

function raceSample(): { x: number; z: number; sLocal: number } {
  return { x: vehicle.x, z: vehicle.z, sLocal: vehicle.course.s };
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
