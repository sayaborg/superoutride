import type { M5RenderResult } from '../render/m5-renderer.js';

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

export interface RenderTargetBudget {
  readonly headroomFactor: number;
  readonly terrainLineCountMax: number;
  readonly terrainLineCountPerScreenRowMax: number;
  readonly terrainOutputPixelsPerFrameMax: number;
  readonly terrainOutputPixelsPerScreenRowMax: number;
  readonly visibleSpriteCountMax: number;
  readonly spriteOutputSamplesPerFrameMax: number;
  readonly spriteOutputSamplesPerScanlineMax: number;
}

export interface RenderBudgetViolation {
  readonly metric: keyof Omit<RenderTargetBudget, 'headroomFactor'>;
  readonly observed: number;
  readonly limit: number;
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
    validateNonNegativeInteger(sample.terrainLineCount, 'terrainLineCount');
    validateNonNegativeInteger(sample.terrainLineCountPerScreenRowMax, 'terrainLineCountPerScreenRowMax');
    validateNonNegativeInteger(sample.terrainOutputPixels, 'terrainOutputPixels');
    validateNonNegativeInteger(sample.terrainOutputPixelsPerScreenRowMax, 'terrainOutputPixelsPerScreenRowMax');
    validateNonNegativeInteger(sample.visibleSpriteCount, 'visibleSpriteCount');
    validateNonNegativeInteger(sample.spriteOutputSamplesIncludingPlayer, 'spriteOutputSamplesIncludingPlayer');
    validateNonNegativeInteger(sample.spriteOutputSamplesPerScanlineMax, 'spriteOutputSamplesPerScanlineMax');
    validateNonNegativeInteger(sample.spriteWrittenPixelsIncludingPlayer, 'spriteWrittenPixelsIncludingPlayer');
    validateNonNegativeInteger(sample.spriteWrittenPixelsPerScanlineMax, 'spriteWrittenPixelsPerScanlineMax');
    validateNonNegativeInteger(sample.groundMapMaxLevel, 'groundMapMaxLevel');

    maxTerrainLineCount = Math.max(maxTerrainLineCount, sample.terrainLineCount);
    maxTerrainLineCountPerScreenRow = Math.max(maxTerrainLineCountPerScreenRow, sample.terrainLineCountPerScreenRowMax);
    maxTerrainOutputPixelsPerFrame = Math.max(maxTerrainOutputPixelsPerFrame, sample.terrainOutputPixels);
    maxTerrainOutputPixelsPerScreenRow = Math.max(maxTerrainOutputPixelsPerScreenRow, sample.terrainOutputPixelsPerScreenRowMax);
    maxVisibleSpriteCount = Math.max(maxVisibleSpriteCount, sample.visibleSpriteCount);
    maxSpriteOutputSamplesPerFrame = Math.max(maxSpriteOutputSamplesPerFrame, sample.spriteOutputSamplesIncludingPlayer);
    maxSpriteOutputSamplesPerScanline = Math.max(maxSpriteOutputSamplesPerScanline, sample.spriteOutputSamplesPerScanlineMax);
    maxSpriteWrittenPixelsPerFrame = Math.max(maxSpriteWrittenPixelsPerFrame, sample.spriteWrittenPixelsIncludingPlayer);
    maxSpriteWrittenPixelsPerScanline = Math.max(maxSpriteWrittenPixelsPerScanline, sample.spriteWrittenPixelsPerScanlineMax);
    maxGroundMapLevelUsed = Math.max(maxGroundMapLevelUsed, sample.groundMapMaxLevel);

    for (let k = 0; k < sample.groundMapLevelHistogram.length; k += 1) {
      const count = sample.groundMapLevelHistogram[k] ?? 0;
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

/**
 * Converts an observed stress envelope into an explicit provisional content budget.
 * This is intentionally mechanical: all policy is visible in one headroom factor.
 */
export function deriveProvisionalRenderBudget(
  observed: RenderWorkloadEnvelope,
  headroomFactor: number,
): RenderTargetBudget {
  if (!(headroomFactor >= 1) || !Number.isFinite(headroomFactor)) {
    throw new RangeError('headroomFactor must be finite and >= 1');
  }
  return {
    headroomFactor,
    terrainLineCountMax: withHeadroom(observed.maxTerrainLineCount, headroomFactor),
    terrainLineCountPerScreenRowMax: withHeadroom(observed.maxTerrainLineCountPerScreenRow, headroomFactor),
    terrainOutputPixelsPerFrameMax: withHeadroom(observed.maxTerrainOutputPixelsPerFrame, headroomFactor),
    terrainOutputPixelsPerScreenRowMax: withHeadroom(observed.maxTerrainOutputPixelsPerScreenRow, headroomFactor),
    visibleSpriteCountMax: withHeadroom(observed.maxVisibleSpriteCount, headroomFactor),
    spriteOutputSamplesPerFrameMax: withHeadroom(observed.maxSpriteOutputSamplesPerFrame, headroomFactor),
    spriteOutputSamplesPerScanlineMax: withHeadroom(observed.maxSpriteOutputSamplesPerScanline, headroomFactor),
  };
}

export function validateRenderWorkload(
  observed: RenderWorkloadEnvelope,
  budget: RenderTargetBudget,
): RenderBudgetViolation[] {
  const pairs: readonly [RenderBudgetViolation['metric'], number, number][] = [
    ['terrainLineCountMax', observed.maxTerrainLineCount, budget.terrainLineCountMax],
    ['terrainLineCountPerScreenRowMax', observed.maxTerrainLineCountPerScreenRow, budget.terrainLineCountPerScreenRowMax],
    ['terrainOutputPixelsPerFrameMax', observed.maxTerrainOutputPixelsPerFrame, budget.terrainOutputPixelsPerFrameMax],
    ['terrainOutputPixelsPerScreenRowMax', observed.maxTerrainOutputPixelsPerScreenRow, budget.terrainOutputPixelsPerScreenRowMax],
    ['visibleSpriteCountMax', observed.maxVisibleSpriteCount, budget.visibleSpriteCountMax],
    ['spriteOutputSamplesPerFrameMax', observed.maxSpriteOutputSamplesPerFrame, budget.spriteOutputSamplesPerFrameMax],
    ['spriteOutputSamplesPerScanlineMax', observed.maxSpriteOutputSamplesPerScanline, budget.spriteOutputSamplesPerScanlineMax],
  ];
  const violations: RenderBudgetViolation[] = [];
  for (const [metric, value, limit] of pairs) {
    if (value > limit) violations.push({ metric, observed: value, limit });
  }
  return violations;
}

function withHeadroom(value: number, factor: number): number {
  validateNonNegativeInteger(value, 'observed budget metric');
  return Math.ceil(value * factor);
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
}
