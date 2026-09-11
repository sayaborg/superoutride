import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';

import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';

import { createDeclarativeForkGrowthRuntime } from '../dist/dev/courses/fork-growth-plan.js';

import { compileLiveRouteRuntimeAssembly } from '../dist/runtime/live-route-runtime.js';
import { createFarBackground } from '../dist/visual/far-background.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

function setup() {
  const guide = createStadiumGuide();
  const { heightProfile, surfaceMap, visualProfile, groundProfile } = parentShared(guide);

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
  return createDeclarativeForkGrowthRuntime(
    guide,
    {
      heightProfile,
      surfaceMap,
      terrainProfile,
      groundProfile,
      selectFarBackground: () => createFarBackground(),
      worldSprites: [],
    },
    createSpriteAssets(),
  );
}

test('browser-facing bundle remains complete as later milestones deepen the live route', () => {
  const live = setup();
  assert.ok(live.route.stages.length >= 5);
  assert.equal(live.route.choices.length, live.handoffs.seams.length);
  assert.equal(live.charts.length, live.registry.packages.length);
  assert.equal(live.content.bindings.length, live.route.stages.length);
  assert.equal(live.gates.gates.filter((gate) => gate.kind === 'TRANSITION').length, live.route.choices.length);
  const terminalCount = live.route.stages.filter((stage) => stage.kind === 'TERMINAL').length;
  assert.equal(live.gates.gates.filter((gate) => gate.kind === 'FINISH').length, terminalCount);
});

test('every route target resolves through content/runtime to the exact handoff target chart', () => {
  const live = setup();
  for (const choice of live.route.choices) {
    const seam = live.handoffs.seams.find((candidate) => candidate.choiceId === choice.id);
    const binding = live.content.bindings.find((candidate) => candidate.stageId === choice.toStageId);
    assert.ok(seam);
    assert.ok(binding);
    const runtime = live.registry.packages.find((candidate) => candidate.packageId === binding.packageId);
    const chart = live.charts.find((candidate) => candidate.id === seam.targetChartId);
    assert.ok(runtime);
    assert.ok(chart);
    assert.equal(runtime.coordinateFrame, chart);
  }
});

test('assembly compiler rejects a start package/chart mismatch before simulation', () => {
  const live = setup();
  assert.throws(
    () => compileLiveRouteRuntimeAssembly({ ...live, initialChart: live.charts[1] }),
    /start package coordinate frame must be the initial chart/,
  );
});

test('browser main consumes one assembly and no longer constructs route pieces', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /createDeclarativeForkGrowthRuntime/);
  assert.match(source, /const liveRoute = createDeclarativeForkGrowthRuntime/);
  assert.doesNotMatch(
    source,
    /createLiveRouteDag|createLiveContinuation|createLiveGateSet|createLiveHandoffManifest|createSuccessorStageRegistry/,
  );
  assert.doesNotMatch(source, /createThirdLiveSuccessorRuntime|STAGE_3_L|S3L_CONTINUE/);
});

test('generic assembly contains no renderer, camera or vehicle-physics dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/runtime/live-route-runtime.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /render\//);
  assert.doesNotMatch(source, /camera\//);
  assert.doesNotMatch(source, /car-physics|motorcycle-physics/);
  assert.doesNotMatch(source, /M[0-9]+(?:[._][0-9]+)?/);
});
