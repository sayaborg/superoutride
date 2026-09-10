import { parentShared } from './helpers/stage-parent-fixture.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { guideCoordinateCurve } from '../dist/core/guide-coordinate-frame.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM638DeclarativeForkGrowthRuntime } from '../dist/dev/m6-38-declarative-fork-growth-plan.js';

import { createCameraRig, updateCamera } from '../dist/camera/camera.js';
import { createRecoveryState, updateRecovery } from '../dist/gameplay/recovery.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  pendingRouteStageRecoveryTarget,
  queueRouteStageHandoff,
  syncRouteStageHandoffCoordinate,
} from '../dist/gameplay/route-stage-handoff.js';
import { createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';
import { LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE } from '../dist/vehicle/production-vehicle-profiles.js';

import { renderDriving } from '../dist/render/renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

const DT = 1 / 60;
const CAMERA_PROFILE = {
  dCam: 5,
  height: 2.469902425419539,
  baseDownPitch: (8 * Math.PI) / 180,
  focalLength: 200,
  centerX: 160,
  centerY: 120,
  directionSpeedMin: 0.25,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
};

test('live browser-order 60 Hz drive crosses LEFT fork, commits child and keeps rendering', () => {
  const parentGuide = createM2StadiumGuide();
  const parent = parentShared(parentGuide);
  const assets = createSpriteAssets();
  const live = createM638DeclarativeForkGrowthRuntime(parentGuide, parent, assets);
  const car = createTestCar(
    parentGuide,
    parent.heightProfile,
    parent.surfaceMap,
    390,
    0,
    45,
    LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE,
  );
  const routeState = createRouteDagState(live.route);
  const handoffState = createRouteStageHandoffState(live.route, live.content, live.initialChart, {
    x: car.x,
    z: car.z,
  });
  const recovery = createRecoveryState(car);
  const cameraRig = createCameraRig();
  const framebuffer = new SoftwareSurface(320, 240, new Uint32Array(320 * 240));
  let previousRoutePoint = { x: car.x, z: car.z };
  let minSpeedAfterChoice = Infinity;
  let sawChoice = false;
  let sawCommit = false;
  let recoveryCountAtChoice = 0;
  let maxParentS = car.course.s;
  let renderCountAfterCommit = 0;
  const initialRuntime = resolveActiveStageRuntimeContent(live.registry, handoffState);
  let camera = updateCamera(
    cameraRig,
    initialRuntime.coordinateFrame,
    initialRuntime.heightProfile,
    car,
    CAMERA_PROFILE,
    DT,
  );

  for (let tick = 0; tick < 900; tick += 1) {
    const runtimeBefore = resolveActiveStageRuntimeContent(live.registry, handoffState);
    const targetL = runtimeBefore.packageId === 'CONTENT_STAGE_1' ? M6_13_JUNCTION.separatedChildCenterL('LEFT') : 0;
    const input = sampleRivalDrivingInput(runtimeBefore.coordinateFrame, car, targetL);
    updateTestVehicle(
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      car,
      input,
      DT,
    );
    if (runtimeBefore.packageId === 'CONTENT_STAGE_1') maxParentS = Math.max(maxParentS, car.course.s);

    const recovered = updateRecovery(
      { guide: runtimeBefore.coordinateFrame, height: runtimeBefore.heightProfile, surfaces: runtimeBefore.surfaceMap },
      car,
      { state: recovery, dt: DT, target: pendingRouteStageRecoveryTarget(handoffState, 8) },
    );
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
        const routeUpdate = updateRouteDag(routeState, live.route, observation.boundary);
        queueRouteStageHandoff(handoffState, live.handoffs, routeUpdate);
        if (routeUpdate.acceptedChoice?.id === 'S1_LEFT') {
          sawChoice = true;
          recoveryCountAtChoice = recovery.recoveries;
        }
      }

      const handoffObservation = observePendingRouteStageHandoff(
        handoffState,
        live.handoffs,
        previousRoutePoint,
        currentRoutePoint,
      );
      const handoffEvent = commitRouteStageHandoff(
        handoffState,
        routeState,
        live.content,
        live.charts,
        handoffObservation.seam,
        currentRoutePoint,
      );
      if (handoffEvent === 'COMMITTED') {
        car.course = { ...handoffState.coordinate };
        if (handoffState.activePackageId === 'CONTENT_STAGE_2_L') sawCommit = true;
      } else {
        syncRouteStageHandoffCoordinate(handoffState, live.charts, currentRoutePoint);
      }
      previousRoutePoint = currentRoutePoint;
    }

    if (sawChoice) minSpeedAfterChoice = Math.min(minSpeedAfterChoice, car.speed);

    const runtimeAfterTick = resolveActiveStageRuntimeContent(live.registry, handoffState);
    camera = updateCamera(
      cameraRig,
      runtimeAfterTick.coordinateFrame,
      runtimeAfterTick.heightProfile,
      car,
      CAMERA_PROFILE,
      DT,
    );
    if (sawCommit) {
      renderDriving(
        framebuffer,
        {
          background: runtimeAfterTick.selectFarBackground(camera.s),
          guide: guideCoordinateCurve(runtimeAfterTick.coordinateFrame),
          camera,
          vehicle: car,
          terrainProfile: runtimeAfterTick.terrainProfile,
          groundProfile: runtimeAfterTick.groundProfile,
          worldSprites: runtimeAfterTick.worldSprites,
          assets,
          playerKind: 'car',
        },
        { roadView: runtimeAfterTick.roadView ?? undefined },
      );
      renderCountAfterCommit += 1;
    }
    if (sawCommit && car.course.s > 80 && renderCountAfterCommit >= 30) break;
  }

  const diagnostic = `parentMaxS=${maxParentS.toFixed(3)} finalS=${car.course.s.toFixed(3)} finalL=${car.course.l.toFixed(3)} speed=${car.speed.toFixed(3)} recoveries=${recovery.recoveries} recoveriesAtChoice=${recoveryCountAtChoice} lastRecovery=${recovery.lastReason} lastSafeS=${recovery.lastSafeS.toFixed(3)} route=${routeState.activeStageId} pending=${handoffState.pending?.choiceId ?? 'NONE'} pkg=${handoffState.activePackageId} renderedAfterCommit=${renderCountAfterCommit}`;
  assert.equal(sawChoice, true, `physical car must select LEFT; ${diagnostic}`);
  assert.equal(sawCommit, true, `physical car must commit child; ${diagnostic}`);
  assert.ok(renderCountAfterCommit >= 30, `renderer must continue after fork handoff; ${diagnostic}`);
  assert.ok(car.course.s > 80, `car should continue on child stage; ${diagnostic}`);
  assert.ok(
    minSpeedAfterChoice > 8,
    `car must not stall at fork; min=${minSpeedAfterChoice.toFixed(3)}; ${diagnostic}`,
  );
  assert.ok(
    recovery.recoveries <= recoveryCountAtChoice + 1,
    `pending recovery may reconstruct once before the seam but must not loop; ${diagnostic}`,
  );
});
