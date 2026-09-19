import { near } from '../helpers/assert.mjs';
import { parentShared } from '../helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';

import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';

import { handoffGuideChart } from '../../dist/gameplay/guide-chart.js';
import { STADIUM_ROUTE_GATE_S } from '../../dist/dev/courses/stadium/route-gates.js';
import { STADIUM_HANDOFF_SEAM_S } from '../../dist/dev/courses/stadium/handoff.js';
import { STADIUM_JUNCTION } from '../../dist/dev/courses/stadium/junction.js';
import { createDeclarativeLiveRouteRuntime } from '../../dist/dev/fixtures/declarative-route.js';
import { compileDeclarativeLiveRoute } from '../../dist/runtime/declarative-live-route.js';

import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';

function setup() {
  const guide = createStadiumGuide();
  const assets = createSpriteAssets();
  const live = createDeclarativeLiveRouteRuntime(guide, parentShared(guide), assets);
  return { guide, assets, live };
}

test('declarative rows compile the same five-stage route with derived package bindings', () => {
  const { live } = setup();
  assert.deepEqual(
    live.route.stages.map((stage) => [stage.id, stage.kind]),
    [
      ['STAGE_1', 'STAGE'],
      ['STAGE_2_L', 'STAGE'],
      ['STAGE_2_R', 'STAGE'],
      ['GOAL_L', 'TERMINAL'],
      ['GOAL_R', 'TERMINAL'],
    ],
  );
  assert.deepEqual(
    live.route.choices.map((choice) => choice.id),
    ['S1_LEFT', 'S1_RIGHT', 'S2L_CONTINUE', 'S2R_CONTINUE'],
  );
  assert.deepEqual(
    live.content.bindings.map((binding) => [binding.stageId, binding.packageId]),
    [
      ['STAGE_1', 'CONTENT_STAGE_1'],
      ['STAGE_2_L', 'CONTENT_STAGE_2_L'],
      ['STAGE_2_R', 'CONTENT_STAGE_2_R'],
      ['GOAL_L', 'CONTENT_GOAL_L'],
      ['GOAL_R', 'CONTENT_GOAL_R'],
    ],
  );
});

test('physical gates precede handoffs and seams coincide in both owning charts', () => {
  const { live } = setup();
  const { continuation } = live;
  const rows = [
    [
      'S1_LEFT',
      continuation.base.charts.parent,
      continuation.base.charts.left,
      STADIUM_ROUTE_GATE_S,
      STADIUM_HANDOFF_SEAM_S,
      STADIUM_JUNCTION.separatedChildCenterL('LEFT'),
      continuation.base.handoffLocalS,
    ],
    [
      'S1_RIGHT',
      continuation.base.charts.parent,
      continuation.base.charts.right,
      STADIUM_ROUTE_GATE_S,
      STADIUM_HANDOFF_SEAM_S,
      STADIUM_JUNCTION.separatedChildCenterL('RIGHT'),
      continuation.base.handoffLocalS,
    ],
    ...[continuation.leftSuccessor, continuation.rightSuccessor].map((source, i) => [
      i === 0 ? 'S2L_CONTINUE' : 'S2R_CONTINUE',
      source.link.sourceFrame,
      source.chart,
      source.sourceTransitionS,
      source.sourceSeamS,
      0,
      source.targetSeamS,
    ]),
  ];
  for (const [choice, source, target, gateS, seamS, lateral, targetS] of rows) {
    const gate = live.gates.gates.find((entry) => entry.choiceId === choice);
    const seam = live.handoffs.seams.find((entry) => entry.choiceId === choice);
    assert.ok(gate && seam);
    assert.ok(gateS < seamS);
    const gateLocal = handoffGuideChart(source, gate.center);
    const sourceLocal = handoffGuideChart(source, seam.center);
    const targetLocal = handoffGuideChart(target, seam.center);
    near(gateLocal.s, gateS, 1e-6);
    near(gateLocal.l, lateral, 1e-6);
    near(sourceLocal.s, seamS, 1e-6);
    near(sourceLocal.l, lateral, 1e-6);
    near(targetLocal.s, targetS, 1e-6);
    near(targetLocal.l, 0, 1e-6);
    assert.equal(seam.targetChartId, target.id);
    assert.equal(gate.halfWidth, 3.5);
    assert.equal(seam.halfWidth, 3.5);
  }
});

