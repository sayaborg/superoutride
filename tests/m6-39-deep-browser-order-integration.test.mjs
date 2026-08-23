import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
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
} from '../dist/dev/m5-camera.js';
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
const APPROACH_DISTANCE_METERS = 12;
const SEGMENT_MAX_TICKS = 900;
const POST_FINISH_RENDER_FRAMES = 30;
const INTEGRATION_CRUISE_MIN_MPS = 18;
const INTEGRATION_CRUISE_MAX_MPS = 22;
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

function parentShared(guide) {
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

function sampleIntegrationDrivingInput(guide, car, targetL) {
  const steeringInput = sampleRivalDrivingInput(guide, car, targetL);
  const speed = Math.max(0, car.longitudinalSpeed);
  return {
    steering: steeringInput.steering,
    throttle: !steeringInput.brake && speed < INTEGRATION_CRUISE_MIN_MPS,
    brake: steeringInput.brake || speed > INTEGRATION_CRUISE_MAX_MPS,
  };
}

function drawActiveRuntime(framebuffer, runtime, camera, car, assets) {
  renderM5Driving(
    framebuffer,
    runtime.selectFarBackground(camera.s),
    guideCoordinateCurve(runtime.coordinateFrame),
    camera,
    car,
    runtime.terrainProfile,
    runtime.groundProfile,
    runtime.worldSprites,
    assets,
    'car',
    runtime.roadView ?? undefined,
  );
}

function snapshotVehicleWorld(car) {
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

function stageVehicleBeforeGate(state, gate) {
  assert.equal(state.handoffState.pending, null, 'fixture staging is allowed only between completed handoffs');
  assert.equal(
    state.routeState.activeStageId,
    state.handoffState.activeStageId,
    'route and committed runtime stage must agree before fixture staging',
  );

  const runtime = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
  const gateCoordinate = locateWorldOnGuideCoordinateGlobal(runtime.coordinateFrame, gate.center, false);
  const guide = guideCoordinateCurve(runtime.coordinateFrame);
  const startS = wrapPositive(gateCoordinate.s - APPROACH_DISTANCE_METERS, guide.length);
  const start = guideCoordinateToWorld(runtime.coordinateFrame, startS, gateCoordinate.l);
  const surface = runtime.surfaceMap.sample(start.s, start.l);
  assert.equal(surface.material.supported, true, `${runtime.packageId} gate approach must be physically supported`);

  state.car.x = start.x;
  state.car.y = runtime.heightProfile.samplePhysics(start.s);
  state.car.z = start.z;
  state.car.yaw = start.heading;
  state.car.speed = 20;
  state.car.course = { s: start.s, l: start.l, segmentIndex: start.segmentIndex, distanceSquared: 0 };
  state.car.verticalSpeed = 0;
  state.car.longitudinalSpeed = 20;
  state.car.lateralSpeed = 0;
  state.car.yawRate = 0;
  state.car.steerAngle = 0;
  state.car.supported = true;
  state.car.surfaceType = surface.type;
  state.car.lateralAcceleration = 0;
  state.car.sprungRoll = 0;

  state.recovery.lastSafeS = start.s;
  state.recovery.unsupportedTime = 0;
  state.recovery.lastReason = null;
  state.previousRoutePoint = { x: state.car.x, z: state.car.z };
  syncRouteStageHandoffCoordinate(state.handoffState, state.live.charts, state.previousRoutePoint);

  state.camera = updateM5Camera(
    state.cameraRig,
    runtime.coordinateFrame,
    runtime.heightProfile,
    state.car,
    CAMERA_PROFILE,
    DT,
  );

  return { runtime, targetL: gateCoordinate.l };
}

function createDeepState() {
  const parentGuide = createM2StadiumGuide();
  const parent = parentShared(parentGuide);
  const assets = createM4SpriteAssets();
  const live = createM627LiveRouteRuntime(parentGuide, parent, assets);
  const car = createM5Car(parentGuide, parent.heightProfile, parent.surfaceMap, 320);
  car.longitudinalSpeed = 20;
  car.speed = 20;
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

function updateObjective(state, routeUpdate) {
  const finish = createValidatedRunFinishFromRoute(state.routeState, routeUpdate);
  const update = updateRunObjectiveFromValidatedFinish(
    state.objective,
    POINT_TO_POINT_OBJECTIVE,
    finish,
    state.simulationTicks * DT,
  );
  if (update.justFinished) state.finishCount += 1;
  return update;
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

function driveTransitionSegment(state, expectedChoiceId) {
  const gate = findTransitionGate(state.live, expectedChoiceId);
  const staged = stageVehicleBeforeGate(state, gate);
  if (state.renderedPackages.size === 0) {
    drawActiveRuntime(state.framebuffer, staged.runtime, state.camera, state.car, state.assets);
    state.renderedPackages.add(staged.runtime.packageId);
  }

  let acceptedThisSegment = false;
  for (let tick = 0; tick < SEGMENT_MAX_TICKS; tick += 1) {
    state.simulationTicks += 1;
    const runtimeBefore = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
    const input = sampleIntegrationDrivingInput(
      guideCoordinateCurve(runtimeBefore.coordinateFrame),
      state.car,
      staged.targetL,
    );
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
    assert.equal(recovered, null, `${expectedChoiceId} approach must not require recovery`);

    const currentRoutePoint = { x: state.car.x, z: state.car.z };
    let routeUpdate = null;
    if (state.handoffState.pending === null) {
      const observation = observeRouteBoundaryCrossing(
        state.live.route,
        state.routeState,
        state.live.gates,
        state.previousRoutePoint,
        currentRoutePoint,
      );
      routeUpdate = updateRouteDag(state.routeState, state.live.route, observation.boundary);
      if (routeUpdate.acceptedChoice !== null) {
        assert.equal(routeUpdate.acceptedChoice.id, expectedChoiceId, 'physical gate must select the expected route choice');
        assert.equal(acceptedThisSegment, false, 'one segment may accept its route choice only once');
        acceptedThisSegment = true;
        state.acceptedChoices.push(routeUpdate.acceptedChoice.id);
      }
      queueRouteStageHandoff(state.handoffState, state.live.handoffs, routeUpdate);
    }

    const handoffObservation = observePendingRouteStageHandoff(
      state.handoffState,
      state.live.handoffs,
      state.previousRoutePoint,
      currentRoutePoint,
    );
    const worldBeforeCommit = snapshotVehicleWorld(state.car);
    const handoffEvent = commitRouteStageHandoff(
      state.handoffState,
      state.routeState,
      state.live.content,
      state.live.charts,
      handoffObservation.seam,
      currentRoutePoint,
    );

    if (handoffEvent === 'COMMITTED') {
      assert.equal(acceptedThisSegment, true, 'COMMIT requires a previously accepted physical route gate');
      assert.deepEqual(snapshotVehicleWorld(state.car), worldBeforeCommit, 'COMMIT must not mutate authoritative world pose or velocity');
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
      state.previousRoutePoint = currentRoutePoint;
      updateObjective(state, routeUpdate);
      updateCamera(state);
      drawActiveRuntime(state.framebuffer, runtimeAfter, state.camera, state.car, state.assets);
      state.renderedPackages.add(runtimeAfter.packageId);
      return;
    }

    syncRouteStageHandoffCoordinate(state.handoffState, state.live.charts, currentRoutePoint);
    state.previousRoutePoint = currentRoutePoint;
    updateObjective(state, routeUpdate);
    updateCamera(state);
  }

  assert.fail(`${expectedChoiceId} did not reach its physical handoff seam within ${SEGMENT_MAX_TICKS} ticks`);
}

function driveTerminalFinish(state, terminalStageId) {
  const gate = findFinishGate(state.live, terminalStageId);
  const staged = stageVehicleBeforeGate(state, gate);

  for (let tick = 0; tick < SEGMENT_MAX_TICKS; tick += 1) {
    state.simulationTicks += 1;
    const runtimeBefore = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
    const input = sampleIntegrationDrivingInput(
      guideCoordinateCurve(runtimeBefore.coordinateFrame),
      state.car,
      staged.targetL,
    );
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
    assert.equal(recovered, null, `${terminalStageId} FINISH approach must not require recovery`);

    const currentRoutePoint = { x: state.car.x, z: state.car.z };
    const observation = observeRouteBoundaryCrossing(
      state.live.route,
      state.routeState,
      state.live.gates,
      state.previousRoutePoint,
      currentRoutePoint,
    );
    const routeUpdate = updateRouteDag(state.routeState, state.live.route, observation.boundary);
    syncRouteStageHandoffCoordinate(state.handoffState, state.live.charts, currentRoutePoint);
    state.previousRoutePoint = currentRoutePoint;
    const objectiveUpdate = updateObjective(state, routeUpdate);
    const runtimeAfterTick = updateCamera(state);

    if (objectiveUpdate.justFinished) {
      drawActiveRuntime(state.framebuffer, runtimeAfterTick, state.camera, state.car, state.assets);
      state.renderedPackages.add(runtimeAfterTick.packageId);
      break;
    }
  }

  assert.equal(state.objective.status, 'FINISHED', `${terminalStageId} must cross its physical FINISH gate`);

  for (let frame = 0; frame < POST_FINISH_RENDER_FRAMES; frame += 1) {
    state.simulationTicks += 1;
    const runtime = resolveActiveStageRuntimeContent(state.live.registry, state.handoffState);
    const input = sampleIntegrationDrivingInput(
      guideCoordinateCurve(runtime.coordinateFrame),
      state.car,
      0,
    );
    updateM5Car(runtime.coordinateFrame, runtime.heightProfile, runtime.surfaceMap, state.car, input, DT);
    const recovered = updateM5Recovery(
      state.recovery,
      runtime.coordinateFrame,
      runtime.heightProfile,
      runtime.surfaceMap,
      state.car,
      DT,
    );
    assert.equal(recovered, null, 'validated FINISH must not require recovery to keep simulation alive');

    const currentRoutePoint = { x: state.car.x, z: state.car.z };
    const observation = observeRouteBoundaryCrossing(
      state.live.route,
      state.routeState,
      state.live.gates,
      state.previousRoutePoint,
      currentRoutePoint,
    );
    const routeUpdate = updateRouteDag(state.routeState, state.live.route, observation.boundary);
    syncRouteStageHandoffCoordinate(state.handoffState, state.live.charts, currentRoutePoint);
    state.previousRoutePoint = currentRoutePoint;
    updateObjective(state, routeUpdate);
    const runtimeAfterTick = updateCamera(state);
    drawActiveRuntime(state.framebuffer, runtimeAfterTick, state.camera, state.car, state.assets);
    state.renderedPackages.add(runtimeAfterTick.packageId);
  }
}

function runDeepBrowserPath(path) {
  const state = createDeepState();
  for (const choiceId of path.choices) driveTransitionSegment(state, choiceId);
  driveTerminalFinish(state, path.terminalStageId);
  return state;
}

for (const path of PATHS) {
  test(`M6.39 checkpointed browser-order 60 Hz ${path.name} path performs four physical gate/PENDING/seam/COMMIT transactions then FINISH`, () => {
    const result = runDeepBrowserPath(path);
    const diagnostic = `route=${result.routeState.activeStageId} status=${result.routeState.status} pkg=${result.handoffState.activePackageId} commits=${result.handoffState.commitCount} recoveries=${result.recovery.recoveries} choices=${result.acceptedChoices.join('>')} packages=${result.committedPackages.join('>')} finalS=${result.car.course.s.toFixed(3)} finalL=${result.car.course.l.toFixed(3)} speed=${result.car.speed.toFixed(3)} ticks=${result.simulationTicks}`;

    assert.deepEqual(result.acceptedChoices, path.choices, `physical gate sequence must match authored path; ${diagnostic}`);
    assert.deepEqual(result.committedPackages, path.packages, `seam COMMIT sequence must match authored path; ${diagnostic}`);
    assert.equal(result.handoffState.commitCount, 4, `deep path must perform four handoffs; ${diagnostic}`);
    assert.equal(result.commitWorldPreservationCount, 4, `every COMMIT must preserve world pose/velocity; ${diagnostic}`);
    assert.equal(result.routeState.status, 'FINISHED', `terminal physical FINISH must complete RouteDag; ${diagnostic}`);
    assert.equal(result.routeState.activeStageId, path.terminalStageId, `finish must belong to selected terminal; ${diagnostic}`);
    assert.equal(result.objective.status, 'FINISHED', `validated route finish must complete point-to-point objective; ${diagnostic}`);
    assert.equal(result.objective.finishId, path.terminalStageId, `objective finish id must match terminal stage; ${diagnostic}`);
    assert.equal(result.finishCount, 1, `validated finish must be recorded exactly once; ${diagnostic}`);
    assert.equal(result.recovery.recoveries, 0, `each physical gate/seam probe must remain supported; ${diagnostic}`);
    assert.equal(result.speedAtCommit.length, 4, `every handoff must record a physical speed; ${diagnostic}`);
    assert.ok(result.speedAtCommit.every((speed) => speed > 8), `car must remain moving through every COMMIT; speeds=${result.speedAtCommit.map((speed) => speed.toFixed(3)).join(',')}; ${diagnostic}`);

    const expectedRenderedPackages = ['CONTENT_STAGE_1', ...path.packages];
    for (const packageId of expectedRenderedPackages) {
      assert.equal(result.renderedPackages.has(packageId), true, `renderer must consume ${packageId}; ${diagnostic}`);
    }
  });
}
