import { createPlanarCoordinateSample } from '../../dist/core/planar-sample.js';
import { createGuideProjectionWorkspace } from '../../dist/core/guide-curve.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRasterPath } from '../../dist/core/raster-path.js';
import {
  compileGuidePath,
  guidePathToWorld,
  locateWorldOnGuideGlobal,
  minimumGuideRadius,
} from '../../dist/core/guide-curve.js';
import { compileGuideEnvelope, guideEnvelopeAt, guideEnvelopeRange } from '../../dist/core/guide-envelope.js';
import { guideCoordinateToWorld, locateWorldOnGuideCoordinateGlobal } from '../../dist/core/guide-coordinate-frame.js';
import { compilePhysicalRaceGate } from '../../dist/gameplay/physical-race-gate.js';

const straight = () =>
  compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: 100 },
  ]);
const bend = (sourceRadius) =>
  compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: 100, ...(sourceRadius === undefined ? {} : { sourceRadius }) },
    { x: 100 * Math.sin(0.1), z: 100 + 100 * Math.cos(0.1) },
  ]);

test('constant scalar and explicit profiles have identical fillets, ruler and world samples', () => {
  for (const radius of [undefined, 50]) {
    const raster = bend(radius);
    const constant = compileGuidePath(raster, { lMax: 6, mMin: 0.25 });
    const explicit = compileGuidePath(raster, {
      envelope: [
        { s: 0, lMax: 6 },
        { s: raster.length, lMax: 6 },
      ],
      mMin: 0.25,
    });
    assert.deepEqual(explicit, constant);
    const corner = explicit.corners[1];
    const expectedRadius =
      radius === undefined ? 6 / (1 - 0.25 / corner.mu) : radius * Math.cos(Math.abs(corner.turn) / 2);
    assert.equal(corner.radius, expectedRadius);
    assert.equal(corner.trim, expectedRadius * Math.tan(Math.abs(corner.turn) / 2));
    for (const s of [0, 99, 100, 101, raster.length])
      for (const l of [-6, 0, 6])
        assert.deepEqual(
          guidePathToWorld(explicit, s, l, createPlanarCoordinateSample()),
          guidePathToWorld(constant, s, l, createPlanarCoordinateSample()),
        );
  }
});

test('the full fillet interval detects an off-center envelope peak and interpolation at its trim', () => {
  const raster = bend(50);
  const base = compileGuidePath(raster, { lMax: 4, mMin: 0.25 });
  const { trim } = base.corners[1];
  const peak = [
    { s: 0, lMax: 4 },
    { s: 100, lMax: 4 },
    { s: 100 + trim / 2, lMax: 40 },
    { s: 100 + trim, lMax: 4 },
    { s: raster.length, lMax: 4 },
  ];
  assert.equal(guideEnvelopeAt(compileGuideEnvelope(peak, raster.length), 100), 4);
  assert.throws(() => compileGuidePath(raster, { envelope: peak, mMin: 0.25 }), RangeError);
  // No knot lies in the outer half of the fillet: its clipped endpoint is still checked.
  const slope = [
    { s: 0, lMax: 4 },
    { s: 100, lMax: 4 },
    { s: 100 + 2 * trim, lMax: 80 },
    { s: raster.length, lMax: 80 },
  ];
  assert.throws(() => compileGuidePath(raster, { envelope: slope, mMin: 0.25 }), RangeError);
  peak[2].lMax = 10;
  const admitted = compileGuidePath(raster, { envelope: peak, mMin: 0.25 });
  assert.equal(admitted.corners[1].radius, base.corners[1].radius, 'circular provenance is not enlarged to fit');
  assert.equal(admitted.corners[1].rMin, minimumGuideRadius(10, 0.25, admitted.corners[1].mu));
  for (const knot of peak)
    if (Math.abs(knot.s - 100) <= trim)
      assert.ok(admitted.corners[1].mu * (1 - knot.lMax / admitted.corners[1].radius) >= 0.25);
});

