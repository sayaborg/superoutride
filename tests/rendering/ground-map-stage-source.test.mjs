import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createBranchingGroundAuthoring } from '../../dist/dev/courses/branching-ground-authoring.js';
import { createGroundMapCompileSource } from '../../dist/groundmap/ground-map-compile-source.js';
import { sampleStageGroundMapAtLevel } from '../../dist/groundmap/stage-ground-map-view.js';
import { sampleGroundMap, GROUND_COLORS } from '../../dist/groundmap/ground-map.js';
import { BakedGroundMapAsset } from '../../dist/groundmap/baked-ground-map.js';
import { downsampleGroundMap2x4 } from '../../dist/groundmap/ground-map-prefilter.js';
import { rgbaToRgb555, rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { LATERAL_BOUNDARY_TOLERANCE_METERS } from '../../dist/core/tolerances.js';

const authoring = createBranchingGroundAuthoring();
const epsilon = LATERAL_BOUNDARY_TOLERANCE_METERS * 4;
function rendered(runtime, s, l) {
  return runtime.roadView
    ? sampleStageGroundMapAtLevel(s, l, 0, runtime.roadView, runtime.groundProfile)
    : sampleGroundMap(s, l, runtime.groundProfile);
}
function sourceFor(runtime) {
  return createGroundMapCompileSource(runtime.heightProfile.courseLength, runtime.groundProfile, runtime.roadView);
}

for (const { id, runtime } of authoring.stages) {
  test(`${id}: compiler input retains edges, fork phases and handoff overlap in local coordinates`, () => {
    const source = sourceFor(runtime);
    const view = runtime.roadView;
    const profile = runtime.groundProfile;
    assert.equal(source.courseLength, runtime.heightProfile.courseLength);
    assert.equal(source.groundLeft, (view ?? profile).groundLeft);
    assert.equal(source.groundRight, (view ?? profile).groundRight);
    const road = (view ?? profile).road;
    const sValues = [0, source.courseLength, source.courseLength / 2];
    const junction = profile.stageJunction ?? profile.junction;
    if (junction) {
      const a = junction.authoring;
      const offset = profile.stageJunction ? 0 : (profile.chainageOffsetS ?? 0);
      for (const s of [a.sWidenStart, a.sMedianStart, a.sSeparatedStart])
        sValues.push(s - offset - epsilon, s - offset, s - offset + epsilon);
    }
    for (const transition of authoring.transitions) {
      const seam =
        transition.fromStageId === id
          ? transition.handoff.sourceSeamS
          : transition.toStageId === id
            ? transition.handoff.targetSeamS
            : null;
      if (seam !== null) sValues.push(seam - epsilon, seam, seam + epsilon);
    }
    for (const s of sValues.filter((s) => s >= 0 && s <= source.courseLength)) {
      const edges = [
        -source.groundLeft,
        source.groundRight,
        0,
        -road.roadLeft,
        road.roadRight,
        -road.roadLeft - road.shoulderWidth,
        road.roadRight + road.shoulderWidth,
      ];
      if (junction) {
        const section = junction.sample(s + (profile.stageJunction ? 0 : (profile.chainageOffsetS ?? 0)));
        const origin = profile.stageJunction ? 0 : (view?.sourceLateralOrigin ?? 0);
        for (const band of [...section.asphaltBands, ...section.shoulderBands])
          edges.push(band.min - origin, band.max - origin);
      }
      for (const edge of edges)
        for (const delta of [-epsilon, 0, epsilon]) {
          const l = edge + delta;
          if (l < -source.groundLeft || l > source.groundRight) continue;
          assert.equal(source.sample(s, l), rendered(runtime, s, l), `${id} s=${s} l=${l}`);
        }
    }
  });

  test(`${id}: complete baked L0 and filtered levels match stage paint, including storage boundaries`, async () => {
    const metadata = JSON.parse(
      await readFile(new URL(`../../.test-assets/${id}-ground-map.json`, import.meta.url), 'utf8'),
    );
    const bytes = await readFile(new URL(`../../.test-assets/${id}-ground-map.bin`, import.meta.url));
    const reader = new BakedGroundMapAsset(metadata, bytes);
    const source = sourceFor(runtime);
    assert.equal(metadata.courseLength, source.courseLength, 'never trim at a gate or seam');
    assert.equal(metadata.groundLeft, source.groundLeft);
    assert.equal(metadata.groundRight, source.groundRight);
    let reference = {
      lateralTexels: metadata.levels[0].lateralTexels,
      chainageTexels: metadata.levels[0].chainageTexels,
      pixels: new Uint32Array(metadata.levels[0].lateralTexels * metadata.levels[0].chainageTexels),
    };
    let omittedPaintDifferences = 0;
    for (let row = 0; row < reference.chainageTexels; row++)
      for (let col = 0; col < reference.lateralTexels; col++) {
        const { s, l } = reader.texelCenter(0, row, col);
        const expected = rendered(runtime, s, l);
        reference.pixels[row * reference.lateralTexels + col] = expected;
        if (
          runtime.roadView &&
          expected !== sampleGroundMap(s, l + runtime.roadView.sourceLateralOrigin, runtime.groundProfile)
        )
          omittedPaintDifferences++;
      }
    if (runtime.groundProfile.stageJunction)
      assert.ok(omittedPaintDifferences > 0, 'later fork cannot be baked as a translated parent crop');
    for (let k = 0; k <= metadata.kMax; k++) {
      for (let row = 0; row < reference.chainageTexels; row++)
        for (let col = 0; col < reference.lateralTexels; col++) {
          const { s, l } = reader.texelCenter(k, row, col);
          const color = reference.pixels[row * reference.lateralTexels + col];
          const expected = metadata.levels[k].format === 'palette8' ? color : rgb555ToRgba(rgbaToRgb555(color));
          assert.equal(reader.sampleAtLevel(s, l, k), expected);
        }
      // Finite endpoint lookup uses the final texel, without source rebasing or a shoulder overlay.
      const last = reader.texelCenter(k, reference.chainageTexels - 1, reference.lateralTexels - 1);
      assert.equal(
        reader.sampleAtLevel(source.courseLength, source.groundRight, k),
        reader.sampleAtLevel(last.s, last.l, k),
      );
      if (k < metadata.kMax) reference = downsampleGroundMap2x4(reference);
    }
  });
}

test('stage source applies chainage phase once and owns the newly exposed inner shoulder', () => {
  const runtime = authoring.stages.find(({ id }) => id === 'STAGE_2_L').runtime;
  const view = runtime.roadView;
  assert.notEqual(view.sourceLateralOrigin, 0);
  assert.notEqual(runtime.groundProfile.chainageOffsetS, 0);
  const source = sourceFor(runtime);
  const l = view.road.roadRight + view.road.shoulderWidth / 2;
  assert.equal(source.sample(0, l), GROUND_COLORS.shoulder);
  // The shipped child already authors matching shoulders. Reusing the parent junction is the
  // causal fixture for the adapter's exposed median-facing shoulder override.
  const parentPaint = {
    ...authoring.stages[0].runtime.groundProfile,
    chainageOffsetS: runtime.groundProfile.chainageOffsetS,
  };
  const inherited = createGroundMapCompileSource(source.courseLength, parentPaint, view);
  assert.equal(inherited.sample(0, l), GROUND_COLORS.shoulder);
  assert.notEqual(sampleGroundMap(0, l + view.sourceLateralOrigin, parentPaint), GROUND_COLORS.shoulder);
  let doublePhaseDifferences = 0;
  for (let s = 0; s < 20; s += 0.125) {
    const expected = sampleGroundMap(s, view.sourceLateralOrigin, runtime.groundProfile);
    assert.equal(source.sample(s, 0), expected);
    if (
      expected !==
      sampleGroundMap(s + runtime.groundProfile.chainageOffsetS, view.sourceLateralOrigin, runtime.groundProfile)
    )
      doublePhaseDifferences++;
  }
  assert.ok(doublePhaseDifferences > 0, 'fixture detects a second chainage shift');
});

test('source bounds reject invalid access and already baked inputs; absent logical retains grass fallback', () => {
  const profile = { groundLeft: 5, groundRight: 6, road: { roadLeft: 2, roadRight: 2, shoulderWidth: 1 } };
  const source = createGroundMapCompileSource(10, profile);
  for (const [s, l] of [
    [0, -5],
    [10, 6],
    [3.5, 4],
  ])
    assert.equal(source.sample(s, l), sampleGroundMap(s, l, profile));
  for (const [s, l] of [
    [-epsilon, 0],
    [10 + epsilon, 0],
    [0, -5 - epsilon],
    [0, 6 + epsilon],
    [NaN, 0],
    [0, Infinity],
  ])
    assert.throws(() => source.sample(s, l), RangeError);
  assert.throws(() => createGroundMapCompileSource(0, profile), RangeError);
  assert.throws(() => createGroundMapCompileSource(10, { ...profile, baked: {} }), /source paint/);
  assert.equal(authoring.stages.length, 11);
  assert.equal(authoring.transitions.length, 10);
});
