import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import {
  createM626LiveContinuation,
  createM626LiveGateSet,
  createM626LiveHandoffManifest,
  createM626LiveRouteDag,
} from '../dist/dev/m6-26-live-successor-stage.js';
import { createM628DeclarativeLiveRouteRuntime } from '../dist/dev/m6-28-declarative-live-route.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
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

function setup() {
  const guide = createM2StadiumGuide();
  const assets = createM4SpriteAssets();
  const live = createM628DeclarativeLiveRouteRuntime(guide, parentShared(guide), assets);
  return { guide, assets, live };
}

test('M6.28 declarative rows compile the same five-stage route with derived package bindings', () => {
  const { live } = setup();
  assert.deepEqual(live.route.stages.map((stage) => [stage.id, stage.kind]), [
    ['STAGE_1', 'STAGE'],
    ['STAGE_2_L', 'STAGE'],
    ['STAGE_2_R', 'STAGE'],
    ['GOAL_L', 'TERMINAL'],
    ['GOAL_R', 'TERMINAL'],
  ]);
  assert.deepEqual(live.route.choices.map((choice) => choice.id), [
    'S1_LEFT',
    'S1_RIGHT',
    'S2L_CONTINUE',
    'S2R_CONTINUE',
  ]);
  assert.deepEqual(live.content.bindings.map((binding) => [binding.stageId, binding.packageId]), [
    ['STAGE_1', 'CONTENT_STAGE_1'],
    ['STAGE_2_L', 'CONTENT_STAGE_2_L'],
    ['STAGE_2_R', 'CONTENT_STAGE_2_R'],
    ['GOAL_L', 'CONTENT_GOAL_L'],
    ['GOAL_R', 'CONTENT_GOAL_R'],
  ]);
});

test('M6.28 declarative compiler reproduces M6.26 physical gates and handoff seams exactly', () => {
  const { guide, live } = setup();
  const legacyRoute = createM626LiveRouteDag();
  const legacyContinuation = createM626LiveContinuation(guide);
  const legacyGates = createM626LiveGateSet(legacyRoute, legacyContinuation);
  const legacyHandoffs = createM626LiveHandoffManifest(legacyRoute, legacyContinuation);

  assert.deepEqual(live.gates.gates.map((gate) => gate.id), legacyGates.gates.map((gate) => gate.id));
  for (const gate of live.gates.gates) {
    const legacy = legacyGates.gates.find((candidate) => candidate.id === gate.id);
    assert.ok(legacy);
    near(gate.center.x, legacy.center.x);
    near(gate.center.z, legacy.center.z);
    near(gate.heading, legacy.heading);
    near(gate.halfWidth, legacy.halfWidth);
  }

  assert.deepEqual(live.handoffs.seams.map((seam) => seam.id), legacyHandoffs.seams.map((seam) => seam.id));
  for (const seam of live.handoffs.seams) {
    const legacy = legacyHandoffs.seams.find((candidate) => candidate.id === seam.id);
    assert.ok(legacy);
    assert.equal(seam.choiceId, legacy.choiceId);
    assert.equal(seam.targetChartId, legacy.targetChartId);
    near(seam.center.x, legacy.center.x);
    near(seam.center.z, legacy.center.z);
    near(seam.heading, legacy.heading);
  }
});

test('M6.28 target chart ids are derived from target stage runtime rather than repeated in route rows', async () => {
  const { readFile } = await import('node:fs/promises');
  const compiler = await readFile(new URL('../src/runtime/declarative-live-route.ts', import.meta.url), 'utf8');
  const authoring = await readFile(new URL('../src/dev/m6-28-declarative-live-route.ts', import.meta.url), 'utf8');

  assert.match(compiler, /choiceId: transition\.id/);
  assert.match(compiler, /targetChartId: targetStage\.runtime\.coordinateFrame\.id/);
  assert.doesNotMatch(authoring, /targetChartId\s*:/);
  assert.doesNotMatch(authoring, /choiceId\s*:/);
});

test('M6.28 keeps main stable and its declarative compiler remains underneath later live-route authoring', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, entrySource, m630Source, fragmentSource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-27-live-route-runtime.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-30-third-live-successor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/runtime/declarative-route-fragment.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(mainSource, /createM627LiveRouteRuntime/);
  assert.doesNotMatch(mainSource, /createM628DeclarativeLiveRouteRuntime|createM626LiveRouteDag|createM626LiveContinuation|createM630ThirdLiveSuccessorRuntime/);
  assert.match(entrySource, /createM630ThirdLiveSuccessorRuntime/);
  assert.match(m630Source, /compileDeclarativeRouteFragments/);
  assert.match(fragmentSource, /compileDeclarativeLiveRoute\(composeDeclarativeLiveRouteAuthoring\(source\)\)/);
  assert.doesNotMatch(entrySource, /createM626LiveRouteDag|createM626LiveGateSet|createM626LiveHandoffManifest/);
});

test('M6.28 generic declarative compiler contains no renderer, camera, vehicle physics or milestone dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/runtime/declarative-live-route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /render\//);
  assert.doesNotMatch(source, /m5-camera/);
  assert.doesNotMatch(source, /car-physics|motorcycle-physics/);
  assert.doesNotMatch(source, /M6_2[678]|m6-2[678]/);
});
