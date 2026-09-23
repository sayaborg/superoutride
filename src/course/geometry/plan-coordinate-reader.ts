import type { Writable } from '../../core/writable.js';
import type { Vec2 } from '../../core/math.js';
import type { PlanarTransform } from '../../core/planar-transform.js';
import { createPlanarCoordinateSample } from '../../core/planar-sample.js';
import { guideEnvelopeAt } from './guide-envelope.js';
import {
  guidePathToWorld,
  locateWorldOnGuideLocal,
  guideSegmentBounds,
  sampleGuideSegment,
  projectWorldOnGuideInterval,
  type GuidePath,
} from './guide-curve.js';
import {
  createPlanCoordinateSample,
  type PlanCoordinateReader,
  type PlanCoordinateSample,
  type PlanCoordinateProjection,
  type PlanCoordinateMetrics,
  type PlanProjectionWorkspace,
  type PlanProjectionSeed,
  type PlanLateralBounds,
} from './plan-coordinate.js';
import type { CourseGeometryView } from '../course-geometry-view.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-document.js';

/** A Section reader over its compiled planar geometry. */
export function createPlanCoordinateReader(guide: GuidePath): PlanCoordinateReader {
  const sample = createPlanarCoordinateSample();
  return Object.freeze({
    domain: Object.freeze({
      start: 0,
      end: guide.length,
      lateralAt(s: number, out: Writable<PlanLateralBounds>) {
        const limit = guideEnvelopeAt(guide.envelope, s);
        out.left = -limit;
        out.right = limit;
        return out;
      },
    }),
    toWorld(s: number, l: number, out: PlanCoordinateSample) {
      sample.segmentIndex = out.seed;
      guidePathToWorld(guide, s, l + 0, sample);
      out.x = sample.x;
      out.z = sample.z;
      out.s = sample.s;
      out.heading = sample.heading;
      out.l = l;
      out.seed = sample.segmentIndex;
      return out;
    },
    metricsAt(_s: number, l: number, seed: PlanProjectionSeed, out: Writable<PlanCoordinateMetrics>) {
      const segment = guide.segments[seed]!;
      let curvature = 0,
        metric = 1;
      if (segment.kind === 'arc') {
        const corner = guide.corners[segment.cornerIndex]!;
        curvature = Math.sign(corner.turn) / corner.radius;
        metric = corner.mu;
      }
      out.curvature = curvature;
      out.metric = metric;
      out.offsetMetric = 1 - curvature * (l + 0);
      return out;
    },
    locateLocal(
      world: Vec2,
      previousSeed: PlanProjectionSeed,
      searchRadius: number,
      out: PlanCoordinateProjection,
      workspace: PlanProjectionWorkspace,
    ) {
      const result = locateWorldOnGuideLocal(guide, world, previousSeed, searchRadius, workspace.projected, workspace);
      out.s = result.s;
      out.l = result.l - 0;
      out.seed = result.segmentIndex;
      out.distanceSquared = result.distanceSquared;
      return out;
    },
  });
}

// At most one straight per Raster segment and one fillet per vertex. Occurrence ordinals do not wrap.
const planSeedStride = 2 * COURSE_DOCUMENT_LIMITS.rasterSegments;
const planSeed = (ordinal: number, index: number) => {
  const value = ordinal * planSeedStride + index;
  if (!Number.isSafeInteger(value) || value < 0 || index >= planSeedStride)
    throw new RangeError('Occurrence projection seed exceeds its exact integer domain');
  return value;
};

type PlanCoordinateSpan = CourseGeometryView['spans'][number] & { readonly sourceFromView: PlanarTransform };
interface PlanCoordinateMapping {
  readonly mapped: readonly PlanCoordinateSpan[];
  mappingAt(s: number): PlanCoordinateSpan;
  activeS(mapping: PlanCoordinateSpan, s: number): number;
  headingInFrame(mapping: PlanCoordinateSpan, heading: number): number;
}

