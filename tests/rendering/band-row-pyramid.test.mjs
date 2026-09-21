import assert from 'node:assert/strict';
import test from 'node:test';
import { compileResolvedBands } from '../../tools/performance/band-resolved-slabs.mjs';
import { compileBandFrame, compileBandRowPyramid } from '../../tools/performance/band-row-pyramid.mjs';
import { createFilteredBandRaster } from '../../tools/performance/band-filtered-raster.mjs';
import { integrateOrderedBandBox } from '../../tools/performance/band-area-oracle.mjs';
import { linearToRgb555 } from '../../dist/graphics/image-filter.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
const boundary = (a, b = a, length = 8) => ({
  knots: [
    { anchor: { s: 0 }, l: a },
    { anchor: { s: length }, l: b },
  ],
});
const band = (left, right, color, open = {}) => ({
  start: 0,
  end: 8,
  left: boundary(left),
  right: boundary(right),
  color,
  ...open,
});
const calibration = { maximumFootprint: 6.4, focalLength: 200, cameraHeight: 2.85 };
const fixedFrame = () =>
  compileBandFrame(
    [
      { s: 0, left: -4, right: 4 },
      { s: 8, left: -4, right: 4 },
    ],
    8,
  );
function compile(bands, options = {}, frame = fixedFrame()) {
  return compileBandRowPyramid(compileResolvedBands(bands, 8), frame, { ...calibration, ...options });
}
function span(pyramid, start = pyramid.rangeStart, end = pyramid.rangeEnd, offset = 0) {
  return {
    pyramid,
    source: pyramid.source,
    frameStart: start,
    frameEnd: end,
    sourceLateralOrigin: 0,
    sourceChainageInFrame: (s) => s + offset,
  };
}
const bg = rgb555ToRgba(1234);

test('far normalized boxes match the independent ordered oracle before quantization, including a cliff', () => {
  const bands = [
    band(-4, 4, 31744),
    { ...band(-2, 3, 32767), left: boundary(-2, 0) },
    { ...band(0.2, 1.4, null), start: 2, end: 6 },
  ];
  let checks = 0,
    error = 0;
  const p = compile(bands, {
    observeSample(sample) {
      if (sample.x === 0 || sample.x > sample.rowLength) return;
      const left = -4 + ((sample.x - 1) / sample.rowLength) * 8,
        right = -4 + (sample.x / sample.rowLength) * 8;
      const expected = integrateOrderedBandBox(bands, sample.start, sample.end, left, right);
      for (const key of ['coverage', 'red', 'green', 'blue'])
        error = Math.max(error, Math.abs(expected[key] - sample[key]));
      checks++;
    },
  });
  assert.ok(checks > 300);
  assert.ok(error < 1e-10, `pre-quantization error ${error}`);
  assert.ok(p.levels.every((l) => l.rowLength === Math.ceil(p.frame.maximumWidth / l.lateralSpacing)));
});

test('varying exact outer edges do not turn road width into longitudinal edge blur', () => {
  const frame = compileBandFrame(
    [
      { s: 0, left: -2, right: 2 },
      { s: 8, left: -8, right: 8 },
    ],
    8,
  );
  const bands = [{ ...band(-2, 2, 32767), left: boundary(-2, -8), right: boundary(2, 8) }];
  const p = compile(bands, {}, frame);
  for (const level of p.levels) {
    const row = level.rowAt(0);
    assert.ok(Array.from({ length: level.bucketCount }, (_, i) => level.rowAt(i)).every((r) => r === row));
    assert.equal(row.valueAt(0) >>> 16, 0);
    assert.equal(row.valueAt(row.length + 1) >>> 16, 0);
    for (let i = 1; i <= row.length; i++) assert.equal(row.valueAt(i), 32767 | (255 << 16));
  }
});

test('row storage is exact-interned, immutable through readers and measured as actual packed bytes', () => {
  const p = compile([band(0, 0, 0, { openLeft: true }), band(0, 0, 0, { openRight: true })]);
  assert.equal(p.dictionary.length, p.levels.length);
  const bytes = p.pack();
  assert.equal(bytes.byteLength, p.headerBytes + p.dictionaryBytes + p.directoryBytes + p.frameBytes);
  assert.equal(bytes.byteLength, p.packedBytes);
  assert.equal(new DataView(bytes.buffer).getUint32(4, true), p.levels.length);
  const word = p.levels[0].rowAt(0).valueAt(1);
  bytes.fill(0);
  assert.equal(p.levels[0].rowAt(0).valueAt(1), word);
  assert.equal(word, 255 << 16, 'opaque black never means transparent');
});

