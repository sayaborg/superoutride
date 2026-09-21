import { compileResolvedBands } from './band-resolved-slabs.mjs';
import { compileBandFrame, compileBandRowPyramid } from './band-row-pyramid.mjs';
import { createFilteredBandRaster } from './band-filtered-raster.mjs';
import { createResolvedSlabRaster } from './band-slab-raster.mjs';
import { integrateOrderedBandBox } from './band-area-oracle.mjs';

const curve = (length, first, last = first) => ({
  knots: [
    { anchor: { s: 0 }, l: first },
    { anchor: { s: length }, l: last },
  ],
});
const paint = (length, left, right, color, flags = {}) => ({
  start: 0,
  end: length,
  left: curve(length, left),
  right: curve(length, right),
  color,
  ...flags,
});
function field(bands, length, left, right) {
  const source = compileResolvedBands(bands, length);
  const frame = compileBandFrame(
    [
      { s: 0, left, right },
      { s: length, left, right },
    ],
    length,
  );
  const pyramid = compileBandRowPyramid(source, frame, {
    maximumFootprint: 3.2,
    focalLength: 200,
    cameraHeight: 2.85,
  });
  const spans = [
    { source, pyramid, frameStart: 0, frameEnd: length, sourceLateralOrigin: 0, sourceChainageInFrame: (s) => s },
  ];
  return { source, pyramid, spans };
}

/** This exposes a failing reconstruction, not a looser acceptance rule or a runtime oracle. */
export function diagnoseBandFootprint() {
  const bands = [
    paint(8, 0, -100, 32767, { openLeft: true }),
    paint(8, -100, 100, 32767),
    paint(8, 100, 0, 32767, { openRight: true }),
    paint(8, 0, 0, null, { left: curve(8, 0, 80), openRight: true }),
  ];
  const { source, pyramid, spans } = field(bands, 8, -100, 100);
  // The earlier transparent layer is covered by the same later cliff; paint order must not change.
  const layered = field(
    [...bands.slice(0, 3), paint(8, 2, 0, null, { left: curve(8, 2, 82), openRight: true }), bands[3]],
    8,
    -100,
    100,
  );
  const station = 1.85,
    footprint = 1.6,
    step = 0.25,
    lateral = station * 10 - 40;
  const start = station - footprint / 2,
    end = station + footprint / 2;
  const before = new Uint32Array(320),
    after = new Uint32Array(320),
    observed = new Float64Array(1280);
  const near = createResolvedSlabRaster(320),
    far = createFilteredBandRaster(320);
  near.sample(before, 0, 320, station - (footprint - 1e-8) / 2, station + (footprint - 1e-8) / 2, lateral, step, spans);
  far.sample(after, 0, 320, start, end, station, lateral, step, spans);
  far.copyObservation(observed);
  const rows = [];
  for (let x = 156; x <= 169; x++) {
    const l = lateral + x * step,
      lo = l - step / 2,
      hi = l + step / 2;
    const first = integrateOrderedBandBox(bands, 0, 1.6, lo, hi).coverage;
    const last = integrateOrderedBandBox(bands, 1.6, 3.2, lo, hi).coverage;
    rows.push({
      x,
      lateral: l,
      exactCoverage: integrateOrderedBandBox(bands, start, end, lo, hi).coverage,
      firstBucketCoverage: first,
      lastBucketCoverage: last,
      unquantizedReconstruction: first * 0.34375 + last * 0.65625,
      observedCoverage: observed[x * 4],
      nearOpaque: before[x] !== 0,
      farOpaque: after[x] !== 0,
    });
  }
  const exactEdge = station * 10,
    reconstructedEdge = 32 - (16 * 0.5) / 0.65625;
  return {
    scope: 'Unfixed six-pixel cliff: compare actual row footprint with exact bucket integrals before quantization.',
    sourceShared: pyramid.source === source,
    additionalTransparentLayerPreservesResolvedPaint:
      JSON.stringify(source.slabs) === JSON.stringify(layered.source.slabs),
    nearIntervals: source.slabs[0].intervals,
    start,
    end,
    station,
    metersPerPixel: step,
    bucketRanges: [
      [0, 1.6],
      [1.6, 3.2],
    ],
    bucketCenters: [0.8, 2.4],
    bucketWeights: [0.34375, 0.65625],
    sourceEdgesAtFootprintEnds: [start * 10, end * 10],
    rowLength: pyramid.levels[0].rowLength,
    nearFirstTransparentPixel: before.findIndex((v) => v === 0),
    farFirstTransparentPixel: after.findIndex((v) => v === 0),
    exactHalfCoverageLateral: exactEdge,
    unquantizedHalfCoverageLateral: reconstructedEdge,
    unquantizedDisplacementPixels: (reconstructedEdge - exactEdge) / step,
    rows,
    qualified: Math.abs(reconstructedEdge - exactEdge) / step < 1,
  };
}

/** Two different master footprints can have identical far rows: no interpolation of those rows can distinguish them. */
export function diagnoseBandPhaseLoss() {
  const length = 3.2;
  const whole = (start, end, color) => [
    paint(length, 0, 0, color, { start, end, openLeft: true }),
    paint(length, 0, 0, color, { start, end, openRight: true }),
  ];
  const masters = [
    [...whole(0, length, 32767), ...whole(0.6, 2.6, null)],
    [...whole(0, length, 32767), ...whole(0, 1, null), ...whole(2.2, length, null)],
  ];
  const sources = masters.map((bands) => field(bands, length, -1, 1));
  const rowValues = (p) =>
    p.levels.map((level) =>
      Array.from({ length: level.bucketCount }, (_, b) => {
        const row = level.rowAt(b);
        return Array.from({ length: row.length + 2 }, (_, x) => row.valueAt(x));
      }),
    );
  return {
    scope: 'Identical RGB555/coverage rows at both available levels, different exact center-row coverage.',
    exactCoverage: masters.map((bands) => integrateOrderedBandBox(bands, 0.8, 2.4, -0.125, 0.125).coverage),
    identicalFarRows: JSON.stringify(rowValues(sources[0].pyramid)) === JSON.stringify(rowValues(sources[1].pyramid)),
    maximumIntervals: sources.map((s) => s.source.maximumIntervals),
    levels: sources[0].pyramid.levels.length,
  };
}
