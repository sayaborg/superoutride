import {
  guideCourseToWorld,
  locateWorldOnGuideGlobal,
  locateWorldOnGuideLocal,
  type CourseCoordinate,
  type GuideCurve,
  type GuideSample,
} from './guide-curve.js';
import type { Vec2 } from './math.js';

/**
 * Minimal lateral chart over one GuideCurve.
 *
 * Gameplay GuideChart structurally satisfies this contract but Core does not depend on gameplay.
 * `lateralOrigin` changes only which parallel road center is called local l=0.
 */
export interface GuideCoordinateFrame {
  readonly guide: GuideCurve;
  readonly lateralOrigin: number;
}

/** Backward-compatible input: the original GuideCurve is the zero-origin frame. */
export type GuideCoordinateSource = GuideCurve | GuideCoordinateFrame;

export function guideCoordinateCurve(source: GuideCoordinateSource): GuideCurve {
  return isGuideCoordinateFrame(source) ? source.guide : source;
}

export function guideCoordinateLateralOrigin(source: GuideCoordinateSource): number {
  return isGuideCoordinateFrame(source) ? source.lateralOrigin : 0;
}

export function guideCoordinateToWorld(
  source: GuideCoordinateSource,
  s: number,
  localL: number,
): GuideSample & { l: number } {
  const guide = guideCoordinateCurve(source);
  const lateralOrigin = guideCoordinateLateralOrigin(source);
  const world = guideCourseToWorld(guide, s, localL + lateralOrigin);
  return { ...world, l: localL };
}

export function locateWorldOnGuideCoordinateGlobal(
  source: GuideCoordinateSource,
  world: Vec2,
  clampL = false,
): CourseCoordinate {
  const guide = guideCoordinateCurve(source);
  return toLocalCoordinate(source, locateWorldOnGuideGlobal(guide, world, false), clampL);
}

export function locateWorldOnGuideCoordinateLocal(
  source: GuideCoordinateSource,
  world: Vec2,
  previousSegmentIndex: number,
  searchRadius = 2,
  clampL = false,
): CourseCoordinate {
  const guide = guideCoordinateCurve(source);
  return toLocalCoordinate(
    source,
    locateWorldOnGuideLocal(guide, world, previousSegmentIndex, searchRadius, false),
    clampL,
  );
}

function toLocalCoordinate(
  source: GuideCoordinateSource,
  base: CourseCoordinate,
  clampL: boolean,
): CourseCoordinate {
  const guide = guideCoordinateCurve(source);
  let l = base.l - guideCoordinateLateralOrigin(source);
  if (clampL) l = Math.max(-guide.lMax, Math.min(guide.lMax, l));
  return {
    s: base.s,
    l,
    segmentIndex: base.segmentIndex,
    distanceSquared: base.distanceSquared,
  };
}

function isGuideCoordinateFrame(source: GuideCoordinateSource): source is GuideCoordinateFrame {
  return 'guide' in source;
}
