import { classifyRoadCrossSection, compileRoadCrossSection, type RoadCrossSection } from './road-cross-section.js';
import type { CourseWorldSample } from '../core/raster-path.js';
import { rasterCoordinateToWorld, type RasterCoordinateSource } from '../core/raster-coordinate-reader.js';
import { LATERAL_BOUNDARY_TOLERANCE_METERS } from '../core/tolerances.js';

/** Stage-local lateral region. Both visual and physical adapters consume this authority. */
type StageRoadLocalClass = 'ROAD' | 'SHOULDER' | 'TERRAIN' | 'OUTSIDE';

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
  readonly road: RoadCrossSection;
}

export function createStageRoadView(source: StageRoadView): StageRoadView {
  if (source.id.trim().length === 0) throw new RangeError('stage road view id must not be empty');
  const road = compileRoadCrossSection(source.road);
  if (![source.sourceLateralOrigin, source.groundLeft, source.groundRight].every(Number.isFinite))
    throw new RangeError('stage road view geometry must be finite');
  if (!(source.groundLeft > 0 && source.groundRight > 0))
    throw new RangeError('stage road view ground envelope must be positive');
  if (road.roadLeft + road.shoulderWidth > source.groundLeft + LATERAL_BOUNDARY_TOLERANCE_METERS)
    throw new RangeError('left road + shoulder must fit inside stage ground envelope');
  if (road.roadRight + road.shoulderWidth > source.groundRight + LATERAL_BOUNDARY_TOLERANCE_METERS)
    throw new RangeError('right road + shoulder must fit inside stage ground envelope');
  return Object.freeze({ ...source, road });
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
  if (
    localL < -view.groundLeft - LATERAL_BOUNDARY_TOLERANCE_METERS ||
    localL > view.groundRight + LATERAL_BOUNDARY_TOLERANCE_METERS
  )
    return 'OUTSIDE';
  const lateralClass = classifyRoadCrossSection(view.road, localL, LATERAL_BOUNDARY_TOLERANCE_METERS);
  return lateralClass === 'OUTSIDE' ? 'TERRAIN' : lateralClass;
}

/**
 * Raster road world mapping for one stage-local lateral coordinate.
 * Chainage and raster segment selection are unchanged; only the lateral source origin moves.
 */
export function stageRoadToWorld(
  raster: RasterCoordinateSource,
  view: StageRoadView,
  s: number,
  localL: number,
): CourseWorldSample {
  const world = rasterCoordinateToWorld(raster, s, stageRoadSourceLateral(view, localL));
  return { ...world, l: localL };
}

export function stageRoadContainsLocalL(view: StageRoadView, localL: number): boolean {
  return classifyStageRoadLocalL(view, localL) !== 'OUTSIDE';
}
