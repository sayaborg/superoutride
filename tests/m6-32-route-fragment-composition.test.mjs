import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM630ThirdLiveSuccessorRuntime } from '../dist/dev/m6-30-third-live-successor.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';
import {
  composeDeclarativeLiveRouteAuthoring,
} from '../dist/runtime/declarative-route-fragment.js';

const runtime = (id) => Object.freeze({ packageId: id });
const geometry = (id) => ({ id, center: { x: 0, z: 0 }, heading: 0, halfWidth: 3.5 });
const transition = (id, fromStageId, toStageId, gateId = `G_${id}`, handoffId = `H_${id}`) => ({
  id,
  fromStageId,
  toStageId,
  gate: geometry(gateId),
  handoff: geometry(handoffId),
});

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

test('M6.32 composes fragments by canonicalizing an identical shared stage exactly once', () => {
  const sharedRuntime = runtime('PKG_SHARED');
  const shared = { id: 'SHARED', kind: 'STAGE', runtime: sharedRuntime };
  const goal = { id: 'GOAL', kind: 'TERMINAL', runtime: runtime('PKG_GOAL') };
  const composed = composeDeclarativeLiveRouteAuthoring({
    startStageId: 'SHARED',
    fragments: [
      { stages: [shared] },
      { stages: [shared, goal], transitions: [transition('NEXT', 'SHARED', 'GOAL')] },
      { finishes: [{ stageId: 'GOAL', gate: geometry('FINISH') }] },
    ],
  });

  assert.deepEqual(composed.stages.map((stage) => stage.id), ['SHARED', 'GOAL']);
  assert.equal(composed.stages[0].runtime, sharedRuntime);
  assert.deepEqual(composed.transitions.map((edge) => edge.id), ['NEXT']);
  assert.deepEqual(composed.finishes.map((finish) => finish.stageId), ['GOAL']);
});

test('M6.32 rejects conflicting definitions of a shared stage instead of silently choosing one fragment', () => {
  const first = { id: 'SHARED', kind: 'STAGE', runtime: runtime('A') };
  const differentRuntime = { id: 'SHARED', kind: 'STAGE', runtime: runtime('B') };
  const differentKind = { id: 'SHARED', kind: 'TERMINAL', runtime: first.runtime };

  assert.throws(() => composeDeclarativeLiveRouteAuthoring({
    startStageId: 'SHARED', fragments: [{ stages: [first] }, { stages: [differentRuntime] }],
  }), /conflicting declarative route fragment stage/);
  assert.throws(() => composeDeclarativeLiveRouteAuthoring({
    startStageId: 'SHARED', fragments: [{ stages: [first] }, { stages: [differentKind] }],
  }), /conflicting declarative route fragment stage/);
});

test('M6.32 rejects cross-fragment transition and physical geometry identity collisions before RouteDag compilation', () => {
  const start = { id: 'START', kind: 'STAGE', runtime: runtime('START') };
  const a = { id: 'A', kind: 'TERMINAL', runtime: runtime('A') };
  const b = { id: 'B', kind: 'TERMINAL', runtime: runtime('B') };

  assert.throws(() => composeDeclarativeLiveRouteAuthoring({
    startStageId: 'START',
    fragments: [
      { stages: [start, a], transitions: [transition('DUP', 'START', 'A')] },
      { stages: [start, b], transitions: [transition('DUP', 'START', 'B', 'G_OTHER', 'H_OTHER')] },
    ],
  }), /duplicate declarative route fragment transition id/);

  assert.throws(() => composeDeclarativeLiveRouteAuthoring({
    startStageId: 'START',
    fragments: [
      { stages: [start, a], transitions: [transition('TO_A', 'START', 'A', 'G_SHARED')] },
      { stages: [start, b], transitions: [transition('TO_B', 'START', 'B', 'G_SHARED')] },
    ],
  }), /duplicate declarative route fragment physical gate\/handoff id/);
});

test('M6.32 rejects duplicate terminal FINISH ownership and a missing composed start stage', () => {
  const goal = { id: 'GOAL', kind: 'TERMINAL', runtime: runtime('GOAL') };
  assert.throws(() => composeDeclarativeLiveRouteAuthoring({
    startStageId: 'GOAL',
    fragments: [
      { stages: [goal], finishes: [{ stageId: 'GOAL', gate: geometry('F1') }] },
      { finishes: [{ stageId: 'GOAL', gate: geometry('F2') }] },
    ],
  }), /duplicate declarative route fragment finish stage id/);
  assert.throws(() => composeDeclarativeLiveRouteAuthoring({
    startStageId: 'MISSING', fragments: [{ stages: [goal] }],
  }), /start stage is not authored/);
});

test('M6.32 fragment composition remains the live authority as later milestones add another RIGHT fragment', async () => {
  const guide = createM2StadiumGuide();
  const live = createM630ThirdLiveSuccessorRuntime(guide, parentShared(guide), createM4SpriteAssets());
  assert.deepEqual(live.route.stages.map((stage) => stage.id), [
    'STAGE_1', 'STAGE_2_L', 'STAGE_2_R', 'STAGE_3_L', 'GOAL_L', 'STAGE_3_R', 'GOAL_R',
  ]);
  assert.deepEqual(live.route.choices.map((edge) => edge.id), [
    'S1_LEFT', 'S1_RIGHT', 'S2L_CONTINUE', 'S3L_CONTINUE', 'S2R_CONTINUE', 'S3R_CONTINUE',
  ]);

  const [composerSource, liveSource, rendererSource, mainSource] = await Promise.all([
    readFile(new URL('../src/runtime/declarative-route-fragment.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-30-third-live-successor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(composerSource, /render\/|car-physics|motorcycle-physics|src\/dev|\.\.\/dev\//);
  assert.match(composerSource, /compileDeclarativeLiveRoute\(composeDeclarativeLiveRouteAuthoring\(source\)\)/);
  assert.match(liveSource, /composeDeclarativeLiveRouteAuthoring/);
  assert.match(liveSource, /compileDeclarativeLiveRoute\s*\(/);
  assert.doesNotMatch(rendererSource, /DeclarativeRouteFragment|STAGE_3_[LR]|S3[LR]_CONTINUE/);
  assert.doesNotMatch(mainSource, /DeclarativeRouteFragment|STAGE_3_[LR]|S3[LR]_CONTINUE/);
});
