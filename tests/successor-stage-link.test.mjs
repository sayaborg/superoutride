import assert from 'node:assert/strict';
import test from 'node:test';

import { createChildStageContinuation } from '../dist/dev/courses/child-stage-continuation.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import {
  compileStageContinuationLink,
  mapStageContinuationChainage,
  mapStageContinuationLateral,
} from '../dist/runtime/stage-continuation-link.js';

function setup(side) {
  const parent = createStadiumGuide();
  const continuation = createChildStageContinuation(parent);
  const child = side === 'LEFT' ? continuation.left : continuation.right;
  const sourceLocalL = child.chart.lateralOrigin;
  const link = compileStageContinuationLink({
    id: `${side}_LINK`,
    sourceFrame: continuation.charts.parent,
    targetFrame: child.chart,
    sourceSeamS: 600,
    targetSeamS: continuation.handoffLocalS,
    sourceLocalL,
    targetLocalL: 0,
    overlapBehind: 5,
    overlapAhead: 5,
  });
  return { continuation, child, link };
}

test('generic successor link validates the existing LEFT parent-to-child D_cam overlap', () => {
  const { link } = setup('LEFT');
  assert.equal(link.sourceLocalL, -7.5);
  assert.equal(link.targetLocalL, 0);
  assert.equal(link.overlapBehind, 5);
  assert.equal(link.overlapAhead, 5);
});

test('generic successor link validates the existing RIGHT parent-to-child D_cam overlap', () => {
  const { link } = setup('RIGHT');
  assert.equal(link.sourceLocalL, 7.5);
  assert.equal(link.targetLocalL, 0);
});

test('chainage mapping is a pure seam-relative rebase', () => {
  const { continuation, link } = setup('LEFT');
  assert.equal(mapStageContinuationChainage(link, 600), continuation.handoffLocalS);
  assert.equal(mapStageContinuationChainage(link, 595), continuation.handoffLocalS - 5);
  assert.equal(mapStageContinuationChainage(link, 605), continuation.handoffLocalS + 5);
});

test('lateral mapping preserves signed displacement from the linked road center', () => {
  const { link } = setup('RIGHT');
  assert.equal(mapStageContinuationLateral(link, 7.5), 0);
  assert.equal(mapStageContinuationLateral(link, 9.0), 1.5);
  assert.equal(mapStageContinuationLateral(link, 6.25), -1.25);
});

test('rejects a successor link whose charts do not describe the same overlap geometry', () => {
  const parent = createStadiumGuide();
  const continuation = createChildStageContinuation(parent);
  assert.throws(
    () =>
      compileStageContinuationLink({
        id: 'BAD_LINK',
        sourceFrame: continuation.charts.parent,
        targetFrame: continuation.left.chart,
        sourceSeamS: 600,
        targetSeamS: continuation.handoffLocalS + 1,
        sourceLocalL: -7.5,
        targetLocalL: 0,
        overlapBehind: 5,
        overlapAhead: 5,
      }),
    /world-position mismatch|heading mismatch/,
  );
});

test('stage continuation primitive has no route-DAG, renderer or vehicle-physics dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/runtime/stage-continuation-link.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /route-dag|route-boundary|renderDriving|car-physics|motorcycle-physics/);
});
