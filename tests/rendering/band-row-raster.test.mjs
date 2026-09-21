import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBandArea,
  compileCrossSectionPyramids,
  resolveBandArea,
} from '../../tools/performance/band-cross-section.mjs';
import { createBandRowRaster, integrateBandRectangle } from '../../tools/performance/band-row-raster.mjs';
import { trialRowInterval } from '../../tools/performance/band-trial-scene.mjs';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { loadCourse } from '../../tools/course/authoring-io.mjs';
import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { coursePortLateral } from '../../dist/compiler/course-links.js';

const background = rgb555ToRgba(1234);
const rectangle = (start, end, rgb, left = -10, right = 10) => ({
  start,
  end,
  pieces: [{ left0: left, left1: left, right0: right, right1: right, rgb }],
});
function fixture(sources, maximumFootprint = 8) {
  const pyramid = compileCrossSectionPyramids(sources, { minimumWidth: 1.6, maximumFootprint });
  return {
    pyramid,
    sources: sources.map((source, index) => ({ ...source, pyramid: pyramid.sections[index] })),
  };
}
function span(source, start = 0, end = source.length, sourceStart = start, origin = 0) {
  return {
    source,
    frameStart: start,
    frameEnd: end,
    sourceRange: { start: sourceStart, end: sourceStart + end - start },
    sourceLateralOrigin: origin,
    sourceChainageInFrame: (s) => sourceStart + s - start,
  };
}
function row(f, spans, start, end, lateral, step, count = 1, filtered = true) {
  const pixels = new Uint32Array(count).fill(background);
  createBandRowRaster(count, f.pyramid, filtered).sample(pixels, 0, count, start, end, lateral, step, spans);
  return pixels;
}

test('direct row sweep equals an independent rectangle integral for oblique and clipped Bands', () => {
  const slabs = [
    { start: 0, end: 4, pieces: [{ left0: -2, left1: 0, right0: 0, right1: 3, rgb: [255, 33, 8] }] },
    rectangle(4, 8, [0, 255, 66], -1, 1),
  ];
  const f = fixture([{ id: 'a', length: 8, slabs }]);
  for (const [a, b] of [
    [0, 0.8],
    [0.7, 2],
    [3.5, 4.5],
    [0, 8],
  ]) {
    const pixels = row(f, [span(f.sources[0])], a, b, -3, 0.25, 32, false);
    for (let x = 0; x < pixels.length; x++) {
      const left = -3 + (x - 0.5) * 0.25;
      const area = integrateBandRectangle(slabs, a, b, left, left + 0.25, createBandArea());
      const expected = resolveBandArea(area, (b - a) * 0.25, 0.5);
      assert.equal(pixels[x], expected === null ? background : rgb555ToRgba(expected));
    }
  }
});

test('two subthreshold Section contributions become opaque only after composition, retaining gaps', () => {
  const f = fixture([
    { id: 'red', length: 20, slabs: [rectangle(0, 20, [255, 0, 0])] },
    { id: 'blue', length: 30, slabs: [rectangle(0, 30, [0, 0, 255])] },
  ]);
  const spans = [span(f.sources[0], 0, 1.5, 10, 2), span(f.sources[1], 2.5, 4, 20, -3)];
  for (const filtered of [false, true]) {
    assert.equal(row(f, [spans[0]], 0, 4, 0, 1, 1, filtered)[0], background);
    assert.equal(row(f, spans, 0, 4, 0, 1, 1, filtered)[0], rgb555ToRgba((16 << 10) | 16));
  }
});

test('far boundary buckets cannot import non-owned Section guard colors', () => {
  const f = fixture([
    {
      id: 'owned',
      length: 8,
      slabs: [rectangle(0, 2, [255, 0, 0]), rectangle(2, 6, [0, 0, 0]), rectangle(6, 8, [0, 255, 0])],
    },
  ]);
  const spans = [span(f.sources[0], 2, 6)];
  assert.equal(row(f, spans, 1, 7, 0, 1)[0], rgb555ToRgba(0));
  assert.equal(row(f, spans, 0, 8, 0, 1)[0], background, 'half transparent retains BG at equality');
});

