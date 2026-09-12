import { createFootprintScene } from './helpers/stadium-scene.mjs';
import { deg } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveGroundMapTargetEnvelope,
  validateTerrainFootprintsAgainstTarget,
} from '../dist/groundmap/ground-map-target-envelope.js';
import { summarizeTerrainFootprints } from '../dist/groundmap/terrain-footprint-analysis.js';
import { DEFAULT_THIN_SPAN_SCREEN_ROWS, projectedTerrainSpanRows } from '../dist/road/terrain-line.js';

const { guide, terrainProfile, density, linesAt } = createFootprintScene({
  thinSpanScreenRows: DEFAULT_THIN_SPAN_SCREEN_ROWS,
});

function sweepCurrentDebugEnvelope() {
  const lines = [];
  const yawOffsets = [deg(-75), deg(-40), 0, deg(40), deg(75)];
  for (let s = 20; s < guide.length; s += 20) {
    for (const yawOffset of yawOffsets) lines.push(...linesAt(s, yawOffset));
  }
  return summarizeTerrainFootprints(lines, density);
}

test('thin-span rule is explicitly one destination row', () => {
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
  console.log('TARGET KMAX', JSON.stringify({ summary, target }));
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
