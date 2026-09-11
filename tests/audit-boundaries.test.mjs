import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_CALIBRATION_KEYS,
  BROWSER_CAMERA_YAW_TOGGLE_CODE,
  BROWSER_COURSE_KEYS,
  BROWSER_RECOVERY_CODE,
  BROWSER_VEHICLE_KEYS,
} from '../dist/browser/key-bindings.js';
import { createBrowserVehicleProfileSelections } from '../dist/browser/vehicle-profile-selection.js';
import { compileRasterPath, MAX_RASTER_VERTEX_TURN_DEGREES } from '../dist/core/raster-path.js';
import { RasterTurtle } from '../dist/course/raster-turtle.js';
import { DRIVING_KEYS } from '../dist/input/keyboard-input.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

// Regression: looking ahead with s+epsilon skipped the next boundary while sample(s)
// still selected the preceding material. Arbitrarily narrow positive intervals are authored data.
test('visual boundary distance agrees with sampling on both sides of a sub-tolerance interval', () => {
  const base = { groundBaseLeft: { kind: 'transparent' }, groundBaseRight: { kind: 'transparent' } };
  const start = 30,
    end = start + 5e-10;
  const visual = new VisualProfile(100, [
    { ...base, sStart: 0, name: 'before' },
    { ...base, sStart: start, name: 'sliver' },
    { ...base, sStart: end, name: 'after' },
  ]);
  for (const s of [start - 2e-10, start, (start + end) / 2, end]) {
    const expected = s < start ? start : s < end ? end : 100;
    assert.equal(visual.distanceToNextSection(s), expected - s);
    assert.equal(visual.sample(s).name, s < start ? 'before' : s < end ? 'sliver' : 'after');
  }
});

test('shared turtle authors open finite Raster geometry below the compiler turn bound', () => {
  for (const sign of [-1, 1]) {
    const turtle = new RasterTurtle({ x: 7, z: -2 }, 0.3);
    turtle.appendStraight(110);
    turtle.appendArcDegrees(100, sign * 75);
    turtle.appendStraight(70);
    turtle.appendArc(150, (-sign * Math.PI) / 2);
    const raster = compileRasterPath(turtle.vertices);
    assert.ok(raster.vertexTurns.every((turn) => Math.abs(turn) <= (MAX_RASTER_VERTEX_TURN_DEGREES * Math.PI) / 180));
    assert.equal(raster.vertices.length, 1 + 3 + 15 + 2 + 18);
    assert.notDeepEqual(raster.vertices[0], raster.vertices.at(-1));
    assert.equal(turtle.arcCount, 2);
    assert.ok(Math.abs(turtle.chainage - raster.length) < 1e-9);
    assert.throws(() => turtle.appendArc(NaN, 1), /radius/);
    assert.throws(() => turtle.appendArc(100, 0), /turn/);
    assert.throws(() => turtle.appendStraight(-1), /length/);
  }
});

test('all driving, vehicle, course, camera and calibration shortcuts have unique owners', () => {
  const codes = [
    ...Object.values(DRIVING_KEYS),
    ...Object.values(BROWSER_VEHICLE_KEYS),
    ...Object.values(BROWSER_COURSE_KEYS).flatMap(Object.values),
    ...Object.values(BROWSER_CALIBRATION_KEYS),
    BROWSER_CAMERA_YAW_TOGGLE_CODE,
    BROWSER_RECOVERY_CODE,
  ];
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(Object.keys(BROWSER_VEHICLE_KEYS).sort(), VEHICLE_CATALOG.map((v) => v.profile.id).sort());
  for (const entry of VEHICLE_CATALOG) {
    assert.equal('keyCode' in entry, false);
    assert.equal('keyLabel' in entry, false);
  }
  // Content IDs are opaque strings, including Object.prototype names.
  const entry = { ...VEHICLE_CATALOG[0], profile: { ...VEHICLE_CATALOG[0].profile, id: 'toString' } };
  assert.equal(createBrowserVehicleProfileSelections([entry])[0].code, undefined);
});

// Regression: compilation discarded a 50 nm straight using its 100 nm tolerance,
// then the reader rejected the accepted gap using its 10 nm sampling tolerance.
test('compiled Guide coverage is sampleable across sub-compilation-tolerance joins', async () => {
  const { compileGuidePath, minimumGuideRadius, filletMetric, sampleGuidePath } =
    await import('../dist/core/guide-curve.js');
  const turn = (5 * Math.PI) / 180;
  const trim = minimumGuideRadius(1, 0.25, filletMetric(turn)) * Math.tan(turn / 2);
  for (const gap of [5e-8, 5e-9]) {
    const length = 2 * trim + gap;
    const v = [
      { x: 0, z: 0 },
      { x: 0, z: 10 },
    ];
    v.push({ x: Math.sin(turn) * length, z: 10 + Math.cos(turn) * length });
    v.push({ x: v[2].x + Math.sin(2 * turn) * 10, z: v[2].z + Math.cos(2 * turn) * 10 });
    const guide = compileGuidePath(compileRasterPath(v), { lMax: 1, mMin: 0.25 });
    for (const fraction of [0, 0.1, 0.5, 0.9, 1]) {
      const sample = sampleGuidePath(guide, 10 + trim + fraction * gap);
      assert.ok([sample.x, sample.z, sample.s, sample.heading].every(Number.isFinite));
      assert.ok(Math.abs(sample.heading - turn) < 1e-8);
    }
  }
});
