import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideCoordinateCurve } from '../dist/core/guide-coordinate-frame.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
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
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

const DT = 1 / 60;

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

test('live 60 Hz car physics crosses the visible LEFT fork and keeps moving after first handoff', () => {
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
  let previousRoutePoint = { x: car.x, z: car.z };
  let minSpeedAfterChoice = Infinity;
  let sawChoice = false;
  let sawCommit = false;
  let recoveryCountAtChoice = 0;
  let maxParentS = car.course.s;

  for (let tick = 0; tick < 900; tick += 1) {
    const runtimeBefore = resolveActiveStageRuntimeContent(live.registry, handoffState);
    const targetL = runtimeBefore.packageId === 'CONTENT_STAGE_1'
      ? M6_13_JUNCTION.separatedChildCenterL('LEFT')
      : 0;
    const input = sampleRivalDrivingInput(guideCoordinateCurve(runtimeBefore.coordinateFrame), car, targetL);
    updateM5Car(
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      car,
      input,
      DT,
    );
    if (runtimeBefore.packageId === 'CONTENT_STAGE_1') maxParentS = Math.max(maxParentS, car.course.s);

    const recovered = updateM5Recovery(
      recovery,
      runtimeBefore.coordinateFrame,
      runtimeBefore.heightProfile,
      runtimeBefore.surfaceMap,
      car,
      DT,
    );
    if (recovered !== null) {
      previousRoutePoint = { x: car.x, z: car.z };
      syncRouteStageHandoffCoordinate(handoffState, live.charts, previousRoutePoint);
      continue;
    }

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

    if (sawChoice) minSpeedAfterChoice = Math.min(minSpeedAfterChoice, car.speed);
    if (sawCommit && car.course.s > 80) break;
  }

  const diagnostic = `parentMaxS=${maxParentS.toFixed(3)} finalS=${car.course.s.toFixed(3)} finalL=${car.course.l.toFixed(3)} speed=${car.speed.toFixed(3)} recoveries=${recovery.recoveries} route=${routeState.activeStageId} pending=${handoffState.pending?.choiceId ?? 'NONE'} pkg=${handoffState.activePackageId}`;
  assert.equal(sawChoice, true, `scripted physical car must select the visible LEFT road; ${diagnostic}`);
  assert.equal(sawCommit, true, `scripted physical car must cross the first handoff seam; ${diagnostic}`);
  assert.ok(car.course.s > 80, `car should continue on child stage; ${diagnostic}`);
  assert.ok(minSpeedAfterChoice > 8, `car must not stall at fork; min=${minSpeedAfterChoice.toFixed(3)}; ${diagnostic}`);
  assert.equal(recovery.recoveries, recoveryCountAtChoice, `fork/handoff must not require recovery; ${diagnostic}`);
});
