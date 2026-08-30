import { LOGICAL_HEIGHT, LOGICAL_WIDTH, SIM_DT } from './core/constants.js';
import {
  guideCoordinateCurve,
  locateWorldOnGuideCoordinateGlobal,
} from './core/guide-coordinate-frame.js';
import { CURRENT_M5_CAMERA_PROFILE } from './camera/current-camera-profile.js';
import { CURRENT_CAMERA_DISTANCE_METERS, PLAYER_PIXELS_PER_METER } from './core/presentation-scale.js';
import { COURSE_MODE_HOTKEY_LABEL } from './browser/course-mode-selection.js';
import { pseudoDepth, pseudoProject } from './core/projection.js';
import { createM627LiveRouteRuntime } from './dev/m6-27-live-route-runtime.js';
import { createM640RivalRouteChoicePlan } from './dev/m6-40-rival-live-route.js';
import { M8_3_BRANCHING_COURSE_MODE } from './dev/m8-3-course-debug-mode.js';
import {
  M7_2_DEFAULT_BRANCHING_FORK,
  M7_2_DEFAULT_BRANCHING_JUNCTION,
  M7_2_PLAYER_RECOVERY_PROFILE,
  M7_2_PLAYER_START_L,
  M7_2_RIVAL_RECOVERY_PROFILE,
  M7_2_RIVAL_START_L,
  createM72DefaultBranchingParent,
} from './dev/m7-2-default-branching-highway.js';
import {
  createM5CameraRig,
  resetM5CameraRig,
  updateM5Camera,
  type M5CameraState,
} from './camera/m5-camera.js';
import { lockedBranchRecoveryApproach } from './gameplay/branch-violation.js';
import {
  createFieldRouteProgressState,
  fieldRouteProgressBoundaryFromRouteUpdate,
  fieldRouteProgressTravelerView,
  fieldRouteProgressWindow,
  resyncFieldRouteProgress,
  updateFieldRouteProgress,
} from './gameplay/field-route-progress.js';
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
import { pendingRouteStageRecoveryTarget } from './gameplay/route-stage-handoff.js';
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
import { createM3FarBackground } from './visual/far-background.js';
import {
  createM5TunnelPresentation,
  selectM5FarBackground,
} from './visual/m5-9-tunnel.js';
import { createM4SpriteAssets } from './visual/m4-sprite-assets.js';
import { createDynamicVehicleCourseSprite } from './world/dynamic-vehicle-sprite.js';
import { createM4DebugWorldSprites } from './dev/m4-debug-world.js';
import { createM5TunnelWorldSprites } from './world/m5-9-tunnel-world.js';

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
const parentCourse = createM72DefaultBranchingParent();
const {
  guide,
  heightProfile,
  surfaceMap,
  groundProfile,
  terrainProfile,
} = parentCourse;
const outdoorFarBackground = createM3FarBackground();
const tunnelPresentation = createM5TunnelPresentation(guide.length, CURRENT_CAMERA_DISTANCE_METERS);
const spriteAssets = createM4SpriteAssets();
const staticWorldSprites = [
  ...createM4DebugWorldSprites(guide, heightProfile, spriteAssets),
  ...createM5TunnelWorldSprites(guide, heightProfile, tunnelPresentation),
];

