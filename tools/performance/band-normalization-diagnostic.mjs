import { compileResolvedBands } from './band-resolved-slabs.mjs';
import { compileBandFrame, compileBandRowPyramid } from './band-row-pyramid.mjs';
import { createFilteredBandRaster } from './band-filtered-raster.mjs';
import { createResolvedSlabRaster } from './band-slab-raster.mjs';
import { integrateOrderedBandBox } from './band-area-oracle.mjs';

/** Isolate moving-frame normalization from longitudinal bucket phase or palette quantization. */
export function diagnoseBandNormalization() {
  const length = 16;
  const points = [
    [0, -20],
    [6.4, -20],
    [7.2, 20],
    [8, -20],
    [length, -20],
  ];
  const bands = [
    {
      start: 0,
      end: length,
      left: {
        knots: [
          { anchor: { s: 0 }, l: -60 },
          { anchor: { s: length }, l: -60 },
        ],
      },
      right: { knots: points.map(([s, l]) => ({ anchor: { s }, l })) },
      color: 32767,
      openLeft: true,
    },
  ];
  const source = compileResolvedBands(bands, length);
  const frame = compileBandFrame(
    points.map(([s, right]) => ({ s, left: right - 40, right })),
    length,
  );
  let maximumNormalizedInteriorError = 0;
  const pyramid = compileBandRowPyramid(source, frame, {
    maximumFootprint: 3.2,
    focalLength: 200,
    cameraHeight: 2.85,
    observeSample(sample) {
      if (sample.x > 0 && sample.x <= sample.rowLength)
        maximumNormalizedInteriorError = Math.max(maximumNormalizedInteriorError, Math.abs(sample.coverage - 1));
    },
  });
  const spans = [
    { source, pyramid, frameStart: 0, frameEnd: length, sourceLateralOrigin: 0, sourceChainageInFrame: (s) => s },
  ];
  const start = 6.4,
    end = 8,
    station = 7.2,
    lateral = -40,
    step = 0.25;
  const before = new Uint32Array(320),
    after = new Uint32Array(320),
    observation = new Float64Array(1280);
  createResolvedSlabRaster(320).sample(before, 0, 320, start, end, lateral, step, spans);
  const far = createFilteredBandRaster(320);
  far.sample(after, 0, 320, start, end, station, lateral, step, spans);
  far.copyObservation(observation);
  const rows = [-0.25, 0, 0.25, 19.75, 20, 20.25].map((l) => {
    const x = Math.round((l - lateral) / step);
    return {
      x,
      lateral: l,
      exactCoverage: integrateOrderedBandBox(bands, start, end, l - step / 2, l + step / 2).coverage,
      observedCoverage: observation[x * 4],
      nearOpaque: before[x] !== 0,
      farOpaque: after[x] !== 0,
    };
  });
  return {
    scope:
      'Moving normalization removes the kink before averaging: even exact normalized rows cannot represent the fixed lateral footprint.',
    sourceShared: pyramid.source === source,
    start,
    end,
    station,
    metersPerPixel: step,
    sourceEdgeAtStartCenterEnd: [-20, 20, -20],
    normalizationWidth: 40,
    maximumNormalizedInteriorError,
    exactHalfCoverageLateral: 0,
    restoredHalfCoverageLateral: 20,
    unquantizedDisplacementPixels: 20 / step,
    nearFirstTransparentPixel: before.findIndex((v) => v === 0),
    farFirstTransparentPixel: after.findIndex((v) => v === 0),
    rows,
    qualified: false,
  };
}
