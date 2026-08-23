import test from 'node:test';
import assert from 'node:assert/strict';

import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { createM616ChildGuideCharts } from '../dist/dev/m6-16-child-guide-charts.js';
import {
  guideChartToWorld,
  handoffGuideChart,
  locateWorldOnGuideChartGlobal,
} from '../dist/gameplay/guide-chart.js';

const near = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

test('M6.16 child charts put l=0 on the two separated visible road centers', () => {
  const guide = createM2StadiumGuide();
  const charts = createM616ChildGuideCharts(guide);
  assert.equal(charts.parent.lateralOrigin, 0);
  assert.equal(charts.left.lateralOrigin, -7.5);
  assert.equal(charts.right.lateralOrigin, 7.5);

  for (const [chart, parentL] of [[charts.left, -7.5], [charts.right, 7.5]]) {
    const childCenter = guideChartToWorld(chart, 570, 0);
    const parentPoint = guideCourseToWorld(guide, 570, parentL);
    near(childCenter.x, parentPoint.x);
    near(childCenter.z, parentPoint.z);
    near(childCenter.s, parentPoint.s);
    near(childCenter.l, 0);
  }
});

test('handoff changes road coordinates only: world pose and motion remain byte-for-byte untouched', () => {
  const guide = createM2StadiumGuide();
  const charts = createM616ChildGuideCharts(guide);
  const road = guideCourseToWorld(guide, 570, -7.5);
  const vehicle = {
    x: road.x,
    y: 1.25,
    z: road.z,
    yaw: road.heading + 0.03,
    longitudinalSpeed: 61.25,
    lateralSpeed: -1.5,
    yawRate: 0.12,
  };
  const before = structuredClone(vehicle);

  const parentCoordinate = locateWorldOnGuideChartGlobal(charts.parent, vehicle);
  const childCoordinate = handoffGuideChart(charts.left, vehicle);

  near(parentCoordinate.s, 570, 1e-6);
  near(parentCoordinate.l, -7.5, 1e-6);
  near(childCoordinate.s, parentCoordinate.s, 1e-6);
  near(childCoordinate.l, 0, 1e-6);
  assert.deepEqual(vehicle, before);
});

test('child chart preserves signed lateral freedom around its own road center', () => {
  const guide = createM2StadiumGuide();
  const charts = createM616ChildGuideCharts(guide);
  for (const [chart, parentOrigin] of [[charts.left, -7.5], [charts.right, 7.5]]) {
    for (const localL of [-3, -1, 0, 1, 3]) {
      const world = guideChartToWorld(chart, 560, localL);
      const parent = guideCourseToWorld(guide, 560, parentOrigin + localL);
      near(world.x, parent.x);
      near(world.z, parent.z);
      const recovered = locateWorldOnGuideChartGlobal(chart, world);
      near(recovered.s, 560, 2e-6);
      near(recovered.l, localL, 2e-6);
    }
  }
});

test('Guide chart handoff remains gameplay/core coordinate logic with no renderer or vehicle-physics dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const path of ['../src/gameplay/guide-chart.ts', '../src/dev/m6-16-child-guide-charts.ts']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.equal(imports.some((entry) => entry.includes('/render/')), false);
    assert.equal(imports.some((entry) => entry.includes('/physics/')), false);
    assert.equal(imports.some((entry) => entry.includes('/input/')), false);
  }
});
