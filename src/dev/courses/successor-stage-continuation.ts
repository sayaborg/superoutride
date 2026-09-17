import type { GuidePath } from '../../core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_RENDER_FAR_DEPTH_METERS } from '../../core/presentation-scale.js';
import type { GuideChart } from '../../gameplay/guide-chart.js';
import { createRasterStageSuccessor, type RasterSuccessorRuntimeSource } from '../../runtime/raster-stage-successor.js';
import {
  createChildStageContinuation,
  PARENT_FORK_GEOMETRY,
  type ChildStageContinuation,
  type ChildStageRuntimeSource,
  type ParentForkGeometry,
} from './child-stage-continuation.js';
import { CENTER_DASH_MARKINGS } from './road-markings.js';

const GROUND_MAP_HALF_WIDTH = 12;
const SUCCESSOR_SOURCE_SEAM_MIN_S = 340;
const SUCCESSOR_OVERLAP_MARGIN = 30;
const SUCCESSOR_TRANSITION_LEAD = 20;
const SUCCESSOR_FINISH_AFTER_SEAM = 150;
const SUCCESSOR_DEFORMATION_METERS = 3;
const GENTLE_TURN_LIMIT_DEGREES = 5;
const MIN_DEFORMATION_RUN_VERTICES = 5;
const SUCCESSOR_D_MAX = CURRENT_RENDER_FAR_DEPTH_METERS;

export type SuccessorRuntimeSource = RasterSuccessorRuntimeSource;

export interface LiveContinuation {
  readonly base: ChildStageContinuation;
  readonly leftSuccessor: SuccessorRuntimeSource;
  readonly rightSuccessor: SuccessorRuntimeSource;
  readonly charts: readonly GuideChart[];
}

export function createLiveContinuation(
  parentGuide: GuidePath,
  fork: ParentForkGeometry = PARENT_FORK_GEOMETRY,
): LiveContinuation {
  const base = createChildStageContinuation(parentGuide, fork);
  const leftSuccessor = createSuccessorSource(base.left, 'LEFT');
  const rightSuccessor = createSuccessorSource(base.right, 'RIGHT');
  const charts = Object.freeze([
    base.charts.parent,
    base.charts.left,
    base.charts.right,
    leftSuccessor.chart,
    rightSuccessor.chart,
  ]);
  return Object.freeze({ base, leftSuccessor, rightSuccessor, charts });
}

function createSuccessorSource(source: ChildStageRuntimeSource, side: 'LEFT' | 'RIGHT'): SuccessorRuntimeSource {
  const successor = createRasterStageSuccessor(source, {
    id: `${side}_CHILD_TO_SUCCESSOR`,
    chartId: `${side}_SUCCESSOR`,
    roadViewId: `${side}_SUCCESSOR_VIEW`,
    surfaceSectionName: `${side}_SUCCESSOR_STAGE`,
    sourceSeamMinS: SUCCESSOR_SOURCE_SEAM_MIN_S,
    overlapMargin: SUCCESSOR_OVERLAP_MARGIN,
    transitionLead: SUCCESSOR_TRANSITION_LEAD,
    finishAfterSeam: SUCCESSOR_FINISH_AFTER_SEAM,
    deformationMeters: SUCCESSOR_DEFORMATION_METERS,
    deformationDirection: side === 'LEFT' ? -1 : 1,
    gentleTurnLimitDegrees: GENTLE_TURN_LIMIT_DEGREES,
    minDeformationRunVertices: MIN_DEFORMATION_RUN_VERTICES,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
    dMax: SUCCESSOR_D_MAX,
    groundMapHalfWidth: GROUND_MAP_HALF_WIDTH,
    groundHalfWidth: source.roadView.groundLeft,
    road: source.roadView.road,
    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,
  });
  if (!(successor.sourceTransitionS > 300)) {
    throw new Error(`${side} transition must occur after child terrain settles`);
  }
  return successor;
}
