import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import {
  guideCoordinateCurve,
  guideCoordinateToWorld,
  locateWorldOnGuideCoordinateGlobal,
} from '../dist/core/guide-coordinate-frame.js';
import { wrapPositive } from '../dist/core/math.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import {
  createM5CameraRig,
  rebaseM5CameraRigCoordinateFrame,
  updateM5Camera,
} from '../dist/camera/m5-camera.js';
import { createM5RecoveryState, updateM5Recovery } from '../dist/gameplay/recovery.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
  syncRouteStageHandoffCoordinate,
} from '../dist/gameplay/route-stage-handoff.js';
import {
  POINT_TO_POINT_OBJECTIVE,
  createRunObjectiveState,
  createValidatedRunFinishFromRoute,
  updateRunObjectiveFromValidatedFinish,
} from '../dist/gameplay/run-objective.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

const DT = 1 / 60;
const APPROACH_DISTANCE_METERS = 8;
const SEGMENT_MAX_TICKS = 900;
const POST_FINISH_RENDER_FRAMES = 30;
const PROBE_SPEED_MPS = 13;
const PROBE_SPEED_MIN_MPS = 12;
const PROBE_SPEED_MAX_MPS = 14;

const CAMERA_PROFILE = {
  dCam: 5,
  lCamMax: 12,
  height: 2.469902425419539,
  pitch: 8 * Math.PI / 180,
  focalLength: 200,
  centerX: 160,
  centerY: 120,
  kPsi: 0.65,
  thetaLagMax: 20 * Math.PI / 180,
  sDotMin: 8,
  tauLat: 0.18,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
  playerSafeXMin: 48,
  playerSafeXMax: 272,
};

const PATHS = Object.freeze([
  Object.freeze({
    name: 'LEFT-A',
    choices: Object.freeze(['S1_LEFT', 'S2L_CONTINUE', 'S3L_CONTINUE', 'S4L_FORK_A']),
    packages: Object.freeze([
      'CONTENT_STAGE_2_L',
      'CONTENT_STAGE_3_L',
      'CONTENT_STAGE_4_L_FORK',
      'CONTENT_GOAL_LA',
    ]),
    terminalStageId: 'GOAL_LA',
  }),
  Object.freeze({
    name: 'RIGHT-B',
    choices: Object.freeze(['S1_RIGHT', 'S2R_CONTINUE', 'S3R_CONTINUE', 'S4R_FORK_B']),
    packages: Object.freeze([
      'CONTENT_STAGE_2_R',
      'CONTENT_STAGE_3_R',
      'CONTENT_STAGE_4_R_FORK',
      'CONTENT_GOAL_RB',
    ]),
    terminalStageId: 'GOAL_RB',
  }),
]);

function createParentRuntime(guide) {
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  return {
    heightProfile,
    surfaceMap,
    groundProfile,
    terrainProfile: {
      screenHeight: 240,
      dMin: 2.5,
      dMax: 150,
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 4.5,
      roadRight: 4.5,
      height: heightProfile,
      visual: visualProfile,
      thinSpanScreenRows: 1,
    },
    selectFarBackground: () => createM3FarBackground(),
    worldSprites: [],
  };
}

function probeInput(coordinateFrame, car, targetL) {
  const steering = sampleRivalDrivingInput(coordinateFrame, car, targetL).steering;
  const speed = Math.max(0, car.longitudinalSpeed);
  return {
    steering,
    throttle: speed < PROBE_SPEED_MIN_MPS,
    brake: speed > PROBE_SPEED_MAX_MPS,
  };
}

function snapshotWorld(car) {
  return {
    x: car.x,
    y: car.y,
    z: car.z,
    yaw: car.yaw,
    longitudinalSpeed: car.longitudinalSpeed,
    lateralSpeed: car.lateralSpeed,
    verticalSpeed: car.verticalSpeed,
    yawRate: car.yawRate,
  };
}

function drawRuntime(state, runtime) {
  renderM5Driving(
    state.framebuffer,
    runtime.selectFarBackground(state.camera.s),
    guideCoordinateCurve(runtime.coordinateFrame),
    state.camera,
    state.car,
    runtime.terrainProfile,
    runtime.groundProfile,
    runtime.worldSprites,
    state.assets,
    'car',
    runtime.roadView ?? undefined,
  );
  state.renderedPackages.add(runtime.packageId);
}

