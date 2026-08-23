import type { GroundMapDensityProfile } from './ground-map-lod.js';
import { diagnosticLateralLevel, requiredPyramidMaxLevel } from './ground-map-lod.js';
import type { M3TerrainLine } from '../road/terrain-line.js';

export interface TerrainFootprintSummary {
  readonly lineCount: number;
  readonly collapsedLineCount: number;
  readonly maxDeltaS: number;
  readonly maxDeltaSCollapse: number;
  readonly maxDeltaSEffective: number;
  readonly maxDeltaL: number;
  readonly requiredChainageLevel: number;
  readonly maxDiagnosticLateralLevel: number;
}

/** Compiler/telemetry reduction over actual TerrainLine records emitted by the Road Generator. */
export function summarizeTerrainFootprints(
  lines: readonly M3TerrainLine[],
  density: Pick<GroundMapDensityProfile, 'qL' | 'qS'>,
): TerrainFootprintSummary {
  if (!(density.qL > 0) || !Number.isFinite(density.qL)) throw new RangeError('qL must be finite and > 0');
  if (!(density.qS > 0) || !Number.isFinite(density.qS)) throw new RangeError('qS must be finite and > 0');

  let collapsedLineCount = 0;
  let maxDeltaS = 0;
  let maxDeltaSCollapse = 0;
  let maxDeltaSEffective = 0;
  let maxDeltaL = 0;

  for (const line of lines) {
    const fp = line.sourceFootprint;
    validateFootprint(fp.deltaS, 'deltaS');
    validateFootprint(fp.deltaSCollapse, 'deltaSCollapse');
    validateFootprint(fp.deltaSEffective, 'deltaSEffective');
    validateFootprint(fp.deltaL, 'deltaL', true);
    if (fp.deltaSEffective + 1e-12 < Math.max(fp.deltaS, fp.deltaSCollapse)) {
      throw new Error('TerrainLine deltaSEffective must cover ordinary and collapse footprints');
    }
    if (fp.collapsed) collapsedLineCount += 1;
    maxDeltaS = Math.max(maxDeltaS, fp.deltaS);
    maxDeltaSCollapse = Math.max(maxDeltaSCollapse, fp.deltaSCollapse);
    maxDeltaSEffective = Math.max(maxDeltaSEffective, fp.deltaSEffective);
    maxDeltaL = Math.max(maxDeltaL, fp.deltaL);
  }

  return {
    lineCount: lines.length,
    collapsedLineCount,
    maxDeltaS,
    maxDeltaSCollapse,
    maxDeltaSEffective,
    maxDeltaL,
    requiredChainageLevel: maxDeltaSEffective > 0 ? requiredPyramidMaxLevel(maxDeltaSEffective, density.qS) : 0,
    maxDiagnosticLateralLevel: maxDeltaL > 0 ? diagnosticLateralLevel(maxDeltaL, density.qL) : 0,
  };
}

function validateFootprint(value: number, name: string, strictlyPositive = false): void {
  if (!Number.isFinite(value) || value < 0 || (strictlyPositive && !(value > 0))) {
    throw new RangeError(`${name} must be ${strictlyPositive ? 'finite and > 0' : 'finite and >= 0'}`);
  }
}
