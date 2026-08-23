import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM621ChildVisualIdentity } from '../dist/dev/m6-21-child-visual-identity.js';
import { createM624ChildStageAuthoring } from '../dist/dev/m6-24-stage-authoring.js';
import { createM630ThirdLiveSuccessorAuthoring } from '../dist/dev/m6-30-third-live-successor.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { guideChartToWorld } from '../dist/gameplay/guide-chart.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { compileDeclarativeLiveRoute } from '../dist/runtime/declarative-live-route.js';
import { compileRasterForkStageRoute } from '../dist/runtime/raster-fork-stage-route.js';
import { compileAuthoredStageRuntimePackage } from '../dist/runtime/stage-authoring-compiler.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

const near = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

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

function branch(label, side, deformationDirection) {
  return {
    side,
    stageId: `TEST_GOAL_${label}`,
    packageId: `CONTENT_TEST_GOAL_${label}`,
    choiceId: `TEST_FORK_${label}`,
    gateId: `G_TEST_FORK_${label}`,
    handoffId: `H_TEST_FORK_${label}`,
    finishGateId: `G_TEST_FINISH_${label}`,
    successor: {
      id: `TEST_${label}_SUCCESSOR`,
      chartId: `TEST_${label}_CHART`,
      roadViewId: `TEST_${label}_VIEW`,
      surfaceSectionName: `TEST_${label}_STAGE`,
      sourceSeamMinS: 235,
      overlapMargin: 30,
      transitionLead: 20,
      finishAfterSeam: 140,
      deformationMeters: 2.5,
      deformationDirection,
      gentleTurnLimitDegrees: 5,
      minDeformationRunVertices: 5,
      dCam: 5,
      dMax: 150,
      finishClosureMargin: 20,
      groundMapHalfWidth: 12,
      groundHalfWidth: 4.5,
      shoulderWidth: 1,
    },
  };
}

function fixture() {
  const guide = createM2StadiumGuide();
  const assets = createM4SpriteAssets();
  const upstream = createM630ThirdLiveSuccessorAuthoring(guide, parentShared(guide), assets);
  const authored = createM624ChildStageAuthoring(assets, createM621ChildVisualIdentity());
  const oldTerminal = upstream.stages.find((stage) => stage.id === 'GOAL_L');
  assert.ok(oldTerminal);
  const branches = [branch('A', 'LEFT', -1), branch('B', 'RIGHT', 1)];
  const source = {
    upstream,
    terminalStageId: 'GOAL_L',
    forkStageId: 'TEST_FORK_STAGE',
    forkPackageId: 'CONTENT_TEST_FORK_STAGE',
    routeGateS: 195,
    junction: {
      roadViewId: 'TEST_FORK_VIEW',
      surfaceSectionName: 'TEST_FORK_SURFACE',
      crossSection: {
        sWidenStart: 80,
        sMedianStart: 110,
        sSeparatedStart: 170,
        parentRoadWidth: 7,
        childRoadWidth: 7,
        finalMedianWidth: 8,
        shoulderWidth: 1,
      },
      outerSurfaceType: 'GRASS',
    },
    branches,
    createRuntime: (structural, forkBranch) => compileAuthoredStageRuntimePackage({
      packageId: forkBranch.packageId,
      worldFrameId: oldTerminal.runtime.worldFrameId,
      coordinateFrame: structural.chart,
      roadView: structural.roadView,
      surfaceMap: structural.surfaceMap,
      groundProfile: structural.groundProfile,
    }, forkBranch.side === 'LEFT' ? authored.left : authored.right),
  };
  return { guide, assets, upstream, source, branches, oldTerminal };
}

test('M6.36 generic compiler promotes one terminal and derives a two-child route fragment', () => {
  const { source } = fixture();
  const compiled = compileRasterForkStageRoute(source);
  const ids = compiled.authoring.stages.map((stage) => stage.id);
  assert.equal(ids.includes('GOAL_L'), false);
  assert.equal(ids.includes('TEST_FORK_STAGE'), true);
  assert.equal(ids.includes('TEST_GOAL_A'), true);
  assert.equal(ids.includes('TEST_GOAL_B'), true);

  const incoming = compiled.authoring.transitions.find((edge) => edge.id === 'S3L_CONTINUE');
  assert.ok(incoming);
  assert.equal(incoming.toStageId, 'TEST_FORK_STAGE');
  assert.deepEqual(compiled.branches.map((entry) => [entry.transition.fromStageId, entry.transition.toStageId]), [
    ['TEST_FORK_STAGE', 'TEST_GOAL_A'],
    ['TEST_FORK_STAGE', 'TEST_GOAL_B'],
  ]);
  assert.deepEqual(compiled.branches.map((entry) => entry.finish.stageId), ['TEST_GOAL_A', 'TEST_GOAL_B']);

  const live = compileDeclarativeLiveRoute(compiled.authoring);
  assert.equal(live.route.stages.filter((stage) => stage.kind === 'TERMINAL').length, 3);
  assert.equal(live.gates.gates.filter((gate) => gate.kind === 'FINISH').length, 3);
});