function findTransitionGate(live, choiceId) {
  const gate = live.gates.gates.find(
    (candidate) => candidate.kind === 'TRANSITION' && candidate.choiceId === choiceId,
  );
  assert.ok(gate, `missing transition gate for ${choiceId}`);
  return gate;
}
function findFinishGate(live, stageId) {
  const gate = live.gates.gates.find(
    (candidate) => candidate.kind === 'FINISH' && candidate.stageId === stageId,
  );
  assert.ok(gate, `missing FINISH gate for ${stageId}`);
  return gate;
}

function updateCamera(state) {
  const runtime = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
  state.camera = updateM5Camera(
    state.cameraRig,
    runtime.coordinateFrame,
    runtime.heightProfile,
    state.car,
    CAMERA_PROFILE,
    DT,
  );
  return runtime;
}

function updateObjective(state, routeUpdate) {
  const finish = createValidatedRunFinishFromRoute(state.routeState, routeUpdate);
  const result = updateRunObjectiveFromValidatedFinish(
    state.objective,
    POINT_TO_POINT_OBJECTIVE,
    finish,
    state.simulationTicks * DT,
  );
  if (result.justFinished) state.finishCount += 1;
  return result;
}

function stageBeforeGate(state, gate) {
  assert.equal(state.handoffState.pending, null, 'fixture staging is allowed only between completed handoffs');
  assert.equal(state.routeState.activeStageId, state.handoffState.activeStageId);

  const runtime = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
  const gateCoordinate = locateWorldOnGuideCoordinateGlobal(runtime.coordinateFrame, gate.center, false);
  const guide = guideCoordinateCurve(runtime.coordinateFrame);
  const startS = wrapPositive(gateCoordinate.s - APPROACH_DISTANCE_METERS, guide.length);
  const start = guideCoordinateToWorld(runtime.coordinateFrame, startS, gateCoordinate.l);
  const surface = runtime.surfaceMap.sample(start.s, start.l);
  assert.equal(surface.material.supported, true, `${runtime.packageId} probe start must be supported`);

  state.car.x = start.x;
  state.car.y = runtime.heightProfile.samplePhysics(start.s) + 0.55;
  state.car.z = start.z;
  state.car.yaw = start.heading;
  state.car.course = { s: start.s, l: start.l, segmentIndex: start.segmentIndex, distanceSquared: 0 };
  state.car.velocityX = Math.sin(start.heading) * PROBE_SPEED_MPS;
  state.car.velocityY = 0;
  state.car.velocityZ = Math.cos(start.heading) * PROBE_SPEED_MPS;
  state.car.yawRate = 0;
  state.car.frontSteerAngle = 0;
  state.car.frontNormalLoad = 1;
  state.car.rearNormalLoad = 1;
  state.car.surfaceType = surface.type;
  state.car.lateralAcceleration = 0;

  state.recovery.lastSafeS = start.s;
  state.recovery.unsupportedTime = 0;
  state.recovery.lastReason = null;
  state.previousRoutePoint = { x: state.car.x, z: state.car.z };
  syncRouteStageHandoffCoordinate(state.handoffState, state.live.charts, state.previousRoutePoint);
  updateCamera(state);

  return { runtime, targetL: gateCoordinate.l };
}

function createDeepState() {
  const parentGuide = createM2StadiumGuide();
  const parent = createParentRuntime(parentGuide);
  const assets = createM4SpriteAssets();
  const live = createM627LiveRouteRuntime(parentGuide, parent, assets);
  const car = createM5Car(parentGuide, parent.heightProfile, parent.surfaceMap, 320);
  car.velocityX = Math.sin(car.yaw) * PROBE_SPEED_MPS;
  car.velocityY = 0;
  car.velocityZ = Math.cos(car.yaw) * PROBE_SPEED_MPS;

  const routeState = createRouteDagState(live.route);
  const handoffState = createRouteStageHandoffState(
    live.route,
    live.content,
    live.initialChart,
    { x: car.x, z: car.z },
  );
  const recovery = createM5RecoveryState(car);
  const cameraRig = createM5CameraRig();
  const framebuffer = new SoftwareSurface(320, 240, new Uint32Array(320 * 240));
  const objective = createRunObjectiveState();
  const initialRuntime = resolveActiveStageRuntimeContent(live.registry, handoffState);
  const camera = updateM5Camera(
    cameraRig,
    initialRuntime.coordinateFrame,
    initialRuntime.heightProfile,
    car,
    CAMERA_PROFILE,
    DT,
  );

  return {
    live,
    assets,
    car,
    routeState,
    handoffState,
    recovery,
    cameraRig,
    framebuffer,
    objective,
    camera,
    previousRoutePoint: { x: car.x, z: car.z },
    acceptedChoices: [],
    committedPackages: [],
    renderedPackages: new Set(),
    speedAtCommit: [],
    commitWorldPreservationCount: 0,
    finishCount: 0,
    simulationTicks: 0,
  };
}

