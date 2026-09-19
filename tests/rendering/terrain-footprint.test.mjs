import { createFootprintScene } from '../helpers/stadium-scene.mjs';
import { near } from '../helpers/assert.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS } from '../../dist/camera/current-camera-profile.js';

import { computeTerrainRowDeltaS } from '../../dist/terrain/terrain-line.js';

const { height, cameraProfile, linesAt } = createFootprintScene();

test('Core scanline Delta_s uses y pixel boundaries and visible-depth clipping', () => {
  // y(d) = a + b/d with a=0,b=100. Row 4 spans screen Y 4..5 => d 25..20.
  near(computeTerrainRowDeltaS(4, 0, 100, 2.5, 150), 5, 1e-9);
  // A pixel boundary exactly on the asymptote is clipped to dMax: top=150m, bottom=100m.
  near(computeTerrainRowDeltaS(0, 0, 100, 2.5, 150), 50, 1e-9);
});

test('actual TerrainLines carry finite Core source-footprint telemetry without changing Painter output', () => {
  const lines = linesAt(20);
  assert.ok(lines.length > 100);
  for (const line of lines) {
    const fp = line.sourceFootprint;
    assert.ok(Number.isFinite(fp.deltaS) && fp.deltaS >= 0);
    assert.ok(Number.isFinite(fp.deltaSCollapse) && fp.deltaSCollapse >= 0);
    assert.ok(
      Number.isFinite(fp.deltaSEffective) && fp.deltaSEffective >= Math.max(fp.deltaS, fp.deltaSCollapse) - 1e-12,
    );
    assert.ok(Number.isFinite(fp.deltaL) && fp.deltaL > 0);
    if (!fp.collapsed) assert.equal(fp.deltaSCollapse, 0);
  }
  for (let i = 1; i < lines.length; i += 1) assert.ok(lines[i].d <= lines[i - 1].d + 1e-9);
});

test('TerrainLine Delta_l is the exact one-pixel footprint of the existing horizontal affine mapping', () => {
  const lines = linesAt(20);
  const line = lines.find((candidate) => candidate.d > 15 && candidate.d < 30);
  assert.ok(line);
  near(line.sourceFootprint.deltaL, 24 / (line.xGroundR - line.xGroundL), 1e-12);
});

test('flat-road ordinary Delta_s agrees with the Core d^2/(f h cosPhi) baseline', () => {
  const lines = linesAt(20);
  const line = lines.find((candidate) => {
    const sample = height.sampleRender(candidate.s);
    return (
      !candidate.sourceFootprint.collapsed && candidate.d > 15 && candidate.d < 22 && Math.abs(sample.grade) < 1e-12
    );
  });
  assert.ok(line);
  const approximate = line.d ** 2 / (200 * cameraProfile.height * Math.cos(CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS));
  const relativeError = Math.abs(line.sourceFootprint.deltaS - approximate) / approximate;
  assert.ok(relativeError < 0.08, `relative error ${relativeError}`);
});
