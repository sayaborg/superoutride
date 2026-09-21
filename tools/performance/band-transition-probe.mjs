import { compileCrossSectionPyramids } from './band-cross-section.mjs';
import { createBandRowRaster } from './band-row-raster.mjs';

/** A diagnostic counterexample, not a passing transition-acceptance test. */
export function measureBandTransition() {
  const source = {
    id: 'moving-open-edge',
    length: 64,
    slabs: [{ start: 0, end: 64, pieces: [{ openLeft: true, right0: 0, right1: 640, rgb: [255, 255, 255] }] }],
  };
  const pyramid = compileCrossSectionPyramids([source], { minimumWidth: 1.6, maximumFootprint: 8 });
  source.pyramid = pyramid.sections[0];
  const spans = [
    {
      source,
      frameStart: 0,
      frameEnd: 64,
      sourceRange: { start: 0, end: 64 },
      sourceLateralOrigin: 0,
      sourceChainageInFrame: (s) => s,
    },
  ];
  const filtered = createBandRowRaster(320, pyramid, true);
  const direct = createBandRowRaster(320, pyramid, false);
  const before = new Uint32Array(320);
  const after = new Uint32Array(320);
  let worst = { displacementPixels: 0 };
  for (let i = 0; i < 64; i++) {
    const s = 4 + i * 0.1;
    const lateral = s * 10 - 40;
    const below = 3.2 - 1e-8;
    before.fill(0);
    after.fill(0);
    filtered.sample(before, 0, 320, s - below / 2, s + below / 2, lateral, 0.25, spans);
    filtered.sample(after, 0, 320, s - 1.6, s + 1.6, lateral, 0.25, spans);
    const first = before.findIndex((pixel) => pixel === 0);
    const last = after.findIndex((pixel) => pixel === 0);
    const displacementPixels = Math.abs(first - last);
    if (displacementPixels > worst.displacementPixels) {
      before.fill(0);
      after.fill(0);
      direct.sample(before, 0, 320, s - below / 2, s + below / 2, lateral, 0.25, spans);
      direct.sample(after, 0, 320, s - 1.6, s + 1.6, lateral, 0.25, spans);
      worst = {
        s,
        displacementPixels,
        beforeEdge: first,
        afterEdge: last,
        directDisplacementPixels: Math.abs(before.findIndex((p) => p === 0) - after.findIndex((p) => p === 0)),
      };
    }
  }
  return {
    scope: 'Synthetic moving opaque/transparent edge; not real-course motion acceptance',
    pointActiveBands: 1,
    maximumIntervals: pyramid.maximumIntervals,
    focalLengthPixels: 200,
    distanceMeters: 50,
    lateralMetersPerPixel: 0.25,
    thresholdDeltaS: 3.2,
    worst,
    qualified: worst.displacementPixels < 1,
  };
}
