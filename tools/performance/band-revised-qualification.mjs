import { compileResolvedBands } from './band-resolved-slabs.mjs';
import { compileBandFrame, compileBandRowPyramid } from './band-row-pyramid.mjs';
import { createFilteredBandRaster } from './band-filtered-raster.mjs';
import { createResolvedSlabRaster } from './band-slab-raster.mjs';
import { integrateOrderedBandBox } from './band-area-oracle.mjs';

const curve = (points) => ({ knots: points.map(([s, l]) => ({ anchor: { s }, l })) });
function study(movingFrame, kink) {
  const length = 64;
  const points = kink
    ? [
        [0, -20],
        [6.4, -20],
        [7.2, 20],
        [8, -20],
        [64, -20],
      ]
    : [
        [0, 0],
        [64, 640],
      ];
  const bands = [
    {
      start: 0,
      end: length,
      left: curve([
        [0, -40],
        [64, 600],
      ]),
      right: curve(points),
      color: 32767,
      openLeft: true,
    },
  ];
  const source = compileResolvedBands(bands, length);
  const frame = compileBandFrame(
    movingFrame
      ? points.map(([s, l]) => ({ s, left: l - 40, right: l }))
      : [
          { s: 0, left: -40, right: 680 },
          { s: length, left: -40, right: 680 },
        ],
    length,
  );
  const pyramid = compileBandRowPyramid(source, frame, { maximumFootprint: 8, focalLength: 200, cameraHeight: 2.85 });
  const spans = [
    { source, pyramid, frameStart: 0, frameEnd: length, sourceLateralOrigin: 0, sourceChainageInFrame: (s) => s },
  ];
  return { bands, source, pyramid, spans };
}
function edge(pixels) {
  const i = pixels.findIndex((pixel) => pixel === 0);
  return i < 0 ? pixels.length : i;
}

/** Reproducible acceptance diagnostics: a false result remains a failure, never a relaxed test limit. */
export function measureRevisedBandQualification() {
  const far = createFilteredBandRaster(320),
    near = createResolvedSlabRaster(320);
  const before = new Uint32Array(320),
    after = new Uint32Array(320);
  const examples = [
    { name: 'saved-linear-open-edge-with-exact-moving-frame', ...study(true, false) },
    { name: 'interior-moving-edge-with-fixed-outer-frame', ...study(false, false) },
    { name: 'kinked-open-edge-with-exact-moving-frame', ...study(true, true) },
  ];
  const transitions = [];
  for (const example of examples) {
    let octave = { displacementPixels: 0 },
      boundary = { displacementPixels: 0 },
      oracle = { displacementPixels: 0 };
    for (let i = 0; i < 64; i++) {
      const s = 4 + i * 0.1;
      const centerEdge = example.name.startsWith('kinked') ? 0 : s * 10;
      const lateral = centerEdge - 40,
        step = 0.25;
      before.fill(0);
      after.fill(0);
      far.sample(before, 0, 320, s - (3.2 - 1e-8) / 2, s + (3.2 - 1e-8) / 2, s, lateral, step, example.spans);
      far.sample(after, 0, 320, s - 1.6, s + 1.6, s, lateral, step, example.spans);
      const oct = Math.abs(edge(before) - edge(after));
      if (oct > octave.displacementPixels)
        octave = { s, displacementPixels: oct, beforeEdge: edge(before), afterEdge: edge(after) };
      before.fill(0);
      after.fill(0);
      near.sample(before, 0, 320, s - (1.6 - 1e-8) / 2, s + (1.6 - 1e-8) / 2, lateral, step, example.spans);
      far.sample(after, 0, 320, s - 0.8, s + 0.8, s, lateral, step, example.spans);
      const jump = Math.abs(edge(before) - edge(after));
      if (jump > boundary.displacementPixels)
        boundary = { s, displacementPixels: jump, beforeEdge: edge(before), afterEdge: edge(after) };
      // Independent ordered rectangle oracle at the very same near/far boundary footprint.
      let expected = 320;
      for (let x = 0; x < 320; x++) {
        const left = lateral + (x - 0.5) * step;
        if (integrateOrderedBandBox(example.bands, s - 0.8, s + 0.8, left, left + step).coverage < 0.5) {
          expected = x;
          break;
        }
      }
      const difference = Math.abs(expected - edge(after));
      if (difference > oracle.displacementPixels)
        oracle = { s, displacementPixels: difference, exactEdge: expected, filteredEdge: edge(after) };
    }
    transitions.push({ name: example.name, octave, nearFar: boundary, exactOracle: oracle });
  }
  return {
    scope:
      'Synthetic ordered open-edge tests; 0.25 m/pixel, 320 pixels; independent rectangle oracle. Not general real-content visual acceptance.',
    limits: { maximumDisplacementPixelsExclusive: 1 },
    transitions,
    qualified: transitions.every(
      (t) =>
        t.octave.displacementPixels < 1 && t.nearFar.displacementPixels < 1 && t.exactOracle.displacementPixels < 1,
    ),
  };
}