test('open outer sides and transparent rows work at arbitrary finite screen coordinates', () => {
  const f = fixture([
    {
      id: 'open',
      length: 8,
      slabs: [
        {
          start: 0,
          end: 8,
          pieces: [
            { openLeft: true, right0: -1, right1: -1, rgb: [0, 0, 0] },
            { left0: 1, left1: 1, openRight: true, rgb: [255, 255, 255] },
          ],
        },
      ],
    },
  ]);
  for (const filtered of [false, true]) {
    const spans = [span(f.sources[0])];
    assert.equal(row(f, spans, 0, 4, -1e6, 1, 1, filtered)[0], rgb555ToRgba(0));
    assert.equal(row(f, spans, 0, 4, 1e6, 1, 1, filtered)[0], rgb555ToRgba(32767));
    assert.equal(row(f, spans, 0, 4, 0, 1, 1, filtered)[0], background);
  }
  const empty = fixture([{ id: 'empty', length: 8, slabs: [] }]);
  assert.deepEqual(row(empty, [span(empty.sources[0])], 0, 8, 0, 1, 4), new Uint32Array(4).fill(background));
});

test('one source split through actual transformed Link spans retains the same composed row after reframe', async () => {
  const { course } = await loadCourse('content/courses/seam.course.json');
  const traversal = createCourseGeometryTraversal(course.entry, {
    retainBehind: 500,
    selectAhead: 500,
    maxOccurrences: 8,
  });
  const link = course.entry.outgoing[0];
  assert.ok(traversal.select(traversal.snapshot().active, link).ok);
  const inputs = course.sections.map((section, index) => ({
    id: section.id,
    length: section.raster.length,
    slabs: [rectangle(0, section.raster.length, index ? [0, 0, 255] : [255, 0, 0], -100, 100)],
  }));
  const f = fixture(inputs, 204.8);
  const bySection = new Map(course.sections.map((section, index) => [section, f.sources[index]]));
  const sample = (s, l) => {
    const view = createCourseGeometryView(traversal.snapshot(), 'retained');
    assert.ok(view.ok);
    const spans = view.value.spans.map((s) => ({ ...s, source: bySection.get(s.occurrence.section) }));
    return row(f, spans, s - 32, s + 32, l, 0.25, 16);
  };
  const before = sample(link.source.anchor.s, 0);
  assert.ok(traversal.forward().ok);
  const after = sample(link.destination.anchor.s, coursePortLateral(link.destination) - coursePortLateral(link.source));
  assert.deepEqual(after, before);
  assert.ok(traversal.reverse().ok);
  assert.deepEqual(sample(link.source.anchor.s, 0), before);
});

test('actual perspective row endpoints are asymmetric about the representative chainage', () => {
  const camera = { centerY: 120, focalLength: 200, pitch: 0, s: 0, y: 2.85 };
  const line = { s: 76, d: 76, y: 127, renderHeight: 0, sourceFootprint: { collapsed: false } };
  const out = trialRowInterval(
    line,
    camera,
    {},
    { sampleRender: () => ({ grade: 0 }) },
    { dStart: 2.5, dEnd: 200 },
    {},
    {},
  );
  assert.equal(out.start, 570 / 8);
  assert.equal(out.end, 570 / 7);
  assert.ok(Math.abs((out.start + out.end) / 2 - line.s) > 0.3);
});

test('collapsed rows preserve their complete actual interval rather than a centered surrogate', () => {
  const camera = { centerY: 120, focalLength: 200, pitch: 0, s: 0, y: 2.85 };
  const line = {
    s: 16,
    d: 16,
    y: 155,
    renderHeight: 0,
    sourceFootprint: { collapsed: true, deltaS: 1, deltaSCollapse: 30 },
  };
  const out = trialRowInterval(
    line,
    camera,
    { boundaries: [10, 40] },
    { sampleRender: () => ({ grade: 0 }) },
    { dStart: 2.5, dEnd: 200 },
    {},
    {},
  );
  assert.deepEqual(out, { start: 10, end: 40 });
});

test('transition diagnostic detects a multi-pixel jump even below the interval budget', async () => {
  const { measureBandTransition } = await import('../../tools/performance/band-transition-probe.mjs');
  const result = measureBandTransition();
  assert.ok(result.maximumIntervals <= 32);
  assert.ok(result.worst.displacementPixels > 1);
  assert.equal(result.worst.directDisplacementPixels, 0);
  assert.equal(result.qualified, false, 'detecting the failure must not certify the proposed transition');
});