test('owned far domains exclude guards without runtime exact-integration fallback; spans combine before threshold', () => {
  const bands = [band(-4, 4, 31744), { ...band(-4, 4, 31), start: 2, end: 6 }];
  const p = compile(bands, { rangeStart: 2, rangeEnd: 6 });
  const raster = createFilteredBandRaster(1),
    pixels = new Uint32Array(1).fill(bg),
    trace = {};
  raster.sample(pixels, 0, 1, 1, 7, 4, 0, 0.2, [span(p)], trace);
  assert.equal(pixels[0], rgb555ToRgba(31));
  assert.equal(trace.sections, 1);
  pixels.fill(bg);
  raster.sample(pixels, 0, 1, 0, 8, 4, 0, 0.2, [span(p)], trace);
  assert.equal(pixels[0], rgb555ToRgba(31), 'equality coverage remains opaque');
  const red = compile([band(-4, 4, 31744)], { rangeStart: 0, rangeEnd: 2 });
  pixels.fill(bg);
  raster.sample(pixels, 0, 1, 0, 8, 4, 0, 0.2, [span(red), span(p)], trace);
  assert.equal(pixels[0], rgb555ToRgba(linearToRgb555(1 / 3, 0, 2 / 3)));
});

test('bucket centers, bucket boundaries and octave selection are continuous before threshold/rounding', () => {
  const p = compile([band(-4, 4, 0), { ...band(-2, 2, 32767), start: 1.6, end: 4.8 }]);
  const r = createFilteredBandRaster(4),
    pixels = new Uint32Array(4),
    before = new Float64Array(16),
    after = new Float64Array(16);
  for (const s of [1.6, 2.4, 3.2, 4, 4.8, 6.4])
    for (const width of [1.6, 3.2, 6.4]) {
      r.sample(pixels, 0, 4, s - width / 2 - 1e-8, s + width / 2 - 1e-8, s - 1e-8, -1, 0.5, [span(p)]);
      r.copyObservation(before);
      r.sample(pixels, 0, 4, s - width / 2 + 1e-8, s + width / 2 + 1e-8, s + 1e-8, -1, 0.5, [span(p)]);
      r.copyObservation(after);
      assert.ok(before.every((v, i) => Math.abs(v - after[i]) < 1e-6));
      r.sample(pixels, 0, 4, s - (width - 1e-8) / 2, s + (width - 1e-8) / 2, s, -1, 0.5, [span(p)]);
      r.copyObservation(before);
      r.sample(pixels, 0, 4, s - (width + 1e-8) / 2, s + (width + 1e-8) / 2, s, -1, 0.5, [span(p)]);
      r.copyObservation(after);
      assert.ok(before.every((v, i) => Math.abs(v - after[i]) < 1e-6));
    }
});

test('transparent-only far rows leave the existing background intact and do no lateral sampling', () => {
  const p = compile([band(-4, 4, null)]),
    r = createFilteredBandRaster(8),
    pixels = new Uint32Array(8).fill(bg),
    trace = {};
  r.sample(pixels, 0, 8, 1, 5, 3, -1, 0.5, [span(p)], trace);
  assert.equal(trace.lateralSamples, 0);
  assert.equal(trace.rowReads, 0);
  assert.ok(pixels.every((pixel) => pixel === bg));
});

test('far boxes retain the shared linear black/white mean rather than encoded-sRGB averaging', () => {
  const bands = [
    { ...band(-4, 4, 32767), end: 0.8 },
    { ...band(-4, 4, 0), start: 0.8 },
  ];
  const p = compile(bands, {
    observeSample(sample) {
      if (sample.level === 0 && sample.bucket === 0 && sample.x > 0 && sample.x <= sample.rowLength) {
        assert.ok(Math.abs(sample.red - 0.5) < 1e-12);
        assert.ok(Math.abs(sample.green - 0.5) < 1e-12);
        assert.ok(Math.abs(sample.blue - 0.5) < 1e-12);
      }
    },
  });
  assert.equal(p.levels[0].rowAt(0).valueAt(1) & 32767, (23 << 10) | (23 << 5) | 23);
});

