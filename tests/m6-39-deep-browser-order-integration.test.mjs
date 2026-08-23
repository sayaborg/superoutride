import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideCoordinateCurve } from '../dist/core/guide-coordinate-frame.js';
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
const MAX_TICKS = 3600;
const POST_FINISH_RENDER_FRAMES = 30;
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
    parentSide: 'LEFT',
    secondForkSide: 'LEFT',
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
    parentSide: 'RIGHT',
    secondForkSide: 'RIGHT',
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

function targetLForRuntime(runtime, path) {
  if (runtime.packageId === 'CONTENT_STAGE_1') {
    return M6_13_JUNCTION.separatedChildCenterL(path.parentSide);
  }
  if (runtime.packageId === 'CONTENT_STAGE_4_L_FORK' || runtime.packageId === 'CONTENT_STAGE_4_R_FORK') {
    assert.ok(runtime.groundProfile.stageJunction, `${runtime.packageId} must own its local junction`);
    return runtime.groundProfile.stageJunction.separatedChildCenterL(path.secondForkSide);
  }
  return 0;
}

function runDeepBrowserPath(path) {
  const parentGuide = createM2StadiumGuide();
  const parent = parentShared(parentGuide);
  const assets = createM4SpriteAssets();
  const live = createM627LiveRouteRuntime(parentGuide, parent, assets);
  const car = createM5Car(parentGuide, parent.heightProfile, parent.surfaceMap, 390);
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
  const acceptedChoices = [];
  const committedPackages = [];
  const renderedPackages = new Set();
  const speedAtCommit = [];
  let previousRoutePoint = { x: car.x, z: car.z };
  let finishCount = 0;
  let renderCountAfterFinish = 0;
  let tickReachedFinish = null;
  const initialRuntime = resolveActiveStageRuntimeContent(live.registry, handoffState);
  let camera = updateM5Camera(cameraRig, initialRuntime.coordinateFrame, initialRuntime.heightProfile, car, CAMERA_PROFILE, DT);

  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    const runtimeBefore = resolveActiveStageRuntimeContent(live.registry, handoffState);
    const input = sampleRivalDrivingInput(
      guideCoordinateCurve(runtimeBefore.coordinateFrame),
      car,
      targetLForRuntime(runtimeBefore, path),
    );
    updateM5Car(runtimeBefore.coordinateFrame, runtimeBefore.heightProfile, runtimeBefore.surfaceMap, car, input, DT);

    const recovered = updateM5Recovery(
      recovery,
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      car,
      DT,
    );
    let routeUpdate = null;
    let handoffEvent = null;

    if (recovered !== null) {
      previousRoutePoint = { x: car.x, z: car.z };
      syncRouteStageHandoffCoordinate(handoffState, live.charts, previousRoutePoint);
    } else {
      const currentRoutePoint = { x: car.x, z: car.z };
      if (handoffState.pending === null) {
        const observation = observeRouteBoundaryCrossing(
          live.route,
          routeState,
          live.gates,
          previousRoutePoint,
          currentRoutePoint,
        );
        routeUpdate = updateRouteDag(routeState, live.route, observation.boundary);
        if (routeUpdate.acceptedChoice !== null) acceptedChoices.push(routeUpdate.acceptedChoice.id);
        queueRouteStageHandoff(handoffState, live.handoffs, routeUpdate);
      }

      const handoffObservation = observePendingRouteStageHandoff(
        handoffState,
        live.handoffs,
        previousRoutePoint,
        currentRoutePoint,
      );
      handoffEvent = commitRouteStageHandoff(
        handoffState,
        routeState,
        live.content,
        live.charts,
        handoffObservation.seam,
        currentRoutePoint,
      );
      if (handoffEvent === 'COMMITTED') {
        const runtimeAfter = resolveActiveStageRuntimeContent(live.registry, handoffState);
        car.course = { ...handoffState.coordinate };
        rebaseM5CameraRigCoordinateFrame(cameraRig, runtimeBefore.coordinateFrame, runtimeAfter.coordinateFrame);
        committedPackages.push(runtimeAfter.packageId);
        speedAtCommit.push(car.speed);
      } else {
        syncRouteStageHandoffCoordinate(handoffState, live.charts, currentRoutePoint);
      }
      previousRoutePoint = currentRoutePoint;
    }

    const finish = createValidatedRunFinishFromRoute(routeState, routeUpdate);
    const objectiveUpdate = updateRunObjectiveFromValidatedFinish(
      objective,
      POINT_TO_POINT_OBJECTIVE,
      finish,
      (tick + 1) * DT,
    );
    if (objectiveUpdate.justFinished) {
      finishCount += 1;
      tickReachedFinish = tick;
    }

    const runtimeAfterTick = resolveActiveStageRuntimeContent(live.registry, handoffState);
    camera = updateM5Camera(
      cameraRig,
      runtimeAfterTick.coordinateFrame,
      runtimeAfterTick.heightProfile,
      car,
      CAMERA_PROFILE,
      DT,
    );

    const shouldRender = handoffEvent === 'COMMITTED' || tick % 12 === 0 || objective.status === 'FINISHED';
    if (shouldRender) {
      renderM5Driving(
        framebuffer,
        runtimeAfterTick.selectFarBackground(camera.s),
        guideCoordinateCurve(runtimeAfterTick.coordinateFrame),
        camera,
        car,
        runtimeAfterTick.terrainProfile,
        runtimeAfterTick.groundProfile,
        runtimeAfterTick.worldSprites,
        assets,
        'car',
        runtimeAfterTick.roadView ?? undefined,
      );
      renderedPackages.add(runtimeAfterTick.packageId);
      if (objective.status === 'FINISHED') renderCountAfterFinish += 1;
    }

    if (objective.status === 'FINISHED' && renderCountAfterFinish >= POST_FINISH_RENDER_FRAMES) break;
  }

  return {
    car,
    routeState,
    handoffState,
    objective,
    acceptedChoices,
    committedPackages,
    renderedPackages,
    speedAtCommit,
    recoveryCount: recovery.recoveries,
    finishCount,
    renderCountAfterFinish,
    tickReachedFinish,
  };
}

