import test from 'node:test';
import assert from 'node:assert/strict';
import { createM6DebugRouteStageContentManifest } from '../dist/dev/m6-debug-route-stage-content.js';
import { createM6DebugRouteDag } from '../dist/dev/m6-debug-route-dag.js';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import {
  guideCoordinateToWorld,
  locateWorldOnGuideCoordinateGlobal,
} from '../dist/core/guide-coordinate-frame.js';
import { createM616ChildGuideCharts } from '../dist/dev/m6-16-child-guide-charts.js';
import { createM617RouteStageHandoffManifest } from '../dist/dev/m6-17-handoff-seams.js';
import { createM618StageRoadViews } from '../dist/dev/m6-18-stage-road-views.js';
import { createM619DebugStageRuntimeRegistry } from '../dist/dev/m6-19-stage-runtime-content.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import {
  createRouteDagState,
  updateRouteDag,
} from '../dist/gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
} from '../dist/gameplay/route-stage-handoff.js';
import { createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';
import { StageSurfaceMapView } from '../dist/physics/stage-surface-map-view.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import {
  compileStageRuntimeContentRegistry,
  resolveActiveStageRuntimeContent,
} from '../dist/runtime/stage-runtime-content.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

const near = (actual, expected, tolerance = 2e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

function setup() {
  const guide = createM2StadiumGuide();
  const route = createM6DebugRouteDag();
  const routeState = createRouteDagState(route);
  const routeContent = createM6DebugRouteStageContentManifest(route);
  const charts = createM616ChildGuideCharts(guide);
  const chartList = [charts.parent, charts.left, charts.right];
  const roadViews = createM618StageRoadViews(charts);
  const handoffManifest = createM617RouteStageHandoffManifest(route, guide, charts);
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  const terrainProfile = {
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
  };
  const farBackground = createM3FarBackground();
  const registry = createM619DebugStageRuntimeRegistry(
    routeContent,
    charts,
    roadViews,
    {
      heightProfile,
      surfaceMap,
      terrainProfile,
      groundProfile,
      selectFarBackground: () => farBackground,
      worldSprites: [],
    },
  );
  const spawn = guideCoordinateToWorld(charts.parent, 500, 0);
  const handoffState = createRouteStageHandoffState(
    route,
    routeContent,
    charts.parent,
    spawn,
  );

  return {
    guide,
    route,
    routeState,
    routeContent,
    charts,
    chartList,
    roadViews,
    handoffManifest,
    surfaceMap,
    heightProfile,
    terrainProfile,
    groundProfile,
    registry,
    handoffState,
  };
}

function crossingSegment(seam) {
  return {
    previous: {
      x: seam.center.x - seam.tangent.x,
      z: seam.center.z - seam.tangent.z,
    },
    current: {
      x: seam.center.x + seam.tangent.x,
      z: seam.center.z + seam.tangent.z,
    },
  };
}

test('M6.19 runtime registry covers every opaque route package exactly once', () => {
  const { routeContent, registry } = setup();
  assert.equal(registry.worldFrameId, routeContent.worldFrameId);
  assert.equal(registry.packages.length, routeContent.packages.length);
  assert.deepEqual(
    registry.packages.map((entry) => entry.packageId),
    routeContent.packages.map((entry) => entry.packageId),
  );

  const parent = registry.packages.find((entry) => entry.packageId === 'CONTENT_STAGE_1');
  const left = registry.packages.find((entry) => entry.packageId === 'CONTENT_STAGE_2_L');
  const right = registry.packages.find((entry) => entry.packageId === 'CONTENT_STAGE_2_R');
  assert.ok(parent && left && right);
  assert.equal(parent.roadView, null);
  assert.equal(left.roadView.id, 'LEFT_CHILD_ROAD_VIEW');
  assert.equal(right.roadView.id, 'RIGHT_CHILD_ROAD_VIEW');
  assert.equal(left.surfaceMap.sample(600, 0).type, 'ASPHALT');
  assert.equal(right.surfaceMap.sample(600, 0).type, 'ASPHALT');
  assert.equal(left.surfaceMap.sample(600, 15).type, 'VOID');
  assert.equal(right.surfaceMap.sample(600, -15).type, 'VOID');
});

test('PENDING route choice cannot switch runtime content before the validated handoff seam', () => {
  const { route, routeState, handoffManifest, registry, handoffState } = setup();
  const routeUpdate = updateRouteDag(routeState, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  assert.equal(routeState.activeStageId, 'STAGE_2_L');
  assert.equal(queueRouteStageHandoff(handoffState, handoffManifest, routeUpdate), 'PENDING');

  const runtime = resolveActiveStageRuntimeContent(registry, handoffState);
  assert.equal(runtime.packageId, 'CONTENT_STAGE_1');
  assert.equal(runtime.roadView, null);
  assert.equal(handoffState.activePackageId, 'CONTENT_STAGE_1');
});

test('validated seam atomically changes package, Guide coordinate frame and road view without changing world pose', () => {
  const {
    route,
    routeState,
    routeContent,
    chartList,
    handoffManifest,
    registry,
    handoffState,
  } = setup();
  const routeUpdate = updateRouteDag(routeState, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  queueRouteStageHandoff(handoffState, handoffManifest, routeUpdate);
  const seam = handoffManifest.seams.find((entry) => entry.choiceId === 'S1_LEFT');
  assert.ok(seam);
  const segment = crossingSegment(seam);
  const observation = observePendingRouteStageHandoff(
    handoffState,
    handoffManifest,
    segment.previous,
    segment.current,
  );
  const world = { x: seam.center.x, z: seam.center.z };
  const before = { ...world };
  assert.equal(
    commitRouteStageHandoff(
      handoffState,
      routeState,
      routeContent,
      chartList,
      observation.seam,
      world,
    ),
    'COMMITTED',
  );
  assert.deepEqual(world, before);

  const runtime = resolveActiveStageRuntimeContent(registry, handoffState);
  assert.equal(runtime.packageId, 'CONTENT_STAGE_2_L');
  assert.equal(runtime.roadView.id, 'LEFT_CHILD_ROAD_VIEW');
  const local = locateWorldOnGuideCoordinateGlobal(runtime.coordinateFrame, world, false);
  near(local.l, 0, 1e-5);
  near(handoffState.coordinate.l, 0, 1e-5);

  const sameWorld = guideCoordinateToWorld(runtime.coordinateFrame, local.s, 0);
  near(sameWorld.x, world.x, 1e-5);
  near(sameWorld.z, world.z, 1e-5);
  assert.equal(runtime.surfaceMap.sample(local.s, local.l).type, 'ASPHALT');
});

test('ordinary M5 car physics consumes a committed child Guide frame and child SurfaceMap without snapping', () => {
  const { charts, roadViews, surfaceMap, heightProfile } = setup();
  const leftSurface = new StageSurfaceMapView(surfaceMap, roadViews.left);
  const car = createTestCar(charts.left, heightProfile, leftSurface, 600, 0, 0);
  const before = { x: car.x, z: car.z, yaw: car.yaw };

  updateTestVehicle(
    charts.left,
    heightProfile,
    leftSurface,
    car,
    { steering: 0, throttle: false, brake: false },
    1 / 60,
  );

  near(car.x, before.x);
  near(car.z, before.z);
  near(car.yaw, before.yaw);
  near(car.course.l, 0, 1e-5);
  assert.equal(car.supported, true);
  assert.equal(car.surfaceType, 'ASPHALT');
});

test('runtime registry rejects missing packages, mixed world frames and coordinate/render origin mismatch', () => {
  const { routeContent, registry, roadViews } = setup();
  assert.throws(
    () => compileStageRuntimeContentRegistry(routeContent, registry.packages.slice(0, -1)),
    /missing runtime content/,
  );

  const first = registry.packages[0];
  assert.throws(
    () => compileStageRuntimeContentRegistry(routeContent, [
      { ...first, worldFrameId: 'OTHER_FRAME' },
      ...registry.packages.slice(1),
    ]),
    /worldFrameId mismatch/,
  );

  const leftIndex = registry.packages.findIndex((entry) => entry.packageId === 'CONTENT_STAGE_2_L');
  const mismatched = registry.packages.map((entry, index) => index === leftIndex
    ? { ...entry, roadView: roadViews.right }
    : entry);
  assert.throws(
    () => compileStageRuntimeContentRegistry(routeContent, mismatched),
    /coordinate\/road lateral origin mismatch/,
  );
});

test('M6.19 keeps route topology opaque and runtime selection free of RouteDag decision logic', async () => {
  const { readFile } = await import('node:fs/promises');
  const routeContentSource = await readFile(new URL('../src/gameplay/route-stage-content.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(routeContentSource, /stage-runtime-content|StageRoadView|SurfaceMapReader|FarBackground/);

  const runtimeSource = await readFile(new URL('../src/runtime/stage-runtime-content.ts', import.meta.url), 'utf8');
  const imports = [...runtimeSource.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert.equal(imports.some((entry) => entry.includes('/route-dag')), false);
  assert.match(runtimeSource, /activePackageId/);
});
