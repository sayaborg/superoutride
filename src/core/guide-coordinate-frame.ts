import { createPlanarCoordinateSample } from './planar-sample.js';
import type { Writable } from './writable.js';
import {
  createGuideProjectionWorkspace,
  guidePathToWorld,
  locateWorldOnGuideLocal,
  type CourseCoordinate,
  type GuidePath,
  type GuideSample,
} from './guide-curve.js';
import type { Vec2 } from './math.js';
import { guideEnvelopeAt } from './guide-envelope.js';

/**
 * Minimal lateral chart over one GuidePath.
 *
 * Gameplay GuideChart structurally satisfies this contract but Core does not depend on gameplay.
 * `lateralOrigin` changes only which parallel road center is called local l=0.
 */
interface GuideCoordinateFrame {
  readonly guide: GuidePath;
  readonly lateralOrigin: number;
}

/** Source data used by geometry authoring and legacy constant-origin adapters. */
type GuidePathSource = GuidePath | GuideCoordinateFrame;

interface GuideCoordinateMetrics {
  readonly curvature: number;
  readonly metric: number;
  readonly offsetMetric: number;
}

/** Ordinary finite reader. No topology, occurrence, source arrays or global-search fallback. */
export interface GuideCoordinateReader {
  readonly domain: { readonly start: number; readonly end: number };
  toWorld(s: number, l: number, out: Writable<GuideSample> & { l: number }): GuideSample & { l: number };
  metricsAt(s: number, l: number, segmentIndex: number, out: Writable<GuideCoordinateMetrics>): GuideCoordinateMetrics;
  locateLocal(
    world: Vec2,
    previousSegmentIndex: number,
    searchRadius: number,
    clampL: boolean,
    out: CourseCoordinate,
  ): CourseCoordinate;
}

/** Existing paths keep their exact sampling arithmetic; bounded readers supply the same observations. */
export type GuideCoordinateSource = GuidePathSource | GuideCoordinateReader;

function guideCoordinateCurve(source: GuidePathSource): GuidePath {
  return isGuideCoordinateFrame(source) ? source.guide : source;
}

function guideCoordinateLateralOrigin(source: GuidePathSource): number {
  return isGuideCoordinateFrame(source) ? source.lateralOrigin : 0;
}

export function guideCoordinateDomain(source: GuideCoordinateSource): { readonly start: number; readonly end: number } {
  return 'toWorld' in source ? source.domain : { start: 0, end: guideCoordinateCurve(source).length };
}

export function guideCoordinateMetricsAt(
  source: GuideCoordinateSource,
  s: number,
  l: number,
  segmentIndex: number,
  out: Writable<GuideCoordinateMetrics>,
): GuideCoordinateMetrics {
  if ('toWorld' in source) return source.metricsAt(s, l, segmentIndex, out);
  const curve = guideCoordinateCurve(source),
    segment = curve.segments[segmentIndex]!;
  let curvature = 0,
    metric = 1;
  if (segment.kind === 'arc') {
    const corner = curve.corners[segment.cornerIndex]!;
    curvature = Math.sign(corner.turn) / corner.radius;
    metric = corner.mu;
  }
  const worldL = l + guideCoordinateLateralOrigin(source);
  out.curvature = curvature;
  out.metric = metric;
  out.offsetMetric = 1 - curvature * worldL;
  return out;
}

export function guideCoordinateToWorld(
  source: GuideCoordinateSource,
  s: number,
  localL: number,
  out: ReturnType<typeof createPlanarCoordinateSample>,
): GuideSample & { l: number } {
  if ('toWorld' in source) return source.toWorld(s, localL, out);
  const guide = guideCoordinateCurve(source);
  const lateralOrigin = guideCoordinateLateralOrigin(source);
  guidePathToWorld(guide, s, localL + lateralOrigin, out);
  out.l = localL;
  return out;
}

export function locateWorldOnGuideCoordinateLocal(
  source: GuideCoordinateSource,
  world: Vec2,
  previousSegmentIndex: number,
  searchRadius: number,
  clampL: boolean,
  out: CourseCoordinate,
  workspace: ReturnType<typeof createGuideProjectionWorkspace>,
): CourseCoordinate {
  if ('toWorld' in source) return source.locateLocal(world, previousSegmentIndex, searchRadius, clampL, out);
  const guide = guideCoordinateCurve(source);
  return toLocalCoordinate(
    source,
    locateWorldOnGuideLocal(guide, world, previousSegmentIndex, searchRadius, false, out, workspace),
    clampL,
  );
}

function toLocalCoordinate(source: GuidePathSource, base: CourseCoordinate, clampL: boolean): CourseCoordinate {
  const guide = guideCoordinateCurve(source);
  const limit = clampL ? guideEnvelopeAt(guide.envelope, base.s) : 0;
  const sourceL = clampL ? Math.max(-limit, Math.min(limit, base.l)) : base.l;
  const l = sourceL - guideCoordinateLateralOrigin(source);
  base.l = l;
  return base;
}

function isGuideCoordinateFrame(source: GuidePathSource): source is GuideCoordinateFrame {
  return 'guide' in source;
}