function driveTransition(state, choiceId) {
  const gate = findTransitionGate(state.live, choiceId);
  const staged = stageBeforeGate(state, gate);
  if (state.renderedPackages.size === 0) drawRuntime(state, staged.runtime);

  let accepted = false;
  for (let tick = 0; tick < SEGMENT_MAX_TICKS; tick += 1) {
    state.simulationTicks += 1;
    const runtimeBefore = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
    const input = probeInput(runtimeBefore.coordinateFrame, state.car, staged.targetL);
    updateM5Car(
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      state.car,
      input,
      DT,
    );

    const recovered = updateM5Recovery(
      state.recovery,
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      state.car,
      DT,
    );
    assert.equal(recovered, null, `${choiceId} physical probe must not require recovery`);

    const current = { x: state.car.x, z: state.car.z };
    let routeUpdate = null;
    if (state.handoffState.pending === null) {
      const observation = observeRouteBoundaryCrossing(
        state.live.route,
        state.routeState,
        state.live.gates,
        state.previousRoutePoint,
        current,
      );
      routeUpdate = updateRouteDag(state.routeState, state.live.route, observation.boundary);
      if (routeUpdate.acceptedChoice !== null) {
        assert.equal(routeUpdate.acceptedChoice.id, choiceId);
        assert.equal(accepted, false, 'one probe accepts one route choice');
        accepted = true;
        state.acceptedChoices.push(routeUpdate.acceptedChoice.id);
      }
      queueRouteStageHandoff(state.handoffState, state.live.handoffs, routeUpdate);
    }

    const handoffObservation = observePendingRouteStageHandoff(
      state.handoffState,
      state.live.handoffs,
      state.previousRoutePoint,
      current,
    );
    const worldBeforeCommit = snapshotWorld(state.car);
    const handoffEvent = commitRouteStageHandoff(
      state.handoffState,
      state.routeState,
      state.live.content,
      state.live.charts,
      handoffObservation.seam,
      current,
    );

    if (handoffEvent === 'COMMITTED') {
      assert.equal(accepted, true, 'COMMIT requires the physical route gate first');
      assert.deepEqual(snapshotWorld(state.car), worldBeforeCommit, 'COMMIT must preserve world pose and motion');
      state.commitWorldPreservationCount += 1;

      const runtimeAfter = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
      state.car.course = { ...state.handoffState.coordinate };
      rebaseM5CameraRigCoordinateFrame(
        state.cameraRig,
        runtimeBefore.coordinateFrame,
        runtimeAfter.coordinateFrame,
      );
      state.committedPackages.push(runtimeAfter.packageId);
      state.speedAtCommit.push(state.car.speed);
      state.previousRoutePoint = current;
      updateObjective(state, routeUpdate);
      updateCamera(state);
      drawRuntime(state, runtimeAfter);
      return;
    }

    syncRouteStageHandoffCoordinate(state.handoffState, state.live.charts, current);
    state.previousRoutePoint = current;
    updateObjective(state, routeUpdate);
    updateCamera(state);
  }

  assert.fail(`${choiceId} did not commit within ${SEGMENT_MAX_TICKS} ticks`);
}