// Reuse valid geometry, while independently changing every authored namespace.
// The tested contract is the resulting relationship, not the compiler's local spelling.
function reauthor(live, prefix) {
  const stageIds = new Map(live.route.stages.map((stage, i) => [stage.id, `${prefix}:stage:${i}`]));
  const stages = live.route.stages.map((stage, i) => {
    const binding = live.content.bindings.find((entry) => entry.stageId === stage.id);
    assert.ok(binding);
    const runtime = live.registry.packages.find((entry) => entry.packageId === binding.packageId);
    assert.ok(runtime);
    return {
      id: stageIds.get(stage.id),
      kind: stage.kind,
      runtime: {
        ...runtime,
        packageId: `${prefix}:package:${i}`,
        coordinateFrame: Object.freeze({ ...runtime.coordinateFrame, id: `${prefix}:chart:${i}` }),
      },
    };
  });
  const gateGeometry = (gate, id) => ({
    id,
    center: { ...gate.center },
    heading: gate.heading,
    halfWidth: gate.halfWidth,
  });
  const transitions = live.route.choices.map((choice, i) => {
    const gate = live.gates.gates.find((entry) => entry.choiceId === choice.id);
    const seam = live.handoffs.seams.find((entry) => entry.choiceId === choice.id);
    assert.ok(gate && seam);
    return {
      id: `${prefix}:choice:${i}`,
      fromStageId: stageIds.get(choice.fromStageId),
      toStageId: stageIds.get(choice.toStageId),
      gate: gateGeometry(gate, `${prefix}:gate:${i}`),
      handoff: {
        ...gateGeometry(seam, `${prefix}:seam:${i}`),
        sourceSeamS: seam.sourceSeamS,
        targetSeamS: seam.targetSeamS,
        sourceLocalL: seam.sourceLocalL,
        targetLocalL: seam.targetLocalL,
      },
    };
  });
  const finishes = live.gates.gates
    .filter((gate) => gate.kind === 'FINISH')
    .map((gate, i) => ({
      stageId: stageIds.get(gate.stageId),
      gate: gateGeometry(gate, `${prefix}:finish:${i}`),
    }));
  return { startStageId: stageIds.get(live.route.startStageId), stages, transitions, finishes };
}

function assertDerivedBindings(source, compiled) {
  const start = source.stages.find((stage) => stage.id === source.startStageId);
  assert.ok(start);
  assert.equal(compiled.initialChart, start.runtime.coordinateFrame);
  for (const stage of source.stages) {
    const binding = compiled.content.bindings.find((entry) => entry.stageId === stage.id);
    assert.ok(binding);
    assert.equal(binding.packageId, stage.runtime.packageId);
    const runtime = compiled.registry.packages.find((entry) => entry.packageId === binding.packageId);
    assert.ok(runtime);
    assert.equal(runtime.coordinateFrame, stage.runtime.coordinateFrame);
  }
  for (const transition of source.transitions) {
    const target = source.stages.find((stage) => stage.id === transition.toStageId);
    assert.ok(target);
    const gate = compiled.gates.gates.find((entry) => entry.id === transition.gate.id);
    const seam = compiled.handoffs.seams.find((entry) => entry.id === transition.handoff.id);
    assert.ok(gate && seam);
    assert.equal(gate.choiceId, transition.id);
    assert.equal(seam.choiceId, transition.id);
    assert.equal(seam.targetChartId, target.runtime.coordinateFrame.id);
    assert.deepEqual(gate.center, transition.gate.center);
    assert.deepEqual(seam.center, transition.handoff.center);
  }
}

test('compiled bindings follow authored identities and target objects with independent row ordering', () => {
  const { live } = setup();
  for (const prefix of ['first', 'renamed']) {
    const source = reauthor(live, prefix);
    assertDerivedBindings(source, compileDeclarativeLiveRoute(source));
    const reordered = {
      ...source,
      stages: [...source.stages].reverse(),
      transitions: [...source.transitions].reverse(),
      finishes: [...source.finishes].reverse(),
    };
    assertDerivedBindings(reordered, compileDeclarativeLiveRoute(reordered));
  }
});

test('inconsistent authored references fail before publishing a route and leave valid input reusable', () => {
  const source = reauthor(setup().live, 'invalid-reference');
  const missingTarget = {
    ...source,
    transitions: source.transitions.map((transition, i) =>
      i === 0 ? { ...transition, toStageId: 'missing-target' } : transition,
    ),
  };
  assert.throws(() => compileDeclarativeLiveRoute(missingTarget), RangeError);
  assert.throws(
    () => compileDeclarativeLiveRoute({ ...source, stages: [...source.stages, source.stages[0]] }),
    RangeError,
  );
  assertDerivedBindings(source, compileDeclarativeLiveRoute(source));
});
