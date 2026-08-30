import test from 'node:test';
import assert from 'node:assert/strict';
import { createM6DebugRouteDag } from '../dist/dev/m6-debug-route-dag.js';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import {
  createM615VisibleRouteBoundaryGateSet,
  M6_15_FINISH_GATE_S,
  M6_15_ROUTE_GATE_S,
} from '../dist/dev/m6-15-visible-route-gates.js';
import {
  observeRouteBoundaryCrossing,
} from '../dist/gameplay/route-boundary-gates.js';
import {
  createRouteDagState,
  updateRouteDag,
} from '../dist/gameplay/route-dag.js';

const near = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

function crossingSegment(gate, direction = 'FORWARD') {
  const sign = direction === 'FORWARD' ? 1 : -1;
  return {
    previous: {
      x: gate.center.x - gate.tangent.x * sign,
      z: gate.center.z - gate.tangent.z * sign,
    },
    current: {
      x: gate.center.x + gate.tangent.x * sign,
      z: gate.center.z + gate.tangent.z * sign,
    },
  };
}

function gateForChoice(gates, choiceId) {
  return gates.gates.find((gate) => gate.kind === 'TRANSITION' && gate.choiceId === choiceId);
}

function finishForStage(gates, stageId) {
  return gates.gates.find((gate) => gate.kind === 'FINISH' && gate.stageId === stageId);
}

test('M6.15 visible route gates exactly cover the two separated asphalt child roads', () => {
  const guide = createM2StadiumGuide();
  const route = createM6DebugRouteDag();
  const gates = createM615VisibleRouteBoundaryGateSet(route, guide);

  assert.ok(M6_15_ROUTE_GATE_S > M6_13_JUNCTION.authoring.sSeparatedStart);
  assert.equal(gates.gates.length, route.choices.length + 4);

  for (const [choiceId, side] of [['S1_LEFT', 'LEFT'], ['S1_RIGHT', 'RIGHT']]) {
    const gate = gateForChoice(gates, choiceId);
    assert.ok(gate);
    const l = M6_13_JUNCTION.separatedChildCenterL(side);
    const expected = guideCourseToWorld(guide, M6_15_ROUTE_GATE_S, l);
    near(gate.center.x, expected.x);
    near(gate.center.z, expected.z);
    near(gate.heading, expected.heading);
    near(gate.halfWidth, M6_13_JUNCTION.authoring.childRoadWidth * 0.5);
  }
});

test('physical crossing of the visible left road selects S1_LEFT while the median selects nothing', () => {
  const guide = createM2StadiumGuide();
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = createM615VisibleRouteBoundaryGateSet(route, guide);
  const left = gateForChoice(gates, 'S1_LEFT');
  assert.ok(left);

  const segment = crossingSegment(left);
  const observed = observeRouteBoundaryCrossing(route, state, gates, segment.previous, segment.current);
  assert.deepEqual(observed.boundary, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  updateRouteDag(state, route, observed.boundary);
  assert.equal(state.activeStageId, 'STAGE_2_L');

  const fresh = createRouteDagState(route);
  const center = guideCourseToWorld(guide, M6_15_ROUTE_GATE_S, 0);
  const medianObserved = observeRouteBoundaryCrossing(
    route,
    fresh,
    gates,
    { x: center.x - Math.sin(center.heading), z: center.z - Math.cos(center.heading) },
    { x: center.x + Math.sin(center.heading), z: center.z + Math.cos(center.heading) },
  );
  assert.equal(medianObserved.event, 'NONE');
  assert.equal(medianObserved.boundary, null);
});

test('the same physical visible junction can validate the second DEV route stage on the next lap', () => {
  const guide = createM2StadiumGuide();
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = createM615VisibleRouteBoundaryGateSet(route, guide);

  const first = gateForChoice(gates, 'S1_LEFT');
  assert.ok(first);
  const firstSegment = crossingSegment(first);
  updateRouteDag(
    state,
    route,
    observeRouteBoundaryCrossing(route, state, gates, firstSegment.previous, firstSegment.current).boundary,
  );
  assert.equal(state.activeStageId, 'STAGE_2_L');

  const second = gateForChoice(gates, 'S2L_RIGHT');
  assert.ok(second);
  const secondSegment = crossingSegment(second);
  const secondObservation = observeRouteBoundaryCrossing(route, state, gates, secondSegment.previous, secondSegment.current);
  assert.deepEqual(secondObservation.boundary, { kind: 'TRANSITION', choiceId: 'S2L_RIGHT' });
  updateRouteDag(state, route, secondObservation.boundary);
  assert.equal(state.activeStageId, 'GOAL_LR');
});

test('terminal route completes only at the real single-road physical FINISH gate', () => {
  const guide = createM2StadiumGuide();
  const route = createM6DebugRouteDag();
  const state = createRouteDagState(route);
  const gates = createM615VisibleRouteBoundaryGateSet(route, guide);

  updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  updateRouteDag(state, route, { kind: 'TRANSITION', choiceId: 'S2L_RIGHT' });
  assert.equal(state.activeStageId, 'GOAL_LR');

  const finish = finishForStage(gates, 'GOAL_LR');
  assert.ok(finish);
  const expected = guideCourseToWorld(guide, M6_15_FINISH_GATE_S, 0);
  near(finish.center.x, expected.x);
  near(finish.center.z, expected.z);
  near(finish.halfWidth, M6_13_JUNCTION.authoring.parentRoadWidth * 0.5);

  const segment = crossingSegment(finish);
  const observation = observeRouteBoundaryCrossing(route, state, gates, segment.previous, segment.current);
  assert.deepEqual(observation.boundary, { kind: 'FINISH', stageId: 'GOAL_LR' });
  const update = updateRouteDag(state, route, observation.boundary);
  assert.equal(update.event, 'FINISHED');
  assert.equal(state.status, 'FINISHED');
});

test('M6.15 route-gate authoring imports no renderer, input or vehicle-physics module', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('../src/dev/m6-15-visible-route-gates.ts', import.meta.url), 'utf8'));
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert.equal(imports.some((path) => path.includes('/render/')), false);
  assert.equal(imports.some((path) => path.includes('/input/')), false);
  assert.equal(imports.some((path) => path.includes('/physics/')), false);
});