function driveFinish(state, terminalStageId) {
  const gate = findFinishGate(state.live, terminalStageId);
  const staged = stageBeforeGate(state, gate);

  for (let tick = 0; tick < SEGMENT_MAX_TICKS; tick += 1) {
    state.simulationTicks += 1;
    const runtime = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
    updateM5Car(
      runtime.coordinateFrame,
      runtime.heightProfile,
      runtime.surfaceMap,
      state.car,
      probeInput(runtime.coordinateFrame, state.car, staged.targetL),
      DT,
    );
    const recovered = updateM5Recovery(
      state.recovery,
      runtime.coordinateFrame,
      runtime.heightProfile,
      runtime.surfaceMap,
      state.car,
      DT,
    );
    assert.equal(recovered, null, `${terminalStageId} FINISH probe must not require recovery`);

    const current = { x: state.car.x, z: state.car.z };
    const observation = observeRouteBoundaryCrossing(
      state.live.route,
      state.routeState,
      state.live.gates,
      state.previousRoutePoint,
      current,
    );
    const routeUpdate = updateRouteDag(state.routeState, state.live.route, observation.boundary);
    syncRouteStageHandoffCoordinate(state.handoffState, state.live.charts, current);
    state.previousRoutePoint = current;
    const objectiveUpdate = updateObjective(state, routeUpdate);
    const runtimeAfterTick = updateCamera(state);
    if (objectiveUpdate.justFinished) {
      drawRuntime(state, runtimeAfterTick);
      break;
    }
  }

  assert.equal(state.objective.status, 'FINISHED', `${terminalStageId} must cross its physical FINISH gate`);

  for (let frame = 0; frame < POST_FINISH_RENDER_FRAMES; frame += 1) {
    state.simulationTicks += 1;
    const runtime = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
    updateM5Car(
      runtime.coordinateFrame,
      runtime.heightProfile,
      runtime.surfaceMap,
      state.car,
      probeInput(runtime.coordinateFrame, state.car, staged.targetL),
      DT,
    );
    const recovered = updateM5Recovery(
      state.recovery,
      runtime.coordinateFrame,
      runtime.heightProfile,
      runtime.surfaceMap,
      state.car,
      DT,
    );
    assert.equal(recovered, null, 'post-FINISH simulation must remain physically live');
    syncRouteStageHandoffCoordinate(
      state.handoffState,
      state.live.charts,
      { x: state.car.x, z: state.car.z },
    );
    const runtimeAfterTick = updateCamera(state);
    drawRuntime(state, runtimeAfterTick);
  }
}

function runPath(path) {
  const state = createDeepState();
  for (const choiceId of path.choices) driveTransition(state, choiceId);
  driveFinish(state, path.terminalStageId);
  return state;
}

for (const path of PATHS) {
  test(`M6.39 browser-order ${path.name} keeps four physical PENDING/COMMIT transactions coherent across stage-local charts`, () => {
    const result = runPath(path);
    const diagnostic = `route=${result.routeState.activeStageId} status=${result.routeState.status} pkg=${result.handoffState.activePackageId} commits=${result.handoffState.commitCount} recoveries=${result.recovery.recoveries} choices=${result.acceptedChoices.join('>')} packages=${result.committedPackages.join('>')} s=${result.car.course.s.toFixed(2)} l=${result.car.course.l.toFixed(2)} speed=${result.car.speed.toFixed(2)} ticks=${result.simulationTicks}`;

    assert.deepEqual(result.acceptedChoices, path.choices, `physical route choices must stay ordered; ${diagnostic}`);
    assert.deepEqual(result.committedPackages, path.packages, `package sequence must follow physical seams; ${diagnostic}`);
    assert.equal(result.handoffState.commitCount, 4, `path must commit four stage charts; ${diagnostic}`);
    assert.equal(result.commitWorldPreservationCount, 4, `all COMMITs must preserve world pose/motion; ${diagnostic}`);
    assert.equal(result.routeState.status, 'FINISHED', `physical FINISH must complete RouteDag; ${diagnostic}`);
    assert.equal(result.routeState.activeStageId, path.terminalStageId, `terminal identity must be preserved; ${diagnostic}`);
    assert.equal(result.objective.status, 'FINISHED', `validated FINISH must complete the point-to-point objective; ${diagnostic}`);
    assert.equal(result.objective.finishId, path.terminalStageId, `objective finish identity must match terminal; ${diagnostic}`);
    assert.equal(result.finishCount, 1, `validated FINISH must be recorded once; ${diagnostic}`);
    assert.equal(result.recovery.recoveries, 0, `local physical probes must remain supported; ${diagnostic}`);
    assert.equal(result.speedAtCommit.length, 4, `every COMMIT must occur while physically moving; ${diagnostic}`);
    assert.ok(result.speedAtCommit.every((speed) => speed > 8), `every COMMIT must remain above 8 m/s; ${diagnostic}`);

    for (const packageId of ['CONTENT_STAGE_1', ...path.packages]) {
      assert.equal(result.renderedPackages.has(packageId), true, `renderer must consume ${packageId}; ${diagnostic}`);
    }
  });
}
