import { near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { guidePathToWorld } from '../dist/core/guide-curve.js';
import { createChildGuideCharts } from '../dist/dev/courses/child-guide-charts.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { guideChartToWorld, handoffGuideChart, locateWorldOnGuideChartGlobal } from '../dist/gameplay/guide-chart.js';

test('child charts put l=0 on the two separated visible road centers', () => {
  const guide = createStadiumGuide();
  const charts = createChildGuideCharts(guide);
  assert.equal(charts.parent.lateralOrigin, 0);
  assert.equal(charts.left.lateralOrigin, -7.5);
  assert.equal(charts.right.lateralOrigin, 7.5);

  for (const [chart, parentL] of [
    [charts.left, -7.5],
    [charts.right, 7.5],
  ]) {
    const childCenter = guideChartToWorld(chart, 570, 0);
    const parentPoint = guidePathToWorld(guide, 570, parentL);
    near(childCenter.x, parentPoint.x, 1e-7);
    near(childCenter.z, parentPoint.z, 1e-7);
    near(childCenter.s, parentPoint.s, 1e-7);
    near(childCenter.l, 0, 1e-7);
  }
});

test('handoff changes road coordinates only: world pose and motion remain byte-for-byte untouched', () => {
  const guide = createStadiumGuide();
  const charts = createChildGuideCharts(guide);
  const road = guidePathToWorld(guide, 570, -7.5);
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
  const guide = createStadiumGuide();
  const charts = createChildGuideCharts(guide);
  for (const [chart, parentOrigin] of [
    [charts.left, -7.5],
    [charts.right, 7.5],
  ]) {
    for (const localL of [-3, -1, 0, 1, 3]) {
      const world = guideChartToWorld(chart, 560, localL);
      const parent = guidePathToWorld(guide, 560, parentOrigin + localL);
      near(world.x, parent.x, 1e-7);
      near(world.z, parent.z, 1e-7);
      const recovered = locateWorldOnGuideChartGlobal(chart, world);
      near(recovered.s, 560, 2e-6);
      near(recovered.l, localL, 2e-6);
    }
  }
});

test('Guide chart handoff remains gameplay/core coordinate logic with no renderer or vehicle-physics dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const path of ['../src/gameplay/guide-chart.ts', '../src/dev/courses/child-guide-charts.ts']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.equal(
      imports.some((entry) => entry.includes('/render/')),
      false,
    );
    assert.equal(
      imports.some((entry) => entry.includes('/physics/')),
      false,
    );
    assert.equal(
      imports.some((entry) => entry.includes('/input/')),
      false,
    );
  }
});
