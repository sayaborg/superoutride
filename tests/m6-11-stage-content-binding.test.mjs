import test from 'node:test';
import assert from 'node:assert/strict';
import { createM6DebugRouteStageContentManifest } from '../dist/dev/m6-debug-route-stage-content.js';
import { createM6DebugRouteDag } from '../dist/dev/m6-debug-route-dag.js';
import { readFile } from 'node:fs/promises';

import {
  createRouteDagState,
  updateRouteDag,
} from '../dist/gameplay/route-dag.js';
import {
  compileRouteStageContentManifest,
  resolveActiveRouteStageContent,
} from '../dist/gameplay/route-stage-content.js';

test('M6.11 every route node resolves exactly one opaque content package', () => {
  const route = createM6DebugRouteDag();
  const manifest = createM6DebugRouteStageContentManifest(route);
  const state = createRouteDagState(route);

  assert.equal(manifest.bindings.length, route.stages.length);
  assert.equal(manifest.packages.length, route.stages.length);
  assert.equal(manifest.worldFrameId, 'DEV_ROUTE_WORLD_V1');

  const active = resolveActiveRouteStageContent(manifest, state);
  assert.equal(active.stageId, 'STAGE_1');
  assert.equal(active.package.packageId, 'CONTENT_STAGE_1');
});

test('validated DAG transition changes only the selected content reference, not world state or renderer state', () => {
  const route = createM6DebugRouteDag();
  const manifest = createM6DebugRouteStageContentManifest(route);
  const state = createRouteDagState(route);
  const physicalWorldPose = Object.freeze({ x: 12.5, z: 30.25, yaw: 0.3 });

  const before = resolveActiveRouteStageContent(manifest, state);
  updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S1_RIGHT' });
  const after = resolveActiveRouteStageContent(manifest, state);

  assert.equal(before.package.packageId, 'CONTENT_STAGE_1');
  assert.equal(after.package.packageId, 'CONTENT_STAGE_2_R');
  assert.deepEqual(physicalWorldPose, { x: 12.5, z: 30.25, yaw: 0.3 });
});

test('different validated route histories deterministically resolve different terminal content packages', () => {
  const route = createM6DebugRouteDag();
  const manifest = createM6DebugRouteStageContentManifest(route);

  const resolvePath = (firstChoice, secondChoice) => {
    const state = createRouteDagState(route);
    updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: firstChoice });
    updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: secondChoice });
    return resolveActiveRouteStageContent(manifest, state).package.packageId;
  };

  assert.equal(resolvePath('S1_LEFT', 'S2L_LEFT'), 'CONTENT_GOAL_LL');
  assert.equal(resolvePath('S1_LEFT', 'S2L_RIGHT'), 'CONTENT_GOAL_LR');
  assert.equal(resolvePath('S1_RIGHT', 'S2R_LEFT'), 'CONTENT_GOAL_RL');
  assert.equal(resolvePath('S1_RIGHT', 'S2R_RIGHT'), 'CONTENT_GOAL_RR');
});

test('content compiler rejects missing/duplicate stage bindings and unknown packages', () => {
  const route = createM6DebugRouteDag();
  const packages = route.stages.map((stage) => ({ packageId: `P_${stage.id}`, worldFrameId: 'WORLD' }));
  const bindings = route.stages.map((stage) => ({ stageId: stage.id, packageId: `P_${stage.id}` }));

  assert.throws(
    () => compileRouteStageContentManifest(route, packages, bindings.slice(1)),
    /missing a content binding/,
  );
  assert.throws(
    () => compileRouteStageContentManifest(route, packages, [...bindings, bindings[0]]),
    /more than one content binding/,
  );
  assert.throws(
    () => compileRouteStageContentManifest(
      route,
      packages,
      bindings.map((binding, index) => index === 0 ? { ...binding, packageId: 'MISSING' } : binding),
    ),
    /unknown package/,
  );
});

test('M6.11 rejects mixed world frames because stage selection must not silently transform physics', () => {
  const route = createM6DebugRouteDag();
  const packages = route.stages.map((stage, index) => ({
    packageId: `P_${stage.id}`,
    worldFrameId: index === 0 ? 'WORLD_A' : 'WORLD_B',
  }));
  const bindings = route.stages.map((stage) => ({ stageId: stage.id, packageId: `P_${stage.id}` }));

  assert.throws(
    () => compileRouteStageContentManifest(route, packages, bindings),
    /share one worldFrameId/,
  );
});

test('stage content manifest remains a gameplay selection table with no renderer or vehicle-physics dependency', async () => {
  const source = await readFile(new URL('../src/gameplay/route-stage-content.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\.\/render\//);
  assert.doesNotMatch(source, /from ['"]\.\.\/physics\//);
  assert.doesNotMatch(source, /M5CarState|Canvas|framebuffer|pseudoDepth/);
});
