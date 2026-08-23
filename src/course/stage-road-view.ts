import { rasterCourseToWorld, type CourseWorldSample, type RasterCourse } from '../core/course.js';

/** Stage-local lateral region. Both visual and physical adapters consume this authority. */
export type StageRoadLocalClass = 'ROAD' | 'SHOULDER' | 'TERRAIN' | 'OUTSIDE';

/**
 * One stage-local lateral chart for the raster road strip.
 *
 * The source authoring can remain in the parent (s,l) frame while a committed child stage calls
 * its own road center l=0. The single scalar sourceLateralOrigin is the only coordinate conversion.
 */
export interface StageRoadView {
  readonly id: string;
  readonly sourceLateralOrigin: number;
  readonly groundLeft: number;
  readonly groundRight: number;
  readonly roadLeft: number;
  readonly roadRight: number;
  readonly shoulderWidth: number;
}

export function createStageRoadView(source: StageRoadView): StageRoadView {
  if (source.id.trim().length === 0) throw new RangeError('stage road view id must not be empty');
  const values = [
    source.sourceLateralOrigin,
    source.groundLeft,
    source.groundRight,
    source.roadLeft,
    source.roadRight,
    source.shoulderWidth,
  ];
  if (!values.every(Number.isFinite)) throw new RangeError('stage road view geometry must be finite');
  if (!(source.groundLeft > 0 && source.groundRight > 0)) {
    throw new RangeError('stage road view ground envelope must be positive');
  }
  if (!(source.roadLeft > 0 && source.roadRight > 0)) {
    throw new RangeError('stage road view road envelope must be positive');
  }
  if (!(source.shoulderWidth >= 0)) throw new RangeError('stage road view shoulderWidth must be >= 0');
  if (source.roadLeft + source.shoulderWidth > source.groundLeft + 1e-9) {
    throw new RangeError('left road + shoulder must fit inside stage ground envelope');
  }
  if (source.roadRight + source.shoulderWidth > source.groundRight + 1e-9) {
    throw new RangeError('right road + shoulder must fit inside stage ground envelope');
  }
  return Object.freeze({ ...source });
}

/** Convert stage-local l to the shared parent-authored source l. */
export function stageRoadSourceLateral(view: StageRoadView, localL: number): number {
  if (!Number.isFinite(localL)) throw new RangeError('stage-local lateral coordinate must be finite');
  return localL + view.sourceLateralOrigin;
}

/**
 * Stage-local cross-section authority.
 *
 * ROAD and TERRAIN may reuse parent-authored source content. SHOULDER is deliberately stage-local:
 * after a branch handoff, the former median-facing edge becomes an ordinary shoulder even when the
 * parent source at the translated coordinate was MEDIAN/GRASS. This makes the committed child one
 * self-contained road rather than a cropped view that still semantically depends on its sibling.
 */
export function classifyStageRoadLocalL(view: StageRoadView, localL: number): StageRoadLocalClass {
  if (!Number.isFinite(localL)) throw new RangeError('stage-local lateral coordinate must be finite');
  const epsilon = 1e-9;
  if (localL < -view.groundLeft - epsilon || localL > view.groundRight + epsilon) return 'OUTSIDE';
  if (localL >= -view.roadLeft - epsilon && localL <= view.roadRight + epsilon) return 'ROAD';

  const inLeftShoulder = localL >= -view.roadLeft - view.shoulderWidth - epsilon
    && localL < -view.roadLeft + epsilon;
  const inRightShoulder = localL > view.roadRight - epsilon
    && localL <= view.roadRight + view.shoulderWidth + epsilon;
  if (inLeftShoulder || inRightShoulder) return 'SHOULDER';
  return 'TERRAIN';
}

/**
 * Raster road world mapping for one stage-local lateral coordinate.
 * Chainage and raster segment selection are unchanged; only the lateral source origin moves.
 */
export function stageRoadToWorld(
  raster: RasterCourse,
  view: StageRoadView,
  s: number,
  localL: number,
): CourseWorldSample {
  const world = rasterCourseToWorld(raster, s, stageRoadSourceLateral(view, localL));
  return { ...world, l: localL };
}

export function stageRoadContainsLocalL(view: StageRoadView, localL: number): boolean {
  return classifyStageRoadLocalL(view, localL) !== 'OUTSIDE';
}
