import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM626LiveContinuation } from '../dist/dev/m6-26-live-successor-stage.js';
import {
  compileRasterSuccessorChain,
  repackageGuideChartRuntime,
} from '../dist/runtime/raster-successor-chain.js';

const successorAuthoring = (suffix, direction) => ({
  id: `CHAIN_${suffix}`,
  chartId: `CHAIN_CHART_${suffix}`,
  roadViewId: `CHAIN_VIEW_${suffix}`,
  surfaceSectionName: `CHAIN_SURFACE_${suffix}`,
  sourceSeamMinS: 340,
  overlapMargin: 30,
  transitionLead: 20,
  finishAfterSeam: 150,
  deformationMeters: 2,
  deformationDirection: direction,
  gentleTurnLimitDegrees: 5,
  minDeformationRunVertices: 5,
  dCam: 5,
  dMax: 150,
  finishClosureMargin: 20,
  groundMapHalfWidth: 12,
  groundHalfWidth: 4.5,
  roadHalfWidth: 3.5,
  shoulderWidth: 1,
});

function fakeRuntime(structural, packageId) {
  return Object.freeze({
    packageId,
    worldFrameId: 'TEST_WORLD',
    coordinateFrame: structural.chart,
    roadView: structural.roadView,
    surfaceMap: structural.surfaceMap,
    groundProfile: structural.groundProfile,
    heightProfile: {},
    terrainProfile: {},
    selectFarBackground: () => null,
    worldSprites: [],
  });
}

function source() {
  const continuation = createM626LiveContinuation(createM2StadiumGuide());
  return continuation.leftSuccessor;
}

test('M6.31 compiles a two-step successor chain with derived stage kinds, transitions and final FINISH', () => {
  const initial = source();
  const sourceRuntime = fakeRuntime(initial, 'PKG_SOURCE');
  const chain = compileRasterSuccessorChain({
    sourceStageId: 'SOURCE',
    sourceRuntime,
    sourceStructural: initial,
    halfWidth: 3.5,
    finishGateId: 'FINISH_CHAIN',
    steps: [
      {
        stageId: 'MID',
        packageId: 'PKG_MID',
        choiceId: 'TO_MID',
        gateId: 'G_TO_MID',
        handoffId: 'H_TO_MID',
        successor: successorAuthoring('MID', -1),
      },
      {
        stageId: 'GOAL',
        packageId: 'PKG_GOAL',
        choiceId: 'TO_GOAL',
        gateId: 'G_TO_GOAL',
        handoffId: 'H_TO_GOAL',
        successor: successorAuthoring('GOAL', 1),
      },
    ],
    createRuntime: (structural, packageId) => fakeRuntime(structural, packageId),
  });

  assert.deepEqual(chain.stages.map((stage) => [stage.id, stage.kind]), [
    ['SOURCE', 'STAGE'],
    ['MID', 'STAGE'],
    ['GOAL', 'TERMINAL'],
  ]);
  assert.deepEqual(chain.transitions.map((edge) => [edge.id, edge.fromStageId, edge.toStageId]), [
    ['TO_MID', 'SOURCE', 'MID'],
    ['TO_GOAL', 'MID', 'GOAL'],
  ]);
  assert.equal(chain.finish.stageId, 'GOAL');
  assert.equal(chain.finish.gate.id, 'FINISH_CHAIN');
  assert.equal(chain.structurals.length, 3);
  assert.equal(chain.runtimes.length, 3);
  assert.notEqual(chain.structurals[0].chart, chain.structurals[1].chart);
  assert.notEqual(chain.structurals[1].chart, chain.structurals[2].chart);
});

test('M6.31 derives each physical transition and handoff from the generated continuation source chart', () => {
  const initial = source();
  const chain = compileRasterSuccessorChain({
    sourceStageId: 'SOURCE',
    sourceRuntime: fakeRuntime(initial, 'PKG_SOURCE'),
    sourceStructural: initial,
    halfWidth: 3.5,
    finishGateId: 'FINISH',
    steps: [{
      stageId: 'GOAL',
      packageId: 'PKG_GOAL',
      choiceId: 'NEXT',
      gateId: 'G_NEXT',
      handoffId: 'H_NEXT',
      successor: successorAuthoring('ONE', -1),
    }],
    createRuntime: (structural, packageId) => fakeRuntime(structural, packageId),
  });
  const generated = chain.structurals[1];
  const edge = chain.transitions[0];
  assert.equal(edge.gate.id, 'G_NEXT');
  assert.equal(edge.handoff.id, 'H_NEXT');
  assert.equal(edge.gate.halfWidth, 3.5);
  assert.equal(edge.handoff.halfWidth, 3.5);
  assert.equal(chain.stages[1].runtime.coordinateFrame, generated.chart);
});

test('M6.31 rejects empty chains, duplicate ids and runtime/chart mismatches before route compilation', () => {
  const initial = source();
  const base = {
    sourceStageId: 'SOURCE',
    sourceRuntime: fakeRuntime(initial, 'PKG_SOURCE'),
    sourceStructural: initial,
    halfWidth: 3.5,
    finishGateId: 'FINISH',
  };
  assert.throws(() => compileRasterSuccessorChain({ ...base, steps: [], createRuntime: fakeRuntime }), /at least one successor step/);
  assert.throws(() => compileRasterSuccessorChain({
    ...base,
    steps: [{
      stageId: 'SOURCE',
      packageId: 'PKG_GOAL',
      choiceId: 'NEXT',
      gateId: 'G',
      handoffId: 'H',
      successor: successorAuthoring('DUP', -1),
    }],
    createRuntime: fakeRuntime,
  }), /duplicate Raster successor chain stage id/);
  assert.throws(() => compileRasterSuccessorChain({
    ...base,
    steps: [{
      stageId: 'GOAL',
      packageId: 'PKG_GOAL',
      choiceId: 'NEXT',
      gateId: 'G',
      handoffId: 'H',
      successor: successorAuthoring('BAD_RUNTIME', -1),
    }],
    createRuntime: (structural) => fakeRuntime(initial, 'PKG_GOAL'),
  }), /runtime must own generated chart/);
});

test('M6.31 runtime helper is renderer, route-DAG and vehicle-physics independent while M6.30 delegates deep LEFT construction', async () => {
  const [compiler, m630] = await Promise.all([
    readFile(new URL('../src/runtime/raster-successor-chain.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-30-third-live-successor.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(compiler, /render\//);
  assert.doesNotMatch(compiler, /route-dag|route-boundary-gates/);
  assert.doesNotMatch(compiler, /car-physics|motorcycle-physics/);
  assert.match(m630, /compileRasterSuccessorChain/);
  assert.match(m630, /repackageGuideChartRuntime/);
  assert.doesNotMatch(m630, /createRasterStageSuccessor/);
});

test('M6.31 repackaging changes only opaque package identity', () => {
  const initial = source();
  const runtime = fakeRuntime(initial, 'OLD');
  const repackaged = repackageGuideChartRuntime(runtime, 'NEW');
  assert.equal(repackaged.packageId, 'NEW');
  assert.equal(repackaged.coordinateFrame, runtime.coordinateFrame);
  assert.equal(repackaged.roadView, runtime.roadView);
  assert.equal(repackaged.surfaceMap, runtime.surfaceMap);
  assert.equal(repackaged.groundProfile, runtime.groundProfile);
});
