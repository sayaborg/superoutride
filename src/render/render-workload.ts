import type { M5RenderResult } from './m5-renderer.js';

export interface RenderWorkloadEnvelope {
  readonly frameCount: number;
  readonly maxTerrainLineCount: number;
  readonly maxTerrainLineCountPerScreenRow: number;
  readonly maxTerrainOutputPixelsPerFrame: number;
  readonly maxTerrainOutputPixelsPerScreenRow: number;
  readonly maxVisibleSpriteCount: number;
  readonly maxSpriteOutputSamplesPerFrame: number;
  readonly maxSpriteOutputSamplesPerScanline: number;
  readonly maxSpriteWrittenPixelsPerFrame: number;
  readonly maxSpriteWrittenPixelsPerScanline: number;
  readonly maxGroundMapLevelUsed: number;
  readonly groundMapLevelLineCounts: readonly number[];
}

/** Pure compiler/content telemetry reduction. It never changes runtime rendering. */
export function summarizeRenderWorkloads(samples: readonly M5RenderResult[]): RenderWorkloadEnvelope {
  let maxTerrainLineCount = 0;
  let maxTerrainLineCountPerScreenRow = 0;
  let maxTerrainOutputPixelsPerFrame = 0;
  let maxTerrainOutputPixelsPerScreenRow = 0;
  let maxVisibleSpriteCount = 0;
  let maxSpriteOutputSamplesPerFrame = 0;
  let maxSpriteOutputSamplesPerScanline = 0;
  let maxSpriteWrittenPixelsPerFrame = 0;
  let maxSpriteWrittenPixelsPerScanline = 0;
  let maxGroundMapLevelUsed = 0;
  const groundMapLevelLineCounts: number[] = [];

  for (const sample of samples) {
    if (!sample.workload) throw new TypeError('render workload observation must be explicitly enabled');
    const workload = sample.workload;
    validateNonNegativeInteger(sample.terrainLineCount, 'terrainLineCount');
    validateNonNegativeInteger(workload.terrainLineCountPerScreenRowMax, 'terrainLineCountPerScreenRowMax');
    validateNonNegativeInteger(sample.terrainOutputPixels, 'terrainOutputPixels');
    validateNonNegativeInteger(workload.terrainOutputPixelsPerScreenRowMax, 'terrainOutputPixelsPerScreenRowMax');
    validateNonNegativeInteger(sample.visibleSpriteCount, 'visibleSpriteCount');
    validateNonNegativeInteger(sample.spriteOutputSamplesIncludingPlayer, 'spriteOutputSamplesIncludingPlayer');
    validateNonNegativeInteger(workload.spriteOutputSamplesPerScanlineMax, 'spriteOutputSamplesPerScanlineMax');
    validateNonNegativeInteger(sample.spriteWrittenPixelsIncludingPlayer, 'spriteWrittenPixelsIncludingPlayer');
    validateNonNegativeInteger(workload.spriteWrittenPixelsPerScanlineMax, 'spriteWrittenPixelsPerScanlineMax');
    validateNonNegativeInteger(sample.groundMapMaxLevel, 'groundMapMaxLevel');

    maxTerrainLineCount = Math.max(maxTerrainLineCount, sample.terrainLineCount);
    maxTerrainLineCountPerScreenRow = Math.max(maxTerrainLineCountPerScreenRow, workload.terrainLineCountPerScreenRowMax);
    maxTerrainOutputPixelsPerFrame = Math.max(maxTerrainOutputPixelsPerFrame, sample.terrainOutputPixels);
    maxTerrainOutputPixelsPerScreenRow = Math.max(maxTerrainOutputPixelsPerScreenRow, workload.terrainOutputPixelsPerScreenRowMax);
    maxVisibleSpriteCount = Math.max(maxVisibleSpriteCount, sample.visibleSpriteCount);
    maxSpriteOutputSamplesPerFrame = Math.max(maxSpriteOutputSamplesPerFrame, sample.spriteOutputSamplesIncludingPlayer);
    maxSpriteOutputSamplesPerScanline = Math.max(maxSpriteOutputSamplesPerScanline, workload.spriteOutputSamplesPerScanlineMax);
    maxSpriteWrittenPixelsPerFrame = Math.max(maxSpriteWrittenPixelsPerFrame, sample.spriteWrittenPixelsIncludingPlayer);
    maxSpriteWrittenPixelsPerScanline = Math.max(maxSpriteWrittenPixelsPerScanline, workload.spriteWrittenPixelsPerScanlineMax);
    maxGroundMapLevelUsed = Math.max(maxGroundMapLevelUsed, sample.groundMapMaxLevel);

    for (let k = 0; k < workload.groundMapLevelHistogram.length; k += 1) {
      const count = workload.groundMapLevelHistogram[k] ?? 0;
      validateNonNegativeInteger(count, `groundMapLevelHistogram[${k}]`);
      groundMapLevelLineCounts[k] = (groundMapLevelLineCounts[k] ?? 0) + count;
    }
  }

  return {
    frameCount: samples.length,
    maxTerrainLineCount,
    maxTerrainLineCountPerScreenRow,
    maxTerrainOutputPixelsPerFrame,
    maxTerrainOutputPixelsPerScreenRow,
    maxVisibleSpriteCount,
    maxSpriteOutputSamplesPerFrame,
    maxSpriteOutputSamplesPerScanline,
    maxSpriteWrittenPixelsPerFrame,
    maxSpriteWrittenPixelsPerScanline,
    maxGroundMapLevelUsed,
    groundMapLevelLineCounts,
  };
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
}
