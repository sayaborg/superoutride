import { compileResolvedBands } from './band-resolved-slabs.mjs';
import { compileBandNormalization, compileNormalizedBandRows } from './band-normalized-rows.mjs';
import { createNormalizedRowRaster } from './band-filtered-raster.mjs';
import { createResolvedSlabRaster } from './band-slab-raster.mjs';

/** Thresholded edge probes retain the old pixel metric. Detection of failure is not acceptance. */
export function measureNormalizedTransition() {
  function probe(movingChart) {
    const length = movingChart ? 64 : 8;
    const edge = (a, b = a) => ({
      knots: [
        { anchor: { s: 0 }, l: a },
        { anchor: { s: length }, l: b },
      ],
    });
    const band = (left, right, color, extra = {}) => ({
      start: 0,
      end: length,
      left: edge(left),
      right: edge(right),
      color,
      ...extra,
    });
    const bands = movingChart
      ? [band(0, 0, 32767, { right: edge(0, 640), openLeft: true })]
      : [
          band(0, -100, 32767, { openLeft: true }),
          band(-100, 100, 32767),
          band(100, 0, 32767, { openRight: true }),
          band(0, 0, null, { left: edge(0, 80), openRight: true }),
        ];
    const source = compileResolvedBands(bands, length);
    const frames = movingChart
      ? [{ start: 0, end: length, left0: -80, left1: 560, right0: 0, right1: 640 }]
      : compileBandNormalization(bands, source);
    const pyramid = compileNormalizedBandRows(source, frames, {
      start: 0,
      end: length,
      maximumFootprint: 8,
      focalLength: 200,
      cameraHeight: 2.85,
    });
    const spans = [
      { source, pyramid, frameStart: 0, frameEnd: length, sourceLateralOrigin: 0, sourceChainageInFrame: (s) => s },
    ];
    const near = createResolvedSlabRaster(320),
      far = createNormalizedRowRaster(320, [pyramid]);
    const before = new Uint32Array(320),
      after = new Uint32Array(320);
    let nearFar = { displacementPixels: 0 },
      levels = { displacementPixels: 0 },
      buckets = { displacementPixels: 0 };
    function compare(s, width, nearFirst, stationShift = 0) {
      before.fill(0);
      after.fill(0);
      const epsilon = 1e-8,
        lateral = s * 10 - 40;
      const first = s - stationShift,
        second = s + stationShift;
      if (nearFirst)
        near.sample(before, 0, 320, first - (width - epsilon) / 2, first + (width - epsilon) / 2, lateral, 0.25, spans);
      else
        far.sample(
          before,
          0,
          320,
          first - (width - epsilon) / 2,
          first + (width - epsilon) / 2,
          first,
          lateral,
          0.25,
          spans,
        );
      far.sample(after, 0, 320, second - width / 2, second + width / 2, second, lateral, 0.25, spans);
      const beforeEdge = before.findIndex((p) => p === 0),
        afterEdge = after.findIndex((p) => p === 0);
      before.fill(0);
      after.fill(0);
      near.sample(before, 0, 320, first - (width - epsilon) / 2, first + (width - epsilon) / 2, lateral, 0.25, spans);
      near.sample(after, 0, 320, second - width / 2, second + width / 2, lateral, 0.25, spans);
      const controlBeforeEdge = before.findIndex((p) => p === 0),
        controlAfterEdge = after.findIndex((p) => p === 0);
      return {
        s,
        deltaS: width,
        beforeEdge,
        afterEdge,
        displacementPixels: Math.abs(beforeEdge - afterEdge),
        spanControlDisplacementPixels: Math.abs(controlBeforeEdge - controlAfterEdge),
      };
    }
    for (let i = 0; i < (movingChart ? 64 : 120); i++) {
      const s = movingChart ? 4 + i * 0.1 : 0.85 + i * 0.05;
      const n = compare(s, 1.6, true);
      if (n.displacementPixels > nearFar.displacementPixels) nearFar = n;
      if (s >= 3.2 && s + 3.2 <= length)
        for (const width of [3.2, 6.4]) {
          const l = compare(s, width, false);
          if (l.displacementPixels > levels.displacementPixels) levels = l;
        }
    }
    for (let k = 1; k < 5; k++) {
      const s = k * 1.6;
      const b = compare(s, 1.6, false, 1e-8);
      if (b.displacementPixels > buckets.displacementPixels) buckets = b;
    }
    return {
      movingChart,
      savedCounterexample: movingChart ? compare(7.2, 3.2, false) : null,
      maximumIntervals: source.maximumIntervals,
      nearFar,
      levels,
      buckets,
      qualified: [nearFar, levels, buckets].every((p) => p.displacementPixels < 1),
    };
  }
  const movingOpenEdge = probe(true),
    orderedCliff = probe(false);
  return {
    scope:
      'Synthetic ordered open-edge fixtures, thresholded first transparent pixel; not general real-content acceptance',
    metersPerPixel: 0.25,
    minimumWidth: 1.6,
    movingOpenEdge,
    orderedCliff,
    qualified: movingOpenEdge.qualified && orderedCliff.qualified,
  };
}