test('M6.36 derives child centers and gate width from the stage-local junction authority', () => {
  const { source } = fixture();
  const compiled = compileRasterForkStageRoute(source);
  assert.equal(compiled.junction.requiredGroundHalfWidth, 12);
  assert.deepEqual(compiled.branches.map((entry) => entry.sourceLocalL), [-7.5, 7.5]);

  for (const entry of compiled.branches) {
    assert.equal(entry.transition.gate.halfWidth, 3.5);
    assert.equal(entry.transition.handoff.halfWidth, 3.5);
    assert.equal(entry.finish.gate.halfWidth, 3.5);
    assert.equal(entry.structural.roadView.roadLeft, 3.5);
    assert.equal(entry.structural.roadView.roadRight, 3.5);
    const expected = guideChartToWorld(compiled.forkRuntime.coordinateFrame, 195, entry.sourceLocalL);
    near(entry.transition.gate.center.x, expected.x);
    near(entry.transition.gate.center.z, expected.z);
    near(entry.transition.gate.heading, expected.heading);
  }
});

test('M6.36 fork links preserve source child-center coordinates and target local l=0 across D_cam overlap', () => {
  const { source } = fixture();
  const compiled = compileRasterForkStageRoute(source);
  for (const entry of compiled.branches) {
    assert.equal(entry.structural.link.sourceFrame, compiled.forkRuntime.coordinateFrame);
    assert.equal(entry.structural.link.sourceLocalL, entry.sourceLocalL);
    assert.equal(entry.structural.link.targetLocalL, 0);
    assert.equal(entry.structural.link.overlapBehind, 5);
    assert.equal(entry.structural.link.overlapAhead, 5);
    assert.ok(entry.structural.sourceSeamS > source.routeGateS);
    assert.equal(entry.runtime.coordinateFrame, entry.structural.chart);
  }
});

test('M6.36 rejects invalid terminal promotion, duplicate branch side and pre-separation route gate', () => {
  const { source } = fixture();
  const nonTerminal = {
    ...source,
    upstream: {
      ...source.upstream,
      stages: source.upstream.stages.map((stage) => stage.id === 'GOAL_L' ? { ...stage, kind: 'STAGE' } : stage),
    },
  };
  assert.throws(() => compileRasterForkStageRoute(nonTerminal), /must be TERMINAL/);

  const noFinish = {
    ...source,
    upstream: {
      ...source.upstream,
      finishes: source.upstream.finishes.filter((finish) => finish.stageId !== 'GOAL_L'),
    },
  };
  assert.throws(() => compileRasterForkStageRoute(noFinish), /exactly one physical FINISH/);

  const duplicateSide = {
    ...source,
    branches: [source.branches[0], { ...source.branches[1], side: 'LEFT' }],
  };
  assert.throws(() => compileRasterForkStageRoute(duplicateSide), /duplicate Raster fork branch side/);
  assert.throws(() => compileRasterForkStageRoute({ ...source, routeGateS: 160 }), /fully separated/);
});

test('M6.36 rejects branch runtime package/chart ownership mismatches before route compilation', () => {
  const { source, oldTerminal } = fixture();
  assert.throws(() => compileRasterForkStageRoute({
    ...source,
    createRuntime: () => oldTerminal.runtime,
  }), /runtime package mismatch/);

  assert.throws(() => compileRasterForkStageRoute({
    ...source,
    createRuntime: (_structural, forkBranch) => ({
      ...oldTerminal.runtime,
      packageId: forkBranch.packageId,
    }),
  }), /runtime must own generated chart/);
});

test('M6.36 keeps generic fork composition route/runtime-only and M6.35 delegates to it', async () => {
  const [compiler, milestone, main, renderer] = await Promise.all([
    readFile(new URL('../src/runtime/raster-fork-stage-route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-35-second-live-fork.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(compiler, /\.\.\/dev\/|render\/|m5-camera|car-physics|motorcycle-physics/);
  assert.match(compiler, /compileStageJunction/);
  assert.match(compiler, /createRasterForkStageSuccessor/);
  assert.match(compiler, /composeDeclarativeLiveRouteAuthoring/);

  assert.match(milestone, /compileRasterForkStageRoute/);
  assert.doesNotMatch(milestone, /compileStageJunction|createRasterForkStageSuccessor|baseStages|baseTransitions|forkTransition|pointGeometry/);
  assert.doesNotMatch(milestone, /sourceLocalL\s*:/);
  assert.doesNotMatch(milestone, /roadHalfWidth\s*:/);
  assert.doesNotMatch(main, /TEST_FORK_STAGE|STAGE_4_L_FORK|GOAL_LA|GOAL_LB|S4L_FORK/);
  assert.doesNotMatch(renderer, /TEST_FORK_STAGE|STAGE_4_L_FORK|GOAL_LA|GOAL_LB|S4L_FORK/);
});
