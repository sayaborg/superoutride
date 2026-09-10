import {
  guideCoordinateToWorld,
  locateWorldOnGuideCoordinateGlobal,
  locateWorldOnGuideCoordinateLocal,
} from '../core/guide-coordinate-frame.js';
import type { CourseCoordinate, GuidePath, GuideSample } from '../core/guide-curve.js';
import type { Vec2 } from '../core/math.js';

/**
 * A road-coordinate chart over one world-space Guide geometry.
 *
 * `lateralOrigin` changes only what lateral coordinate is called l=0. It does
 * not move world geometry, the vehicle, the camera or any physics state.
 * This is the overlap/handoff primitive used after a visible junction has
 * physically committed to one child road.
 */
export interface GuideChart {
  readonly id: string;
  readonly guide: GuidePath;
  readonly lateralOrigin: number;
}

export interface GuideChartSample extends GuideSample {
  readonly l: number;
}

export function createGuideChart(id: string, guide: GuidePath, lateralOrigin = 0): GuideChart {
  if (id.length === 0) throw new Error('Guide chart id must not be empty');
  if (!Number.isFinite(lateralOrigin)) throw new RangeError('Guide chart lateralOrigin must be finite');
  return Object.freeze({ id, guide, lateralOrigin });
}

export function guideChartToWorld(chart: GuideChart, s: number, l: number): GuideChartSample {
  return guideCoordinateToWorld(chart, s, l);
}

export function locateWorldOnGuideChartGlobal(chart: GuideChart, world: Vec2, clampL = false): CourseCoordinate {
  return locateWorldOnGuideCoordinateGlobal(chart, world, clampL);
}

export function locateWorldOnGuideChartLocal(
  chart: GuideChart,
  world: Vec2,
  previousSegmentIndex: number,
  searchRadius = 2,
  clampL = false,
): CourseCoordinate {
  return locateWorldOnGuideCoordinateLocal(chart, world, previousSegmentIndex, searchRadius, clampL);
}

/**
 * One explicit chart handoff from a world-authoritative vehicle position.
 * Global location is intentional: the target chart has no valid previous local
 * segment until the handoff has been initialized once.
 */
export function handoffGuideChart(chart: GuideChart, world: Vec2): CourseCoordinate {
  return locateWorldOnGuideChartGlobal(chart, world, false);
}
