import { createGuideChart } from '../gameplay/guide-chart.js';
import { compileStageContinuationLink } from './stage-continuation-link.js';
import {
  createRasterStageSuccessor,
  type RasterSuccessorAuthoring,
  type RasterSuccessorRuntimeSource,
  type RasterSuccessorSource,
} from './raster-stage-successor.js';

export interface RasterForkSuccessorAuthoring {
  /** Active source-stage local center of the separated child road. */
  readonly sourceLocalL: number;
  readonly successor: RasterSuccessorAuthoring;
}

/**
 * Create one independent successor whose local l=0 follows a separated child road in the source
 * stage. The ordinary M6.29 successor algorithm remains the geometry authority; this adapter only
 * shifts the coordinate chart used as its structural road center, then recompiles the public link
 * against the real active source chart with sourceLocalL explicitly preserved.
 */
export function createRasterForkStageSuccessor(
  source: RasterSuccessorSource,
  authoring: RasterForkSuccessorAuthoring,
): RasterSuccessorRuntimeSource {
  if (!Number.isFinite(authoring.sourceLocalL)) {
    throw new RangeError('fork successor sourceLocalL must be finite');
  }
  if (Math.abs(authoring.sourceLocalL) > source.guide.lMax + 1e-9) {
    throw new RangeError('fork successor child center must fit inside the source Guide lateral envelope');
  }

  const shiftedSourceChart = createGuideChart(
    `${authoring.successor.id}_SOURCE_CHILD_CENTER`,
    source.guide,
    source.chart.lateralOrigin + authoring.sourceLocalL,
  );
  const generated = createRasterStageSuccessor({
    guide: source.guide,
    chart: shiftedSourceChart,
    groundProfile: source.groundProfile,
  }, authoring.successor);

  const link = compileStageContinuationLink({
    id: generated.link.id,
    sourceFrame: source.chart,
    targetFrame: generated.chart,
    sourceSeamS: generated.sourceSeamS,
    targetSeamS: generated.targetSeamS,
    sourceLocalL: authoring.sourceLocalL,
    targetLocalL: 0,
    overlapBehind: generated.link.overlapBehind,
    overlapAhead: generated.link.overlapAhead,
  });

  return Object.freeze({ ...generated, link });
}