test('fallback corners use conservative adjacent intervals followed by full-interval validation', () => {
  const raster = bend();
  const envelope = [
    { s: 0, lMax: 10 },
    { s: 99, lMax: 4 },
    { s: 101, lMax: 4 },
    { s: raster.length, lMax: 4 },
  ];
  const guide = compileGuidePath(raster, { envelope, mMin: 0.25 });
  const corner = guide.corners[1];
  assert.equal(corner.radius, minimumGuideRadius(10, 0.25, corner.mu));
  assert.ok(corner.rMin < corner.radius, 'construction bound and actual full-fillet minimum are distinct');
  assert.throws(
    () => compileGuidePath(raster, { lMax: 10000, mMin: 0.25 }),
    RangeError,
    'trims may not escape coverage',
  );
});

test('queries, translated clamps and gate widths use the local envelope', () => {
  const guide = compileGuidePath(straight(), {
    envelope: [
      { s: 0, lMax: 5 },
      { s: 50, lMax: 10 },
      { s: 100, lMax: 20 },
    ],
    mMin: 0.25,
  });
  const frame = { guide, lateralOrigin: 3 };
  for (const [s, limit] of [
    [0, 5],
    [25, 7.5],
    [50, 10],
    [75, 15],
    [100, 20],
  ]) {
    const world = guideCoordinateToWorld(frame, s, 30, createPlanarCoordinateSample());
    assert.equal(
      locateWorldOnGuideCoordinateGlobal(
        frame,
        world,
        false,
        { s: 0, l: 0, segmentIndex: -1, distanceSquared: 0 },
        createGuideProjectionWorkspace(),
      ).l,
      30,
    );
    assert.equal(
      locateWorldOnGuideCoordinateGlobal(
        frame,
        world,
        true,
        { s: 0, l: 0, segmentIndex: -1, distanceSquared: 0 },
        createGuideProjectionWorkspace(),
      ).l,
      limit - 3,
    );
    assert.equal(
      locateWorldOnGuideGlobal(
        guide,
        world,
        true,
        { s: 0, l: 0, segmentIndex: -1, distanceSquared: 0 },
        createGuideProjectionWorkspace(),
      ).l,
      limit,
    );
    assert.equal(compilePhysicalRaceGate(guide, 0, 'checkpoint', 'gate', s).halfWidth, limit);
  }
  assert.deepEqual(guideEnvelopeRange(guide.envelope, 25, 75), { min: 7.5, max: 15 });
  for (const s of [NaN, Infinity, -1, 101]) assert.throws(() => guideEnvelopeAt(guide.envelope, s), RangeError);
  assert.throws(() => guideEnvelopeRange(guide.envelope, 50, 25), RangeError);
});

test('envelope admission owns its data and rejects wrong shape, nonfinite and incomplete domains', () => {
  const input = [
    { s: 0, lMax: 4 },
    { s: 100, lMax: 8 },
  ];
  const guide = compileGuidePath(straight(), { envelope: input, mMin: 0.25 });
  input[0].lMax = 100;
  assert.equal(guideEnvelopeAt(guide.envelope, 0), 4);
  assert.ok(Object.isFrozen(guide.envelope));
  assert.throws(() => {
    guide.envelope[0].lMax = 100;
  }, TypeError);
  for (const value of [
    null,
    {},
    'bad',
    [
      { s: '0', lMax: 4 },
      { s: 100, lMax: 4 },
    ],
  ])
    assert.throws(() => compileGuideEnvelope(value, 100), TypeError);
  for (const value of [
    [],
    [{ s: 0, lMax: 4 }],
    [
      { s: 1, lMax: 4 },
      { s: 100, lMax: 4 },
    ],
    [
      { s: 0, lMax: 4 },
      { s: 101, lMax: 4 },
    ],
    [
      { s: 0, lMax: 4 },
      { s: 0, lMax: 4 },
      { s: 100, lMax: 4 },
    ],
    [
      { s: 0, lMax: 4 },
      { s: 100, lMax: NaN },
    ],
    [
      { s: 0, lMax: 4 },
      { s: 100, lMax: 0 },
    ],
  ])
    assert.throws(() => compileGuideEnvelope(value, 100), RangeError);
  assert.throws(() => compileGuidePath(straight(), { lMax: 4, envelope: input, mMin: 0.25 }), TypeError);
});
