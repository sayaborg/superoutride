import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveGroundMapDensity } from '../dist/compiler/ground-map-lod.js';
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
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM3DebugVisualProfile } from '../dist/dev/m3-debug-visual.js';

const deg = (value) => value * Math.PI / 180;
const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const visual = createM3DebugVisualProfile(guide.length);
const cameraHeight = 2.469902425419539;
const cameraProfile = {
  dCam: 5,
  lCamMax: 12,
  height: cameraHeight,
  pitch: deg(8),
  focalLength: 200,
  centerX: 160,
  centerY: 120,
};
const terrainProfile = {
  screenHeight: 240,
  dMin: 2.5,
  dMax: 150,
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
  pitchRadians: deg(8),
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
  assert.equal(target.maxDeltaSEffectiveUpperBound, 147.5);
  assert.equal(target.kMax, 6);
  assert.ok(target.previousLevelCapacity < target.maxDeltaSEffectiveUpperBound);
  assert.ok(target.kMaxCapacity >= target.maxDeltaSEffectiveUpperBound);
  assert.equal(target.sufficiencyProven, true);
});

test('current debug Road Generator output still requires k=6 after explicit thin-span collapse', () => {
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
  assert.equal(summary.requiredChainageLevel, 6);
  assert.equal(target.observedRequiredLevel, 6);
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
    maxDeltaS: 148,
    maxDeltaSCollapse: 0,
    maxDeltaSEffective: 148,
    maxDeltaL: 1,
    requiredChainageLevel: 6,
    maxDiagnosticLateralLevel: 1,
  };
  assert.throws(() => validateTerrainFootprintsAgainstTarget(impossible, target), /exceeds compiled target envelope/);
});