/** The same reader contract over the caller's admitted occurrence mapping. */
export function createMappedPlanCoordinateReader(view: CourseGeometryView, mapping: PlanCoordinateMapping) {
  const { mapped, mappingAt, activeS, headingInFrame } = mapping;
  const range = view.activeRange;
  const candidates = mapped.flatMap((mapping) =>
    mapping.occurrence.section.guide.segments.flatMap((segment) => {
      const start = Math.max(mapping.sourceRange.start, segment.sStart),
        end = Math.min(mapping.sourceRange.end, segment.sEnd);
      return end > start
        ? [
            {
              mapping,
              segment,
              start,
              end,
              bounds: guideSegmentBounds(mapping.occurrence.section.guide, segment, start, end),
              seed: planSeed(mapping.occurrence.ordinal, segment.index),
              origin:
                segment.kind === 'straight'
                  ? sampleGuideSegment(
                      mapping.occurrence.section.guide,
                      segment,
                      segment.sStart,
                      createPlanarCoordinateSample(),
                    )
                  : undefined,
            },
          ]
        : [];
    }),
  );
  const candidateIndices = new Map(candidates.map((c, i) => [c.seed, i]));
  const coordinateSample = createPlanCoordinateSample();
  const lateralBounds = { left: 0, right: 0 };
  const reader: PlanCoordinateReader = Object.freeze({
    domain: Object.freeze({
      ...range,
      lateralAt(s: number, out: Writable<PlanLateralBounds>) {
        const mapping = mappingAt(s);
        mapping.occurrence.section.coordinates.domain.lateralAt(mapping.sourceChainageInFrame(s), lateralBounds);
        out.left = lateralBounds.left - mapping.sourceLateralOrigin;
        out.right = lateralBounds.right - mapping.sourceLateralOrigin;
        return out;
      },
    }),
    toWorld(s: number, l: number, out: PlanCoordinateSample) {
      const mapping = mappingAt(s);
      const p = mapping.occurrence.section.coordinates.toWorld(
        mapping.sourceChainageInFrame(s),
        l + mapping.sourceLateralOrigin,
        coordinateSample,
      );
      const t = mapping.viewFromSource;
      out.x = t.cosine * p.x + t.sine * p.z + t.translation.x;
      out.z = -t.sine * p.x + t.cosine * p.z + t.translation.z;
      out.s = s;
      out.l = l;
      out.heading = headingInFrame(mapping, p.heading);
      out.seed = planSeed(mapping.occurrence.ordinal, p.seed);
      return out;
    },
    metricsAt(s: number, l: number, projectionSeed: PlanProjectionSeed, out: Writable<PlanCoordinateMetrics>) {
      if (typeof projectionSeed !== 'number') throw new TypeError('Projection seed must be numeric');
      const mapping = mappingAt(s),
        section = mapping.occurrence.section;
      const index = projectionSeed - mapping.occurrence.ordinal * planSeedStride;
      if (!Number.isInteger(index) || index < 0 || index >= section.guide.segments.length)
        throw new RangeError('Projection seed does not belong to the addressed occurrence');
      return section.coordinates.metricsAt(
        mapping.sourceChainageInFrame(s),
        l + mapping.sourceLateralOrigin,
        index,
        out,
      );
    },
    locateLocal(
      world: Vec2,
      previousSeed: PlanProjectionSeed,
      searchRadius: number,
      out: PlanCoordinateProjection,
      workspace: PlanProjectionWorkspace,
    ) {
      const { projectionSample, projected, local, values: projectionValues } = workspace;
      if (
        !world ||
        typeof world.x !== 'number' ||
        typeof world.z !== 'number' ||
        typeof previousSeed !== 'number' ||
        typeof searchRadius !== 'number'
      )
        throw new TypeError('Projection requires numeric world position and seed/radius');
      if (!Number.isSafeInteger(previousSeed) || !Number.isSafeInteger(searchRadius) || searchRadius < 0)
        throw new RangeError('Projection requires an exact seed and nonnegative search radius');
      const at = candidateIndices.get(previousSeed);
      if (at === undefined) throw new RangeError('Projection seed is outside the retained occurrence window');
      if (
        (at - searchRadius < 0 && range.start > view.availableRange.start) ||
        (at + searchRadius >= candidates.length && range.end < view.availableRange.end)
      )
        throw new RangeError('Driving window does not cover the complete seeded search');
      let best: (typeof candidates)[number] | null = null;
      let bestS = 0,
        bestL = 0,
        bestDistance = Infinity;
      let previousMapping: (typeof mapped)[number] | null = null;
      const first = Math.max(0, at - searchRadius),
        last = Math.min(candidates.length - 1, at + searchRadius);
      let bestIndex = -1;
      // The retained seed is usually nearest. Remaining ties still prefer the original source order.
      for (let cursor = first - 1; cursor <= last; cursor += 1) {
        const i = cursor < first ? at : cursor;
        if (cursor === at) continue;
        const candidate = candidates[i]!;
        const { mapping, segment, start, end } = candidate;
        if (
          start > Math.max(mapping.sourceOwnership.start, segment.sStart) ||
          end < Math.min(mapping.sourceOwnership.end, segment.sEnd)
        )
          throw new RangeError('Driving window clips a seeded projection candidate');
        const section = mapping.occurrence.section;
        if (previousMapping !== mapping) {
          const t = mapping.sourceFromView;
          local.x = t.cosine * world.x + t.sine * world.z + t.translation.x;
          local.z = -t.sine * world.x + t.cosine * world.z + t.translation.z;
          previousMapping = mapping;
        }
        if (best && mapping.sourceLateralOrigin === 0) {
          const bounds = candidate.bounds;
          const dx = Math.max(bounds.left - local.x, 0, local.x - bounds.right);
          const dz = Math.max(bounds.back - local.z, 0, local.z - bounds.front);
          if (dx * dx + dz * dz > bestDistance) continue;
        }
        projectWorldOnGuideInterval(
          section.guide,
          segment.index,
          local,
          start,
          end,
          projected,
          projectionSample,
          candidate.origin,
          projectionValues,
        );
        const projectedS = projectionValues[0]!,
          projectedL = projectionValues[1]!;
        const origin = mapping.sourceLateralOrigin;
        let distanceSquared = projectionValues[3]!;
        if (origin !== 0) {
          const center = section.coordinates.toWorld(projectedS, 0, coordinateSample);
          distanceSquared =
            (local.x - center.x - Math.cos(center.heading) * origin) ** 2 +
            (local.z - center.z - -Math.sin(center.heading) * origin) ** 2;
        }
        if (best && (distanceSquared > bestDistance || (distanceSquared === bestDistance && i > bestIndex))) continue;
        best = candidate;
        bestIndex = i;
        bestS = activeS(mapping, projectedS);
        bestL = projectedL - origin;
        bestDistance = distanceSquared;
      }
      if (!best) throw new Error('Admitted driving projection lost its candidates');
      out.s = bestS;
      out.l = bestL;
      out.distanceSquared = bestDistance;
      const canonical = mappingAt(out.s);
      out.seed =
        canonical.occurrence === best.mapping.occurrence
          ? best.seed
          : planSeed(
              canonical.occurrence.ordinal,
              canonical.occurrence.section.coordinates.toWorld(
                canonical.sourceChainageInFrame(out.s),
                0,
                coordinateSample,
              ).seed,
            );
      return out;
    },
  });

  return Object.freeze({ reader, seedCount: candidates.length });
}
