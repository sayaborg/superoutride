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

/** M5.8 normal/debug content baseline before the required tunnel/portal stress case existed. */
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

export const M5_8_DEBUG_HEADROOM_FACTOR = 1.25;

/** Historical M5.8 provisional budget, retained to prove the tunnel is a stronger sprite stress case. */
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

/** M5.9 required close portal / near interior stress sweep, re-observed after raster miter joins. */
export const M5_9_TUNNEL_STRESS_BASELINE: Readonly<RenderWorkloadEnvelope> = {
  frameCount: 51,
  maxTerrainLineCount: 160,
  maxTerrainLineCountPerScreenRow: 6,
  maxTerrainOutputPixelsPerFrame: 51200,
  maxTerrainOutputPixelsPerScreenRow: 1920,
  maxVisibleSpriteCount: 13,
  maxSpriteOutputSamplesPerFrame: 83655,
  maxSpriteOutputSamplesPerScanline: 605,
  maxSpriteWrittenPixelsPerFrame: 33013,
  maxSpriteWrittenPixelsPerScanline: 277,
  maxGroundMapLevelUsed: 6,
  groundMapLevelLineCounts: [2592, 2436, 1110, 506, 619, 112, 20],
};

/** Combined evidence envelope: maxima across M5.8 normal content and M5.9 tunnel stress. */
export const M5_9_COMBINED_OBSERVED_BASELINE: Readonly<RenderWorkloadEnvelope> = combineRenderWorkloadEnvelopes(
  M5_8_DEBUG_OBSERVED_BASELINE,
  M5_9_TUNNEL_STRESS_BASELINE,
);

/** The same single explicit margin used in M5.8. */
export const M5_9_TARGET_HEADROOM_FACTOR = 1.25;

/**
 * Current M5.x content-validation target including the Core-required tunnel/portal stress case.
 * It is not a CPU-cycle proof for any named historical machine; it is the explicit renderer-work budget.
 */
export const M5_9_TARGET_BUDGET: Readonly<RenderTargetBudget> = deriveProvisionalRenderBudget(
  M5_9_COMBINED_OBSERVED_BASELINE,
  M5_9_TARGET_HEADROOM_FACTOR,
);

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

/** Combine independent stress suites without pretending their maxima occurred in one frame. */
export function combineRenderWorkloadEnvelopes(
  ...envelopes: readonly RenderWorkloadEnvelope[]
): RenderWorkloadEnvelope {
  let frameCount = 0;
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

  for (const observed of envelopes) {
    frameCount += observed.frameCount;
    maxTerrainLineCount = Math.max(maxTerrainLineCount, observed.maxTerrainLineCount);
    maxTerrainLineCountPerScreenRow = Math.max(maxTerrainLineCountPerScreenRow, observed.maxTerrainLineCountPerScreenRow);
    maxTerrainOutputPixelsPerFrame = Math.max(maxTerrainOutputPixelsPerFrame, observed.maxTerrainOutputPixelsPerFrame);
    maxTerrainOutputPixelsPerScreenRow = Math.max(maxTerrainOutputPixelsPerScreenRow, observed.maxTerrainOutputPixelsPerScreenRow);
    maxVisibleSpriteCount = Math.max(maxVisibleSpriteCount, observed.maxVisibleSpriteCount);
    maxSpriteOutputSamplesPerFrame = Math.max(maxSpriteOutputSamplesPerFrame, observed.maxSpriteOutputSamplesPerFrame);
    maxSpriteOutputSamplesPerScanline = Math.max(maxSpriteOutputSamplesPerScanline, observed.maxSpriteOutputSamplesPerScanline);
    maxSpriteWrittenPixelsPerFrame = Math.max(maxSpriteWrittenPixelsPerFrame, observed.maxSpriteWrittenPixelsPerFrame);
    maxSpriteWrittenPixelsPerScanline = Math.max(maxSpriteWrittenPixelsPerScanline, observed.maxSpriteWrittenPixelsPerScanline);
    maxGroundMapLevelUsed = Math.max(maxGroundMapLevelUsed, observed.maxGroundMapLevelUsed);
    for (let k = 0; k < observed.groundMapLevelLineCounts.length; k += 1) {
      groundMapLevelLineCounts[k] = (groundMapLevelLineCounts[k] ?? 0) + (observed.groundMapLevelLineCounts[k] ?? 0);
    }
  }

  return {
    frameCount,
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
 * Converts an observed stress envelope into an explicit content budget.
 * All policy is visible in one headroom factor.
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