let vehicle: ArcadeVehicleState = createArcadeVehicle(
  CAR_VEHICLE_PROFILE,
  guide,
  heightProfile,
  surfaceMap,
  45,
  M7_2_PLAYER_START_L,
);
const cameraRig = createM5CameraRig();
let recovery = createM5RecoveryState(vehicle);
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
  M7_2_DEFAULT_BRANCHING_FORK,
);
const playerTraveler = createLiveRouteTravelerState(liveRoute, { x: vehicle.x, z: vehicle.z });
const playerFieldProgress = createFieldRouteProgressState(
  liveRoute.progress,
  fieldRouteProgressTravelerView(playerTraveler.routeState, playerTraveler.handoffState),
);
const routeState = playerTraveler.routeState;
const routeHandoffState = playerTraveler.handoffState;
const stageRuntimeRegistry = liveRoute.registry;
const runObjective = createRunObjectiveState();
const rivalRoster = createRivalRoster(M8_3_BRANCHING_COURSE_MODE);
const rivalRoutePlan = createM640RivalRouteChoicePlan(liveRoute);
const rivals = rivalRoster.map((entry) => {
  const rivalVehicle = createArcadeVehicle(
    CAR_VEHICLE_PROFILE,
    guide,
    heightProfile,
    surfaceMap,
    95 + entry.rivalIndex * 6,
    M7_2_RIVAL_START_L,
  );
  const traveler = createLiveRouteTravelerState(
    liveRoute,
    { x: rivalVehicle.x, z: rivalVehicle.z },
  );
  return {
    actorId: entry.actorId,
    vehicle: rivalVehicle,
    recovery: createM5RecoveryState(rivalVehicle),
    traveler,
    fieldProgress: createFieldRouteProgressState(
      liveRoute.progress,
      fieldRouteProgressTravelerView(traveler.routeState, traveler.handoffState),
    ),
    routePlan: rivalRoutePlan,
  };
});
const sharedRouteChoices = createSharedRouteChoiceState(M8_3_BRANCHING_COURSE_MODE.sharedRouteChoiceMode);

const cameraProfile = CURRENT_M5_CAMERA_PROFILE;

