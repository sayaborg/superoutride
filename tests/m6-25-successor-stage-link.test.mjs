import test from 'node:test';
import assert from 'node:assert/strict';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM622ChildStageContinuation } from '../dist/dev/m6-22-child-stage-continuation.js';
import {
  compileStageContinuationLink,
  mapStageContinuationChainage,
  mapStageContinuationLateral,
} from '../dist/runtime/stage-continuation-link.js';

function setup(side) {
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);
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

test('M6.25 generic successor link validates the existing LEFT parent-to-child D_cam overlap', () => {
  const { link } = setup('LEFT');
  assert.equal(link.sourceLocalL, -7.5);
  assert.equal(link.targetLocalL, 0);
  assert.equal(link.overlapBehind, 5);
  assert.equal(link.overlapAhead, 5);
});

test('M6.25 generic successor link validates the existing RIGHT parent-to-child D_cam overlap', () => {
  const { link } = setup('RIGHT');
  assert.equal(link.sourceLocalL, 7.5);
  assert.equal(link.targetLocalL, 0);
});

test('M6.25 chainage mapping is a pure seam-relative rebase', () => {
  const { continuation, link } = setup('LEFT');
  assert.equal(mapStageContinuationChainage(link, 600), continuation.handoffLocalS);
  assert.equal(mapStageContinuationChainage(link, 595), continuation.handoffLocalS - 5);
  assert.equal(mapStageContinuationChainage(link, 605), continuation.handoffLocalS + 5);
});

test('M6.25 lateral mapping preserves signed displacement from the linked road center', () => {
  const { link } = setup('RIGHT');
  assert.equal(mapStageContinuationLateral(link, 7.5), 0);
  assert.equal(mapStageContinuationLateral(link, 9.0), 1.5);
  assert.equal(mapStageContinuationLateral(link, 6.25), -1.25);
});

test('M6.25 rejects a successor link whose charts do not describe the same overlap geometry', () => {
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);
  assert.throws(() => compileStageContinuationLink({
    id: 'BAD_LINK',
    sourceFrame: continuation.charts.parent,
    targetFrame: continuation.left.chart,
    sourceSeamS: 600,
    targetSeamS: continuation.handoffLocalS + 1,
    sourceLocalL: -7.5,
    targetLocalL: 0,
    overlapBehind: 5,
    overlapAhead: 5,
  }), /world-position mismatch|heading mismatch/);
});

test('M6.25 stage continuation primitive has no route-DAG, renderer or vehicle-physics dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/runtime/stage-continuation-link.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /route-dag|route-boundary|renderM5Driving|car-physics|motorcycle-physics/);
});
