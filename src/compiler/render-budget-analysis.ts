import type { M5RenderResult } from '../render/m5-renderer.js';

export interface RenderBudgetObservation {
  readonly label: string;
  readonly result: M5RenderResult;
}

export interface RenderBudgetSummary {
  readonly frameCount: number;
  readonly maxTerrainLineCount: number;
  readonly maxTerrainLinesPerRow: number;
  readonly maxTerrainOutputPixelsPerFrame: number;
  readonly maxTerrainOutputPixelsPerRow: number;
  readonly maxVisibleSpriteCount: number;
  readonly maxWorldSpriteOutputSamplesPerFrame: number;
  readonly maxPlayerOutputSamplesPerFrame: number;
  readonly maxSpriteOutputSamplesPerScanline: number;
  readonly maxGroundMapLevel: number;
  readonly groundMapLevelLineCounts: readonly number[];
  readonly groundMapLevelOutputPixels: readonly number[];
  readonly worstTerrainLineFrame: string;
  readonly worstTerrainPixelFrame: string;
  readonly worstTerrainRowFrame: string;
  readonly worstSpriteCountFrame: string;
  readonly worstSpriteFrame: string;
  readonly worstSpriteScanlineFrame: string;
}

/**
 * M5.8 compiler/content telemetry reducer.
 *
 * This reports observed maxima only. It intentionally does not invent target
 * hardware budgets or runtime culling policy. Core §67 budgets are fixed only
 * after representative stress content exists.
 */
export function summarizeRenderBudgetObservations(
  observations: readonly RenderBudgetObservation[],
): RenderBudgetSummary {
  if (observations.length === 0) throw new Error('render budget analysis requires at least one observation');

  let maxTerrainLineCount = -1;
  let maxTerrainLinesPerRow = -1;
  let maxTerrainOutputPixelsPerFrame = -1;
  let maxTerrainOutputPixelsPerRow = -1;
  let maxVisibleSpriteCount = -1;
  let maxWorldSpriteOutputSamplesPerFrame = -1;
  let maxPlayerOutputSamplesPerFrame = -1;
  let maxSpriteOutputSamplesPerScanline = -1;
  let maxGroundMapLevel = 0;
  let worstTerrainLineFrame = '';
  let worstTerrainPixelFrame = '';
  let worstTerrainRowFrame = '';
  let worstSpriteCountFrame = '';
  let worstSpriteFrame = '';
  let worstSpriteScanlineFrame = '';
  const levelLineCounts: number[] = [];
  const levelOutputPixels: number[] = [];

  for (const observation of observations) {
    validateObservation(observation);
    const r = observation.result;

    if (r.terrainLineCount > maxTerrainLineCount) {
      maxTerrainLineCount = r.terrainLineCount;
      worstTerrainLineFrame = observation.label;
    }
    if (r.terrainLinesMaxPerRow > maxTerrainLinesPerRow) {
      maxTerrainLinesPerRow = r.terrainLinesMaxPerRow;
    }
    if (r.terrainOutputPixels > maxTerrainOutputPixelsPerFrame) {
      maxTerrainOutputPixelsPerFrame = r.terrainOutputPixels;
      worstTerrainPixelFrame = observation.label;
    }
    if (r.terrainOutputPixelsMaxPerRow > maxTerrainOutputPixelsPerRow) {
      maxTerrainOutputPixelsPerRow = r.terrainOutputPixelsMaxPerRow;
      worstTerrainRowFrame = observation.label;
    }
    if (r.visibleSpriteCount > maxVisibleSpriteCount) {
      maxVisibleSpriteCount = r.visibleSpriteCount;
      worstSpriteCountFrame = observation.label;
    }
    if (r.spriteOutputSamples > maxWorldSpriteOutputSamplesPerFrame) {
      maxWorldSpriteOutputSamplesPerFrame = r.spriteOutputSamples;
      worstSpriteFrame = observation.label;
    }
    if (r.playerOutputSamples > maxPlayerOutputSamplesPerFrame) {
      maxPlayerOutputSamplesPerFrame = r.playerOutputSamples;
    }
    if (r.spriteOutputSamplesMaxPerScanline > maxSpriteOutputSamplesPerScanline) {
      maxSpriteOutputSamplesPerScanline = r.spriteOutputSamplesMaxPerScanline;
      worstSpriteScanlineFrame = observation.label;
    }
    maxGroundMapLevel = Math.max(maxGroundMapLevel, r.groundMapMaxLevel);

    for (let k = 0; k < r.groundMapLevelLineCounts.length; k += 1) {
      levelLineCounts[k] = (levelLineCounts[k] ?? 0) + (r.groundMapLevelLineCounts[k] ?? 0);
    }
    for (let k = 0; k < r.groundMapLevelOutputPixels.length; k += 1) {
      levelOutputPixels[k] = (levelOutputPixels[k] ?? 0) + (r.groundMapLevelOutputPixels[k] ?? 0);
    }
  }

  return {
    frameCount: observations.length,
    maxTerrainLineCount,
    maxTerrainLinesPerRow,
    maxTerrainOutputPixelsPerFrame,
    maxTerrainOutputPixelsPerRow,
    maxVisibleSpriteCount,
    maxWorldSpriteOutputSamplesPerFrame,
    maxPlayerOutputSamplesPerFrame,
    maxSpriteOutputSamplesPerScanline,
    maxGroundMapLevel,
    groundMapLevelLineCounts: levelLineCounts,
    groundMapLevelOutputPixels: levelOutputPixels,
    worstTerrainLineFrame,
    worstTerrainPixelFrame,
    worstTerrainRowFrame,
    worstSpriteCountFrame,
    worstSpriteFrame,
    worstSpriteScanlineFrame,
  };
}

function validateObservation(observation: RenderBudgetObservation): void {
  if (!observation.label) throw new Error('render budget observation requires a label');
  const r = observation.result;
  for (const [name, value] of [
    ['terrainLineCount', r.terrainLineCount],
    ['terrainLinesMaxPerRow', r.terrainLinesMaxPerRow],
    ['terrainOutputPixels', r.terrainOutputPixels],
    ['terrainOutputPixelsMaxPerRow', r.terrainOutputPixelsMaxPerRow],
    ['visibleSpriteCount', r.visibleSpriteCount],
    ['spriteOutputSamples', r.spriteOutputSamples],
    ['playerOutputSamples', r.playerOutputSamples],
    ['spriteOutputSamplesMaxPerScanline', r.spriteOutputSamplesMaxPerScanline],
    ['groundMapMaxLevel', r.groundMapMaxLevel],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and >= 0`);
  }
  const lineSum = r.groundMapLevelLineCounts.reduce((sum, count) => sum + count, 0);
  if (lineSum !== r.terrainLineCount) {
    throw new Error('GroundMap level line-count histogram must sum to terrainLineCount');
  }
}
