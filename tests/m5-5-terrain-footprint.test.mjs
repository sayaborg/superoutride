import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveGroundMapDensity } from '../dist/compiler/ground-map-lod.js';
import {
  CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  CURRENT_CAMERA_HEIGHT_METERS,
} from '../dist/camera/current-camera-profile.js';
import {
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from '../dist/core/presentation-scale.js';
import { summarizeTerrainFootprints } from '../dist/compiler/terrain-footprint-analysis.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM2Vehicle } from '../dist/dev/m2-vehicle.js';
import { computeM3Camera } from '../dist/dev/m3-camera.js';
import { computeTerrainRowDeltaS, generateTerrainLines } from '../dist/road/terrain-line.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM3DebugVisualProfile } from '../dist/dev/m3-debug-visual.js';

const deg = (value) => value * Math.PI / 180;
const near = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const visual = createM3DebugVisualProfile(guide.length);
const cameraHeight = CURRENT_CAMERA_HEIGHT_METERS;
const cameraProfile = {
  dCam: 5,
  lCamMax: 12,
  height: cameraHeight,
  pitch: CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  focalLength: 200,
  centerX: 160,
  centerY: 120,
};
const terrainProfile = {
  screenHeight: 240,
  dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
  dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  height,
  visual,
};
const density = deriveGroundMapDensity({
  d0: 5,
  focalLength: 200,
  cameraHeight,
  pitchRadians: CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
});

function linesAt(s, yawOffset = 0) {
  const vehicle = createM2Vehicle(guide, s);
  vehicle.yaw += yawOffset;
  const camera = computeM3Camera(guide, height, vehicle, cameraProfile);
  return generateTerrainLines(guide, camera, terrainProfile);
}

test('Core scanline Delta_s uses y pixel boundaries and visible-depth clipping', () => {
  // y(d) = a + b/d with a=0,b=100. Row 4 spans screen Y 4..5 => d 25..20.
  near(computeTerrainRowDeltaS(4, 0, 100, 2.5, 150), 5);
  // A pixel boundary exactly on the asymptote is clipped to dMax: top=150m, bottom=100m.
  near(computeTerrainRowDeltaS(0, 0, 100, 2.5, 150), 50);
});

test('actual M3 TerrainLines carry finite Core source-footprint telemetry without changing Painter output', () => {
  const lines = linesAt(20);
  assert.ok(lines.length > 100);
  for (const line of lines) {
    const fp = line.sourceFootprint;
    assert.ok(Number.isFinite(fp.deltaS) && fp.deltaS >= 0);
    assert.ok(Number.isFinite(fp.deltaSCollapse) && fp.deltaSCollapse >= 0);
    assert.ok(Number.isFinite(fp.deltaSEffective) && fp.deltaSEffective >= Math.max(fp.deltaS, fp.deltaSCollapse) - 1e-12);
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
    return !candidate.sourceFootprint.collapsed && candidate.d > 15 && candidate.d < 22 && Math.abs(sample.grade) < 1e-12;
  });
  assert.ok(line);
  const approximate = line.d ** 2 / (200 * cameraHeight * Math.cos(CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS));
  const relativeError = Math.abs(line.sourceFootprint.deltaS - approximate) / approximate;
  assert.ok(relativeError < 0.08, `relative error ${relativeError}`);
});

test('high camera yaw increases lateral diagnostic footprint without becoming shared-pyramid authority', () => {
  const straight = summarizeTerrainFootprints(linesAt(20, 0), density);
  const yawed = summarizeTerrainFootprints(linesAt(20, deg(75)), density);
  assert.ok(yawed.maxDeltaL > straight.maxDeltaL * 2);
  assert.ok(yawed.maxDiagnosticLateralLevel > straight.maxDiagnosticLateralLevel);
  assert.ok(Number.isInteger(yawed.requiredChainageLevel));
});

test('current debug-course sweep reports an observed footprint envelope from actual Road Generator output', () => {
  const allLines = [];
  const yawOffsets = [deg(-75), deg(-40), 0, deg(40), deg(75)];
  for (let s = 20; s < guide.length; s += 40) {
    for (const yawOffset of yawOffsets) allLines.push(...linesAt(s, yawOffset));
  }
  const summary = summarizeTerrainFootprints(allLines, density);
  assert.ok(summary.lineCount > 1000);
  assert.ok(summary.maxDeltaSEffective > 0);
  assert.ok(summary.maxDeltaL > 0);
  assert.ok(Number.isInteger(summary.requiredChainageLevel) && summary.requiredChainageLevel >= 0);
  assert.ok(Number.isInteger(summary.maxDiagnosticLateralLevel) && summary.maxDiagnosticLateralLevel >= 0);
  console.log('M5.5 OBSERVED DEBUG ENVELOPE', JSON.stringify(summary));
});