let input: DrivingInput = { steering: 0, throttle: false, brake: false };

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'KeyR') {
    const runtime = activeRuntime();
    recoverM5Vehicle(
      recovery,
      runtime.coordinateFrame,
      runtime.heightProfile,
      runtime.surfaceMap,
      vehicle,
      'manual',
      M7_2_PLAYER_RECOVERY_PROFILE,
    );
    resetM5CameraRig(cameraRig);
    resyncLiveRouteTraveler(liveRoute, playerTraveler, { x: vehicle.x, z: vehicle.z });
    resyncFieldRouteProgress(
      playerFieldProgress,
      liveRoute.progress,
      fieldRouteProgressTravelerView(playerTraveler.routeState, playerTraveler.handoffState),
    );
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
  switchVehicleAtSafeSpawn();
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

    const runtimeBefore = activeRuntime();
    updateArcadeVehicle(
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      vehicle,
      input,
      SIM_DT,
    );

    const recovered = updateM5Recovery(
      recovery,
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      vehicle,
      SIM_DT,
      M7_2_PLAYER_RECOVERY_PROFILE,
      pendingRouteStageRecoveryTarget(
        playerTraveler.handoffState,
        M7_2_PLAYER_RECOVERY_PROFILE.backtrackDistance,
      ),
    );
    if (recovered !== null) {
      resetM5CameraRig(cameraRig);
      resyncLiveRouteTraveler(liveRoute, playerTraveler, { x: vehicle.x, z: vehicle.z });
    }

    const rivalFrames = rivals.map((rival) => {
      const rivalRuntimeBefore = resolveLiveRouteTravelerRuntime(liveRoute, rival.traveler);
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
      updateArcadeVehicle(
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
        M7_2_RIVAL_RECOVERY_PROFILE,
        pendingRouteStageRecoveryTarget(
          rival.traveler.handoffState,
          M7_2_RIVAL_RECOVERY_PROFILE.backtrackDistance,
        ),
      );
      if (rivalRecovered !== null) {
        resyncLiveRouteTraveler(
          liveRoute,
          rival.traveler,
          { x: rival.vehicle.x, z: rival.vehicle.z },
        );
      }
      return {
        rival,
        runtimeBefore: rivalRuntimeBefore,
        recovered: rivalRecovered,
      };
    });

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
    } else if (playerRouteTick.committed) {
      vehicle.course = { ...routeHandoffState.coordinate };
    }
    const playerProgressView = fieldRouteProgressTravelerView(
      playerTraveler.routeState,
      playerTraveler.handoffState,
    );
    if (recovered !== null || playerRouteTick.branchViolation !== null) {
      resyncFieldRouteProgress(playerFieldProgress, liveRoute.progress, playerProgressView);
    } else {
      updateFieldRouteProgress(
        playerFieldProgress,
        liveRoute.progress,
        playerProgressView,
        fieldRouteProgressBoundaryFromRouteUpdate(routeUpdate),
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
      } else if (rivalRouteTick.committed) {
        rivalFrame.rival.vehicle.course = { ...rivalFrame.rival.traveler.handoffState.coordinate };
      }
      const rivalProgressView = fieldRouteProgressTravelerView(
        rivalFrame.rival.traveler.routeState,
        rivalFrame.rival.traveler.handoffState,
      );
      if (rivalFrame.recovered !== null || rivalRouteTick.branchViolation !== null) {
        resyncFieldRouteProgress(
          rivalFrame.rival.fieldProgress,
          liveRoute.progress,
          rivalProgressView,
        );
      } else {
        updateFieldRouteProgress(
          rivalFrame.rival.fieldProgress,
          liveRoute.progress,
          rivalProgressView,
          fieldRouteProgressBoundaryFromRouteUpdate(rivalRouteTick.routeUpdate),
        );
      }
    }

    advanceRaceSession(raceSession, playerFieldProgress, null, SIM_DT);
    const finish = createValidatedRunFinishFromRoute(routeState, routeUpdate, playerFieldProgress);
    updateRunObjectiveFromValidatedFinish(
      runObjective,
      POINT_TO_POINT_OBJECTIVE,
      finish,
      raceSession.elapsedSeconds,
    );

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
  const spriteFamily = deriveVehicleSpriteFamily(vehicle);
  const selectedBackground = runtime.selectFarBackground(camera.s);
  const backgroundDiagnosticKind = isParentRuntime(runtime)
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
      rivalRuntime.heightProfile,
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
    spriteFamily,
    runtime.roadView ?? undefined,
  );
  ctx.putImageData(imageData, 0, 0);

  const standings = rankRaceProgress([
    {
      competitorId: 'PLAYER',
      sProgress: playerFieldProgress.sProgress,
      validatedProgressFloor: playerFieldProgress.validatedProgressFloor,
    },
    ...rivals.map((rival) => ({
      competitorId: rival.actorId,
      sProgress: rival.fieldProgress.sProgress,
      validatedProgressFloor: rival.fieldProgress.validatedProgressFloor,
    })),
  ]);
  const playerStanding = standings.find((entry) => entry.competitorId === 'PLAYER')!;

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
  const progressWindow = fieldRouteProgressWindow(
    liveRoute.progress,
    routeState.activeStageId,
    playerFieldProgress.validatedProgressFloor,
  );
  const junctionPhase = isParentRuntime(runtime)
    ? M7_2_DEFAULT_BRANCHING_JUNCTION.sample(vehicle.course.s).phase
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
  ctx.fillText(`M9.0 COURSE DEBUG ${M8_3_BRANCHING_COURSE_MODE.routeKind} / ${formatVehiclePresentationName(vehicle)} SWITCH [V] RECOVER [R]`, 8, 23);
  ctx.fillText(controlHud.instruments, 8, 36);
  ctx.fillText(`S ${vehicle.course.s.toFixed(1).padStart(6)} L ${formatSigned(vehicle.course.l)} ${vehicle.surfaceType.padEnd(8)} ${vehicle.supported ? 'LOAD' : 'FREE'}`, 8, 48);
  ctx.fillText(`${controlHud.steering}  SLIP ${formatSigned(slipDeg, 1)}deg`, 8, 60);
  ctx.fillText(`YAW ${formatSigned(roadDeltaDeg, 1)}deg  RATE ${formatSigned(vehicle.yawRate * 180 / Math.PI, 1)}deg/s  BANK ${formatSigned(bankDeg, 1)}deg`, 8, 72);
  ctx.fillText(`D ${dCar.toFixed(2)}  ${playerProjection.scale.toFixed(2)} px/m  CAR 2m=${(2 * playerProjection.scale).toFixed(0)}px`, 8, 84);
  ctx.fillText(suspensionHud, 8, 96);
  ctx.fillText(controlHud.pedals, 8, 108);
  ctx.fillText(`POS ${playerStanding.rank}/${standings.length}  YOU ${playerFieldProgress.sProgress.toFixed(1)}  RIVALS ${rivals.length}`, 8, 120);
  ctx.fillText(`NEXT ${routeState.activeStageId}  WIN ${progressWindow.floor.toFixed(0)}..${progressWindow.ceiling.toFixed(0)}  ROUTE GATES ${playerFieldProgress.acceptedTransitionCount}`, 8, 132);
  ctx.fillText(`TIME ${formatRaceTime(raceSession.elapsedSeconds)}  RUN ${runFinish}`, 8, 144);
  ctx.fillText(`ROUTE ${routeState.activeStageId} ${routeState.status} EVT ${routeState.lastEvent}`, 8, 156);
  ctx.fillText(`CHART ${routeHandoffState.activeChartId} L ${formatSigned(routeHandoffState.coordinate.l)} C${routeHandoffState.commitCount}`, 8, 168);
  ctx.fillText(`PKG ${runtime.packageId} VIEW ${runtimeView}  PENDING ${pendingHandoff}`, 8, 180);
  ctx.fillText(`JCT ${junctionPhase}  BG ${backgroundDiagnosticKind}  CENTER X ${camera.playerScreenX.toFixed(1)}`, 8, 192);

  ctx.fillStyle = runObjective.status === 'FINISHED' ? '#ffd08a' : '#8fa3ad';
  ctx.fillText(
    runObjective.status === 'FINISHED'
      ? `POINT-TO-POINT FINISH: ${runObjective.finishId}`
      : 'BRANCH: first physical vehicle locks field / wrong branch recovers',
    8,
    207,
  );
  ctx.fillStyle = '#8fa3ad';
  ctx.fillText(`${COURSE_MODE_HOTKEY_LABEL}  R1 ${rivalRouteSummary}`, 8, 218);
  ctx.fillText(`World CG authority / FIXED PLAYER SCALE 2.0m=80px (${PLAYER_PIXELS_PER_METER} px/m)`, 8, 229);
  if (vehicle.profile.id === 'CAR') {
    drawCarSteeringHud(ctx, input.steering, vehicle.control, bodySlipAngle);
  }
  drawVehicleYawDebug(ctx, camera.playerScreenX, stats.playerScreenY, vehicle.yaw, camera.yaw);
}