test('actual saved Section mappings retain the same far row through forward and reverse frame changes', async () => {
  const { loadCourse } = await import('../../tools/course/authoring-io.mjs');
  const { createCourseGeometryTraversal } = await import('../../dist/runtime/course-occurrence.js');
  const { createCourseGeometryView } = await import('../../dist/runtime/course-geometry-view.js');
  const { coursePortLateral } = await import('../../dist/compiler/course-links.js');
  const { course } = await loadCourse('content/courses/seam.course.json');
  const traversal = createCourseGeometryTraversal(course.entry, {
    retainBehind: 500,
    selectAhead: 500,
    maxOccurrences: 8,
  });
  const link = course.entry.outgoing[0];
  assert.ok(traversal.select(traversal.snapshot().active, link).ok);
  const sourceBySection = new Map(
    course.sections.map((section, i) => {
      const length = section.raster.length;
      const source = compileResolvedBands(
        [
          {
            start: 0,
            end: length,
            left: boundary(-4, -4, length),
            right: boundary(0, 0, length),
            color: i ? 31 : 31744,
            openLeft: true,
          },
          {
            start: 0,
            end: length,
            left: boundary(0, 0, length),
            right: boundary(4, 4, length),
            color: i ? 31 : 31744,
            openRight: true,
          },
        ],
        length,
      );
      return [
        section,
        {
          source,
          frame: compileBandFrame(
            [
              { s: 0, left: -4, right: 4 },
              { s: length, left: -4, right: 4 },
            ],
            length,
          ),
          ranges: new Map(),
        },
      ];
    }),
  );
  const sample = (s, l) => {
    const view = createCourseGeometryView(traversal.snapshot(), 'retained');
    assert.ok(view.ok);
    const spans = view.value.spans.map((span) => {
      const source = sourceBySection.get(span.occurrence.section),
        range = span.sourceRange,
        key = `${range.start}:${range.end}`;
      if (!source.ranges.has(key))
        source.ranges.set(
          key,
          compileBandRowPyramid(source.source, source.frame, {
            ...calibration,
            maximumFootprint: 204.8,
            rangeStart: range.start,
            rangeEnd: range.end,
          }),
        );
      return { ...span, pyramid: source.ranges.get(key) };
    });
    const pixels = new Uint32Array(16).fill(bg);
    createFilteredBandRaster(16).sample(pixels, 0, 16, s - 32, s + 32, s, l, 0.25, spans);
    return pixels;
  };
  const before = sample(link.source.anchor.s, 0);
  assert.ok(traversal.forward().ok);
  assert.deepEqual(
    sample(link.destination.anchor.s, coursePortLateral(link.destination) - coursePortLateral(link.source)),
    before,
  );
  assert.ok(traversal.reverse().ok);
  assert.deepEqual(sample(link.source.anchor.s, 0), before);
});

test('revised qualification retains the kinked-edge near/far failure rather than approving a relaxed gate', async () => {
  const { measureRevisedBandQualification } = await import('../../tools/performance/band-revised-qualification.mjs');
  const report = measureRevisedBandQualification();
  assert.equal(report.limits.maximumDisplacementPixelsExclusive, 1);
  assert.equal(report.qualified, false);
  const counterexample = report.transitions.find((row) => row.name.startsWith('kinked'));
  assert.equal(counterexample.nearFar.displacementPixels, 80);
  assert.equal(counterexample.exactOracle.displacementPixels, 80);
  const diagnosis = report.footprintDiagnostic;
  assert.equal(diagnosis.sourceShared, true);
  assert.equal(diagnosis.additionalTransparentLayerPreservesResolvedPaint, true);
  assert.equal(diagnosis.farFirstTransparentPixel - diagnosis.nearFirstTransparentPixel, 6);
  assert.ok(Math.abs(diagnosis.exactHalfCoverageLateral - 18.5) < 1e-12);
  assert.ok(Math.abs(diagnosis.unquantizedHalfCoverageLateral - 416 / 21) < 1e-12);
  assert.ok(Math.abs(diagnosis.unquantizedDisplacementPixels - 110 / 21) < 1e-12);
  assert.equal(diagnosis.qualified, false);
  const atExactEdge = diagnosis.rows.find((row) => row.x === 160);
  assert.ok(Math.abs(atExactEdge.exactCoverage - 0.5) < 1e-12);
  assert.equal(atExactEdge.unquantizedReconstruction, 567 / 1024);
  assert.ok(Math.abs(atExactEdge.observedCoverage - atExactEdge.unquantizedReconstruction) < 1 / 255);
  assert.equal(report.phaseDiagnostic.identicalFarRows, true);
  assert.equal(report.phaseDiagnostic.exactCoverage[0], 0);
  assert.ok(Math.abs(report.phaseDiagnostic.exactCoverage[1] - 0.75) < 1e-12);
  assert.deepEqual(report.phaseDiagnostic.maximumIntervals, [1, 1]);
});
