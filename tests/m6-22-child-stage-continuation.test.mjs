import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { guideCoordinateToWorld } from '../dist/core/guide-coordinate-frame.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { createM617RouteStageHandoffManifest, M6_17_HANDOFF_SEAM_S } from '../dist/dev/m6-17-handoff-seams.js';
import { createM620LivePointToPointRouteDag } from '../dist/dev/m6-20-live-point-to-point.js';
import {
  M6_22_CHILD_FINISH_S,
  createM622ChildStageCharts,
  createM622ChildStageRoadViews,
  createM622LivePointToPointGateSet,
  createM622LiveStageRuntimeRegistry,
} from '../dist/dev/m6-22-child-stage-continuation.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { rebaseM5CameraRigWorldPosition } from '../dist/dev/m5-camera.js';
import { createM6DebugRouteStageContentManifest } from '../dist/gameplay/route-stage-content.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';

const near = (actual, expected, tolerance = 1e-5) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

function setup() {
  const parent = createM2StadiumGuide();
  const route = createM620LivePointToPointRouteDag();
  const manifest = createM6DebugRouteStageContentManifest(route);
  const charts = createM622ChildStageCharts(parent);
  const roadViews = createM622ChildStageRoadViews(charts);
  const gates = createM622LivePointToPointGateSet(route, parent, charts);
  const handoffs = createM617RouteStageHandoffManifest(route, parent, charts);

  const compiled = compileSurfaceRegions(parent.length, createM5DebugSurfaceRegionAuthoring(parent.length));
  const surfaceMap = new CyclicSurfaceMap(parent.length, compiled.surfaceSections, M6_13_JUNCTION);
  const heightProfile = createM3DebugHeightProfile(parent.length);
  const visualProfile = new CyclicVisualProfile(parent.length, compiled.visualSections);
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
  const background = createM3FarBackground();
  const registry = createM622LiveStageRuntimeRegistry(manifest, charts, roadViews, {
    heightProfile,
    surfaceMap,
    terrainProfile,
    groundProfile,
    selectFarBackground: () => background,
    worldSprites: [],
  });
  return { parent, route, manifest, charts, roadViews, gates, handoffs, registry };
}

test('M6.22 child Guides begin at the exact parent handoff world centers with the same tangent', () => {
  const { parent, charts } = setup();
  for (const [side, chart] of [['LEFT', charts.left], ['RIGHT', charts.right]]) {
    const sourceL = M6_13_JUNCTION.separatedChildCenterL(side);
    const parentSeam = guideCourseToWorld(parent, M6_17_HANDOFF_SEAM_S, sourceL);
    const childSeam = guideCoordinateToWorld(chart, 0, 0);
    near(childSeam.x, parentSeam.x);
    near(childSeam.z, parentSeam.z);
    near(Math.sin(childSeam.heading - parentSeam.heading), 0, 1e-6);
    assert.notEqual(chart.guide, parent);
  }
});

test('M6.22 LEFT and RIGHT continuation geometry is genuinely different after handoff', () => {
  const { charts } = setup();
  const left = guideCoordinateToWorld(charts.left, 260, 0);
  const right = guideCoordinateToWorld(charts.right, 260, 0);
  assert.ok(Math.hypot(left.x - right.x, left.z - right.z) > 20);
});

test('M6.22 child runtime owns an independent 7m road plus two 1m shoulders', () => {
  const { registry } = setup();
  for (const packageId of ['CONTENT_GOAL_L', 'CONTENT_GOAL_R']) {
    const runtime = resolveActiveStageRuntimeContent(registry, { activePackageId: packageId });
    assert.equal(runtime.roadView.roadLeft, 3.5);
    assert.equal(runtime.roadView.roadRight, 3.5);
    assert.equal(runtime.roadView.shoulderWidth, 1);
    assert.equal(runtime.surfaceMap.sample(100, 0).type, 'ASPHALT');
    assert.equal(runtime.surfaceMap.sample(100, 4).type, 'SHOULDER');
    assert.equal(runtime.surfaceMap.sample(100, 5).type, 'VOID');
    assert.equal(runtime.groundProfile.baked, undefined);
  }
});

test('M6.22 physical FINISH gates live on child-local continuation chainage', () => {
  const { charts, gates } = setup();
  for (const [stageId, chart] of [['GOAL_L', charts.left], ['GOAL_R', charts.right]]) {
    const gate = gates.gates.find((candidate) => candidate.kind === 'FINISH' && candidate.stageId === stageId);
    assert.ok(gate);
    const expected = guideCoordinateToWorld(chart, M6_22_CHILD_FINISH_S, 0);
    near(gate.center.x, expected.x);
    near(gate.center.z, expected.z);
  }
});

test('M6.22 handoff manifest still validates on the parent seam but targets the independent child charts', () => {
  const { handoffs, charts } = setup();
  const left = handoffs.seams.find((entry) => entry.choiceId === 'S1_LEFT');
  const right = handoffs.seams.find((entry) => entry.choiceId === 'S1_RIGHT');
  assert.equal(left.targetChartId, charts.left.id);
  assert.equal(right.targetChartId, charts.right.id);
});

test('M6.22 camera rig can rebase from world XZ onto a different child Guide without changing yaw/filter state', () => {
  const { charts } = setup();
  const world = guideCoordinateToWorld(charts.left, charts.left.guide.length - 5, 0.25);
  const rig = { yaw: 0.42, lateral: -7.2, verticalCorrection: 0.3, initialized: true };
  rebaseM5CameraRigWorldPosition(rig, charts.left, world);
  near(rig.lateral, 0.25, 1e-4);
  assert.equal(rig.yaw, 0.42);
  assert.equal(rig.verticalCorrection, 0.3);
});

test('M6.22 browser wiring selects continuation packages while renderer Core remains route-blind', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, rendererSource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(mainSource, /createM622ChildStageCharts/);
  assert.match(mainSource, /createM622LivePointToPointGateSet/);
  assert.match(mainSource, /createM622LiveStageRuntimeRegistry/);
  assert.match(mainSource, /rebaseM5CameraRigWorldPosition/);
  assert.doesNotMatch(rendererSource, /M6_22|GOAL_[LR]|LEFT_CHILD|RIGHT_CHILD/);
});
