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

/**
 * M5.8 debug-content baseline measured by the 70-frame compiler stress sweep.
 * This is evidence for the provisional target below, not a runtime threshold.
 */
export const M5_8_DEBUG_OBSERVED_BASELINE: Readonly<RenderWorkloadEnvelope> = {
  frameCount: 70,
  maxTerrainLineCount: 171,
  maxTerrainLineCountPerScreenRow: 9,
  maxTerrainOutputPixelsPerFrame: 54720,
  maxTerrainOutputPixelsPerScreenRow: 2880,
  maxVisibleSpriteCount: 17,
  maxSpriteOutputSamplesPerFrame: 18364,
  maxSpriteOutputSamplesPerScanline: 268,
  maxSpriteWrittenPixelsPerFrame: 12938,
  maxSpriteWrittenPixelsPerScanline: 268,
  maxGroundMapLevelUsed: 6,
  groundMapLevelLineCounts: [3437, 3436, 1755, 979, 546, 173, 18],
};

/**
 * Explicit current-debug-content margin. Tunnel/portal stress content is not present yet,
 * so this is deliberately provisional rather than the final hardware budget.
 */
export const M5_8_DEBUG_HEADROOM_FACTOR = 1.25;

/** Exactly ceil(M5_8_DEBUG_OBSERVED_BASELINE × 1.25) for each Core budget metric. */
export const M5_8_DEBUG_TARGET_BUDGET: Readonly<RenderTargetBudget> = {
  headroomFactor: M5_8_DEBUG_HEADROOM_FACTOR,
  terrainLineCountMax: 214,
  terrainLineCountPerScreenRowMax: 12,
  terrainOutputPixelsPerFrameMax: 68400,
  terrainOutputPixelsPerScreenRowMax: 3600,
  visibleSpriteCountMax: 22,
  spriteOutputSamplesPerFrameMax: 22955,
  spriteOutputSamplesPerScanlineMax: 335,
};

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
