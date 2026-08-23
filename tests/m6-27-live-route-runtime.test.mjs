import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { compileLiveRouteRuntimeAssembly } from '../dist/runtime/live-route-runtime.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

function setup() {
  const guide = createM2StadiumGuide();
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
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
  return createM627LiveRouteRuntime(
    guide,
    {
      heightProfile,
      surfaceMap,
      terrainProfile,
      groundProfile,
      selectFarBackground: () => createM3FarBackground(),
      worldSprites: [],
    },
    createM4SpriteAssets(),
  );
}

test('M6.27 browser-facing bundle remains complete as later milestones deepen the live route', () => {
  const live = setup();
  assert.ok(live.route.stages.length >= 5);
  assert.equal(live.route.choices.length, live.handoffs.seams.length);
  assert.equal(live.charts.length, live.registry.packages.length);
  assert.equal(live.content.bindings.length, live.route.stages.length);
  assert.equal(
    live.gates.gates.filter((gate) => gate.kind === 'TRANSITION').length,
    live.route.choices.length,
  );
  const terminalCount = live.route.stages.filter((stage) => stage.kind === 'TERMINAL').length;
  assert.equal(live.gates.gates.filter((gate) => gate.kind === 'FINISH').length, terminalCount);
});

test('M6.27 every route target resolves through content/runtime to the exact handoff target chart', () => {
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

test('M6.27 assembly compiler rejects a start package/chart mismatch before simulation', () => {
  const live = setup();
  assert.throws(
    () => compileLiveRouteRuntimeAssembly({ ...live, initialChart: live.charts[1] }),
    /start package coordinate frame must be the initial chart/,
  );
});

test('M6.27 browser main consumes one assembly and no longer constructs route pieces', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /createM627LiveRouteRuntime/);
  assert.match(source, /const liveRoute = createM627LiveRouteRuntime/);
  assert.doesNotMatch(source, /createM626LiveRouteDag|createM626LiveContinuation|createM626LiveGateSet|createM626LiveHandoffManifest|createM626LiveStageRuntimeRegistry/);
  assert.doesNotMatch(source, /createM630ThirdLiveSuccessorRuntime|STAGE_3_L|S3L_CONTINUE/);
});

test('M6.27 generic assembly contains no renderer, camera or vehicle-physics dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/runtime/live-route-runtime.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /render\//);
  assert.doesNotMatch(source, /m5-camera/);
  assert.doesNotMatch(source, /car-physics|motorcycle-physics/);
  assert.doesNotMatch(source, /M6_26|M626/);
});
