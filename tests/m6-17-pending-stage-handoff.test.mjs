import test from 'node:test';
import assert from 'node:assert/strict';
import { createM6DebugRouteStageContentManifest } from '../dist/dev/m6-debug-route-stage-content.js';
import { createM6DebugRouteDag } from '../dist/dev/m6-debug-route-dag.js';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { createM616ChildGuideCharts } from '../dist/dev/m6-16-child-guide-charts.js';
import {
  createM617RouteStageHandoffManifest,
  M6_17_HANDOFF_SEAM_S,
} from '../dist/dev/m6-17-handoff-seams.js';
import { M6_15_ROUTE_GATE_S } from '../dist/dev/m6-15-visible-route-gates.js';
import {
  createRouteDagState,
  updateRouteDag,
} from '../dist/gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  pendingRouteStageRecoveryTarget,
  queueRouteStageHandoff,
  syncRouteStageHandoffCoordinate,
} from '../dist/gameplay/route-stage-handoff.js';

const near = (actual, expected, tolerance = 2e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

function crossingSegment(seam, direction = 'FORWARD') {
  const sign = direction === 'FORWARD' ? 1 : -1;
  return {
    previous: {
      x: seam.center.x - seam.tangent.x * sign,
      z: seam.center.z - seam.tangent.z * sign,
    },
    current: {
      x: seam.center.x + seam.tangent.x * sign,
      z: seam.center.z + seam.tangent.z * sign,
    },
  };
}

function setup() {
  const guide = createM2StadiumGuide();
  const route = createM6DebugRouteDag();
  const routeState = createRouteDagState(route);
  const content = createM6DebugRouteStageContentManifest(route);
  const charts = createM616ChildGuideCharts(guide);
  const chartList = [charts.parent, charts.left, charts.right];
  const manifest = createM617RouteStageHandoffManifest(route, guide, charts);
  const spawn = guideCourseToWorld(guide, 500, 0);
  const state = createRouteStageHandoffState(route, content, charts.parent, spawn);
  return { guide, route, routeState, content, charts, chartList, manifest, state };
}

test('M6.17 handoff seams are authored after route selection and cover the same separated child roads', () => {
  const { guide, manifest, charts } = setup();
  assert.ok(M6_17_HANDOFF_SEAM_S > M6_15_ROUTE_GATE_S);
  assert.equal(manifest.seams.length, 6);

  for (const [choiceId, chart] of [['S1_LEFT', charts.left], ['S1_RIGHT', charts.right]]) {
    const seam = manifest.seams.find((candidate) => candidate.choiceId === choiceId);
    assert.ok(seam);
    const expected = guideCourseToWorld(guide, M6_17_HANDOFF_SEAM_S, chart.lateralOrigin);
    near(seam.center.x, expected.x);
    near(seam.center.z, expected.z);
    near(seam.halfWidth, 3.5);
  }
});

test('accepted route choice becomes PENDING while old chart/content remain active until the seam', () => {
  const { route, routeState, manifest, state } = setup();
  const routeUpdate = updateRouteDag(routeState, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  assert.equal(routeState.activeStageId, 'STAGE_2_L');
  assert.equal(queueRouteStageHandoff(state, manifest, routeUpdate), 'PENDING');

  assert.equal(state.activeStageId, 'STAGE_1');
  assert.equal(state.activeChartId, 'PARENT');
  assert.equal(state.activePackageId, 'CONTENT_STAGE_1');
  assert.deepEqual(state.pending, {
    choiceId: 'S1_LEFT',
    targetStageId: 'STAGE_2_L',
    targetChartId: 'LEFT_CHILD',
    seamId: 'H_S1_LEFT',
    sourceSeamS: 600,
    targetSeamS: 600,
    sourceLocalL: -7.5,
    targetLocalL: 0,
  });
});

test('pending recovery target stays before the source seam and cannot manufacture COMMIT', () => {
  const { route, routeState, manifest, state } = setup();
  assert.equal(pendingRouteStageRecoveryTarget(state, 8), null);
  const routeUpdate = updateRouteDag(routeState, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  queueRouteStageHandoff(state, manifest, routeUpdate);
  assert.deepEqual(pendingRouteStageRecoveryTarget(state, 8), { s: 592, l: -7.5 });
  assert.equal(state.lastEvent, 'PENDING');
  assert.equal(state.commitCount, 0);
  assert.throws(() => pendingRouteStageRecoveryTarget(state, -1), /non-negative/);
});

test('forward handoff seam atomically commits child chart/content without changing world pose or motion', () => {
  const { route, routeState, content, chartList, manifest, state } = setup();
  const update = updateRouteDag(routeState, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  queueRouteStageHandoff(state, manifest, update);
  const seam = manifest.seams.find((candidate) => candidate.choiceId === 'S1_LEFT');
  assert.ok(seam);
  const segment = crossingSegment(seam);
  const observed = observePendingRouteStageHandoff(state, manifest, segment.previous, segment.current);
  assert.equal(observed.event, 'SEAM_VALIDATED');
  assert.deepEqual(observed.seam, { choiceId: 'S1_LEFT', seamId: 'H_S1_LEFT' });

  // Crossing validation uses a finite physics segment, but the authored seam itself is the exact
  // chart-handoff anchor. One metre along a curved Guide tangent is not mathematically l=0.
  const vehicleWorld = {
    x: seam.center.x,
    z: seam.center.z,
    y: 2.5,
    yaw: seam.heading + 0.02,
    longitudinalSpeed: 58,
    lateralSpeed: -0.5,
  };
  const before = structuredClone(vehicleWorld);
  assert.equal(
    commitRouteStageHandoff(state, routeState, content, chartList, observed.seam, vehicleWorld),
    'COMMITTED',
  );

  assert.deepEqual(vehicleWorld, before);
  assert.equal(state.activeStageId, 'STAGE_2_L');
  assert.equal(state.activeChartId, 'LEFT_CHILD');
  assert.equal(state.activePackageId, 'CONTENT_STAGE_2_L');
  assert.equal(state.pending, null);
  assert.equal(state.commitCount, 1);
  near(state.coordinate.l, 0, 1e-5);
});

test('reverse crossing cannot commit a pending stage handoff', () => {
  const { route, routeState, content, chartList, manifest, state } = setup();
  const update = updateRouteDag(routeState, route, { kind: 'TRANSITION', choiceId: 'S1_RIGHT' });
  queueRouteStageHandoff(state, manifest, update);
  const seam = manifest.seams.find((candidate) => candidate.choiceId === 'S1_RIGHT');
  assert.ok(seam);
  const segment = crossingSegment(seam, 'REVERSE');
  const observed = observePendingRouteStageHandoff(state, manifest, segment.previous, segment.current);
  assert.equal(observed.event, 'SEAM_REVERSE');
  assert.equal(observed.seam, null);
  assert.equal(commitRouteStageHandoff(state, routeState, content, chartList, observed.seam, segment.current), 'NONE');
  assert.equal(state.activeStageId, 'STAGE_1');
  assert.equal(state.pending?.choiceId, 'S1_RIGHT');
});

test('two DEV junction passes can commit two independent child charts from one continuous world frame', () => {
  const { route, routeState, content, chartList, manifest, state } = setup();

  const firstUpdate = updateRouteDag(routeState, route, { kind: 'TRANSITION', choiceId: 'S1_LEFT' });
  queueRouteStageHandoff(state, manifest, firstUpdate);
  const firstSeam = manifest.seams.find((candidate) => candidate.choiceId === 'S1_LEFT');
  const firstSegment = crossingSegment(firstSeam);
  const firstObserved = observePendingRouteStageHandoff(state, manifest, firstSegment.previous, firstSegment.current);
  commitRouteStageHandoff(state, routeState, content, chartList, firstObserved.seam, firstSeam.center);
  assert.equal(state.activeChartId, 'LEFT_CHILD');

  syncRouteStageHandoffCoordinate(state, chartList, firstSeam.center);
  near(state.coordinate.l, 0, 1e-5);

  const secondUpdate = updateRouteDag(routeState, route, { kind: 'TRANSITION', choiceId: 'S2L_RIGHT' });
  queueRouteStageHandoff(state, manifest, secondUpdate);
  assert.equal(state.activeStageId, 'STAGE_2_L');
  assert.equal(state.activeChartId, 'LEFT_CHILD');
  assert.equal(state.pending?.targetChartId, 'RIGHT_CHILD');

  const secondSeam = manifest.seams.find((candidate) => candidate.choiceId === 'S2L_RIGHT');
  const secondSegment = crossingSegment(secondSeam);
  const secondObserved = observePendingRouteStageHandoff(state, manifest, secondSegment.previous, secondSegment.current);
  commitRouteStageHandoff(state, routeState, content, chartList, secondObserved.seam, secondSeam.center);

  assert.equal(state.activeStageId, 'GOAL_LR');
  assert.equal(state.activeChartId, 'RIGHT_CHILD');
  assert.equal(state.activePackageId, 'CONTENT_GOAL_LR');
  assert.equal(state.commitCount, 2);
  near(state.coordinate.l, 0, 1e-5);
});

test('M6.17 handoff layer has no renderer, input or vehicle-physics dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const path of [
    '../src/gameplay/world-crossing-gate.ts',
    '../src/gameplay/route-stage-handoff.ts',
    '../src/dev/m6-17-handoff-seams.ts',
  ]) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.equal(imports.some((entry) => entry.includes('/render/')), false);
    assert.equal(imports.some((entry) => entry.includes('/input/')), false);
    assert.equal(imports.some((entry) => entry.includes('/physics/')), false);
  }
});