for (const path of PATHS) {
  test(`M6.39 browser-order 60 Hz ${path.name} path crosses four gates, commits four charts, physically finishes and keeps rendering`, () => {
    const result = runDeepBrowserPath(path);
    const diagnostic = `route=${result.routeState.activeStageId} status=${result.routeState.status} pkg=${result.handoffState.activePackageId} commits=${result.handoffState.commitCount} recoveries=${result.recoveryCount} choices=${result.acceptedChoices.join('>')} packages=${result.committedPackages.join('>')} finalS=${result.car.course.s.toFixed(3)} finalL=${result.car.course.l.toFixed(3)} speed=${result.car.speed.toFixed(3)} finishTick=${result.tickReachedFinish ?? 'NONE'} postFinishRenders=${result.renderCountAfterFinish}`;

    assert.deepEqual(result.acceptedChoices, path.choices, `physical gate sequence must match authored path; ${diagnostic}`);
    assert.deepEqual(result.committedPackages, path.packages, `seam COMMIT sequence must match authored path; ${diagnostic}`);
    assert.equal(result.handoffState.commitCount, 4, `deep path must perform four handoffs; ${diagnostic}`);
    assert.equal(result.routeState.status, 'FINISHED', `terminal physical FINISH must complete RouteDag; ${diagnostic}`);
    assert.equal(result.routeState.activeStageId, path.terminalStageId, `finish must belong to selected terminal; ${diagnostic}`);
    assert.equal(result.objective.status, 'FINISHED', `validated route finish must complete point-to-point objective; ${diagnostic}`);
    assert.equal(result.objective.finishId, path.terminalStageId, `objective finish id must match terminal stage; ${diagnostic}`);
    assert.equal(result.finishCount, 1, `validated finish must be recorded exactly once; ${diagnostic}`);
    assert.equal(result.recoveryCount, 0, `route gates and handoffs must not require recovery; ${diagnostic}`);
    assert.equal(result.speedAtCommit.length, 4, `every handoff must record a physical speed; ${diagnostic}`);
    assert.ok(result.speedAtCommit.every((speed) => speed > 8), `car must remain moving through every COMMIT; speeds=${result.speedAtCommit.map((speed) => speed.toFixed(3)).join(',')}; ${diagnostic}`);
    assert.ok(result.renderCountAfterFinish >= POST_FINISH_RENDER_FRAMES, `renderer must continue after validated finish; ${diagnostic}`);

    const expectedRenderedPackages = ['CONTENT_STAGE_1', ...path.packages];
    for (const packageId of expectedRenderedPackages) {
      assert.equal(result.renderedPackages.has(packageId), true, `renderer must consume ${packageId}; ${diagnostic}`);
    }
  });
}