/** DEV switch is an explicit safe-spawn reconstruction, never a running-state conversion. */
function switchVehicleAtSafeSpawn(): void {
  const runtime = activeRuntime();
  recoverM5Vehicle(
    recovery,
    runtime.coordinateFrame,
    runtime.heightProfile,
    runtime.surfaceMap,
    vehicle,
    'manual',
    M7_2_PLAYER_RECOVERY_PROFILE,
  );
  const s = vehicle.course.s;
  const l = vehicle.course.l;
  const speed = vehicle.longitudinalSpeed;
  vehicle = createArcadeVehicle(
    vehicle.profile.id === 'CAR' ? BIKE_VEHICLE_PROFILE : CAR_VEHICLE_PROFILE,
    runtime.coordinateFrame,
    runtime.heightProfile,
    runtime.surfaceMap,
    s,
    l,
    speed,
  );
  recovery = createM5RecoveryState(vehicle);
  resetM5CameraRig(cameraRig);
  resyncLiveRouteTraveler(liveRoute, playerTraveler, { x: vehicle.x, z: vehicle.z });
  resyncFieldRouteProgress(
    playerFieldProgress,
    liveRoute.progress,
    fieldRouteProgressTravelerView(playerTraveler.routeState, playerTraveler.handoffState),
  );
}

function recoverActorToLockedBranch(
  runtime: StageRuntimeContentPackage,
  recoveryState: M5RecoveryState,
  actorVehicle: M5VehicleState,
  traveler: LiveRouteTravelerState,
  lockedChoiceId: string,
): void {
  if (M8_3_BRANCHING_COURSE_MODE.branchViolationPolicy !== 'RECOVER_TO_LOCKED_BRANCH') {
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

function isParentRuntime(runtime: StageRuntimeContentPackage): boolean {
  return runtime.packageId === 'CONTENT_STAGE_1';
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
