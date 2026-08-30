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
import {
  deriveGroundMapTargetEnvelope,
  validateTerrainFootprintsAgainstTarget,
} from '../dist/compiler/ground-map-target-envelope.js';
import { summarizeTerrainFootprints } from '../dist/compiler/terrain-footprint-analysis.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM2Vehicle } from '../dist/dev/m2-vehicle.js';
import { computeM3Camera } from '../dist/dev/m3-camera.js';
import {
  DEFAULT_THIN_SPAN_SCREEN_ROWS,
  generateTerrainLines,
  projectedTerrainSpanRows,
} from '../dist/road/terrain-line.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';
import { createM3DebugVisualProfile } from '../dist/dev/m3-debug-visual.js';

const deg = (value) => value * Math.PI / 180;
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
  thinSpanScreenRows: DEFAULT_THIN_SPAN_SCREEN_ROWS,
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

function sweepCurrentDebugEnvelope() {
  const lines = [];
  const yawOffsets = [deg(-75), deg(-40), 0, deg(40), deg(75)];
  for (let s = 20; s < guide.length; s += 20) {
    for (const yawOffset of yawOffsets) lines.push(...linesAt(s, yawOffset));
  }
  return summarizeTerrainFootprints(lines, density);
}

test('M5.6 thin-span rule is explicitly one destination row', () => {
  assert.equal(DEFAULT_THIN_SPAN_SCREEN_ROWS, 1);
  assert.ok(projectedTerrainSpanRows(100, 20, 21) < 1);
  assert.ok(projectedTerrainSpanRows(100, 20, 40) > 1);
});

test('Road Generator emits explicit Core §64 collapsed TerrainLines within the current course envelope', () => {
  const collapsed = [];
  for (let s = 20; s < guide.length && collapsed.length === 0; s += 20) {
    collapsed.push(...linesAt(s).filter((line) => line.sourceFootprint.collapsed));
  }
  assert.ok(collapsed.length > 0);
  for (const line of collapsed) {
    assert.ok(line.sourceFootprint.deltaSCollapse > 0);
    assert.ok(line.sourceFootprint.deltaSEffective >= line.sourceFootprint.deltaSCollapse);
  }
});

test('depth clipping gives an absolute Delta_s_eff upper bound of dMax-dMin', () => {
  const target = deriveGroundMapTargetEnvelope({
    dMin: terrainProfile.dMin,
    dMax: terrainProfile.dMax,
    qS: density.qS,
    thinSpanScreenRows: terrainProfile.thinSpanScreenRows,
  });
  assert.equal(target.maxDeltaSEffectiveUpperBound, 197.5);
  assert.equal(target.kMax, 7);
  assert.ok(target.previousLevelCapacity < target.maxDeltaSEffectiveUpperBound);
  assert.ok(target.kMaxCapacity >= target.maxDeltaSEffectiveUpperBound);
  assert.equal(target.sufficiencyProven, true);
});

test('current debug Road Generator output requires k=7 after explicit thin-span collapse', () => {
  const summary = sweepCurrentDebugEnvelope();
  const target = deriveGroundMapTargetEnvelope({
    dMin: terrainProfile.dMin,
    dMax: terrainProfile.dMax,
    qS: density.qS,
    thinSpanScreenRows: terrainProfile.thinSpanScreenRows,
    observedMaxDeltaSEffective: summary.maxDeltaSEffective,
  });
  validateTerrainFootprintsAgainstTarget(summary, target);
  assert.ok(summary.collapsedLineCount > 0);
  assert.equal(summary.requiredChainageLevel, 7);
  assert.equal(target.observedRequiredLevel, 7);
  assert.equal(target.necessityProven, true);
  console.log('M5.6 TARGET KMAX', JSON.stringify({ summary, target }));
});

test('compiled target rejects impossible telemetry above the depth-clip proof bound', () => {
  const target = deriveGroundMapTargetEnvelope({
    dMin: terrainProfile.dMin,
    dMax: terrainProfile.dMax,
    qS: density.qS,
    thinSpanScreenRows: terrainProfile.thinSpanScreenRows,
  });
  const impossible = {
    lineCount: 1,
    collapsedLineCount: 0,
    maxDeltaS: 198,
    maxDeltaSCollapse: 0,
    maxDeltaSEffective: 198,
    maxDeltaL: 1,
    requiredChainageLevel: 7,
    maxDiagnosticLateralLevel: 1,
  };
  assert.throws(() => validateTerrainFootprintsAgainstTarget(impossible, target), /exceeds compiled target envelope/);
});
