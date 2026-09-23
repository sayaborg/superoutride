import type { Writable } from '../../core/writable.js';
import type { Vec2 } from '../../core/math.js';
import { normalFromHeading } from '../../core/math.js';
import type { PlanarTransform } from '../../core/planar-transform.js';
import {
  planPrimitiveIndexAt,
  projectPlanPrimitiveInterval,
  samplePlanPath,
  type CompiledPlanPrimitive,
  type PlanPath,
} from './plan-path.js';
import {
  PLAN_PROJECTION_WINDOW_METERS,
  type PlanCoordinateReader,
  type SectionPlanCoordinateReader,
  type PlanCoordinateSample,
  type PlanCoordinateProjection,
  type PlanCoordinateMetrics,
  type PlanProjectionWorkspace,
  type PlanProjectionCandidate,
  type PlanProjectionCandidateSample,
  type PlanLateralBounds,
} from './plan-coordinate.js';
import type { CourseGeometryView } from '../course-geometry-view.js';

interface NativePlanDomain {
  readonly start: number;
  readonly end: number;
  lateralAt(s: number, out: Writable<PlanLateralBounds>): PlanLateralBounds;
}

function checkProjection(world: Vec2, previousS: number, start: number, end: number): void {
  if (!world || typeof world.x !== 'number' || typeof world.z !== 'number' || typeof previousS !== 'number')
    throw new TypeError('Projection requires a world point and previous chainage');
  if (
    !Number.isFinite(world.x) ||
    !Number.isFinite(world.z) ||
    !Number.isFinite(previousS) ||
    previousS < start ||
    previousS > end
  )
    throw new RangeError('Projection requires finite coordinates and an admitted previous chainage');
}

/** A Section reader over its authored straight/circular plan authority. */
export function createPlanCoordinateReader(
  primitives: readonly CompiledPlanPrimitive[],
  length: number,
  lateralAt: NativePlanDomain['lateralAt'],
): SectionPlanCoordinateReader {
  const plan: PlanPath = Object.freeze({ primitives, length });
  const sample = { x: 0, z: 0, s: 0, heading: 0, primitiveIndex: -1 };
  const projectionSample = { x: 0, z: 0, s: 0, heading: 0, primitiveIndex: -1 };
  const projected = { s: 0, l: 0, primitiveIndex: -1, distanceSquared: 0, isFoot: false };
  const bounds = { left: 0, right: 0 };
  const reader: SectionPlanCoordinateReader = Object.freeze({
    projectionCandidates(start: number, end: number) {
      if (typeof start !== 'number' || typeof end !== 'number')
        throw new TypeError('Projection interval endpoints must be numeric');
      if (!(start >= 0 && end >= start && end <= length))
        throw new RangeError('Projection interval must lie inside the Section domain');
      return Object.freeze(
        primitives.flatMap((primitive): PlanProjectionCandidate[] => {
          const a = Math.max(start, primitive.sStart),
            b = Math.min(end, primitive.sEnd);
          if (!(b > a)) return [];
          return [
            Object.freeze({
              start: a,
              end: b,
              project(world: Vec2, from: number, to: number, out: PlanProjectionCandidateSample) {
                projectPlanPrimitiveInterval(primitive, world, from, to, projected, projectionSample);
                out.s = projected.s;
                out.l = projected.l;
                out.isFoot = projected.isFoot;
                out.distanceSquared = projected.distanceSquared;
              },
            }),
          ];
        }),
      );
    },
    domain: Object.freeze({
      start: 0,
      end: length,
      lateralAt(s: number, out: Writable<PlanLateralBounds>) {
        if (typeof s !== 'number') throw new TypeError('Plan chainage must be numeric');
        if (!Number.isFinite(s) || s < 0 || s > length)
          throw new RangeError('Plan chainage is outside the Section domain');
        return lateralAt(s, out);
      },
    }),
    toWorld(s: number, l: number, out: PlanCoordinateSample) {
      if (!Number.isFinite(l)) throw new RangeError('Plan lateral coordinate must be finite');
      samplePlanPath(plan, s, sample);
      const normal = normalFromHeading(sample.heading);
      out.x = sample.x + normal.x * l;
      out.z = sample.z + normal.z * l;
      out.s = sample.s;
      out.heading = sample.heading;
      out.l = l;
      return out;
    },
    metricsAt(s: number, l: number, out: Writable<PlanCoordinateMetrics>) {
      if (!Number.isFinite(s) || s < 0 || s > length || !Number.isFinite(l))
        throw new RangeError('Plan metric requires finite coordinates in the Section');
      const primitive = primitives[planPrimitiveIndexAt(plan, s)]!;
      out.curvature = primitive.curvature;
      out.offsetMetric = 1 - primitive.curvature * l;
      return out;
    },
    locateLocal(world: Vec2, previousS: number, out: PlanCoordinateProjection, workspace: PlanProjectionWorkspace) {
      checkProjection(world, previousS, 0, length);
      const from = Math.max(0, previousS - PLAN_PROJECTION_WINDOW_METERS);
      const to = Math.min(length, previousS + PLAN_PROJECTION_WINDOW_METERS);
      const candidate = workspace.candidate;
      let bestDistance = Infinity,
        bestInDomain = false,
        found = false;
      for (const primitive of primitives) {
        const a = Math.max(from, primitive.sStart),
          b = Math.min(to, primitive.sEnd);
        if (!(b > a)) continue;
        projectPlanPrimitiveInterval(primitive, world, a, b, projected, projectionSample);
        reader.domain.lateralAt(projected.s, bounds);
        const inDomain = projected.isFoot && projected.l >= bounds.left && projected.l <= bounds.right;
        if (
          found &&
          ((bestInDomain && !inDomain) || (bestInDomain === inDomain && projected.distanceSquared >= bestDistance))
        )
          continue;
        candidate.s = projected.s;
        candidate.l = projected.l;
        candidate.isFoot = projected.isFoot;
        candidate.distanceSquared = projected.distanceSquared;
        out.s = candidate.s;
        out.l = candidate.l;
        out.inDomain = inDomain;
        bestDistance = candidate.distanceSquared;
        bestInDomain = inDomain;
        found = true;
      }
      if (!found) throw new Error('Admitted Section projection lost its candidates');
      return out;
    },
  });
  return reader;
}

type PlanCoordinateSpan = CourseGeometryView['spans'][number] & { readonly sourceFromView: PlanarTransform };
interface PlanCoordinateMapping {
  readonly mapped: readonly PlanCoordinateSpan[];
  mappingAt(s: number): PlanCoordinateSpan;
  activeS(mapping: PlanCoordinateSpan, s: number): number;
  headingInFrame(mapping: PlanCoordinateSpan, heading: number): number;
}

/** Compose native Section candidates in the admitted occurrence frame. */
export function createMappedPlanCoordinateReader(
  view: CourseGeometryView,
  mapping: PlanCoordinateMapping,
): PlanCoordinateReader {
  const { mapped, mappingAt, activeS, headingInFrame } = mapping;
  const range = view.activeRange;
  const candidates = mapped.flatMap((span) =>
    span.occurrence.section.coordinates
      .projectionCandidates(span.sourceRange.start, span.sourceRange.end)
      .map((native) => ({ span, native, start: activeS(span, native.start), end: activeS(span, native.end) })),
  );
  const coordinateSample = { x: 0, z: 0, s: 0, l: 0, heading: 0 };
  const lateralBounds = { left: 0, right: 0 };
  return Object.freeze({
    domain: Object.freeze({
      ...range,
      lateralAt(s: number, out: Writable<PlanLateralBounds>) {
        const span = mappingAt(s);
        span.occurrence.section.coordinates.domain.lateralAt(span.sourceChainageInFrame(s), lateralBounds);
        out.left = lateralBounds.left - span.sourceLateralOrigin;
        out.right = lateralBounds.right - span.sourceLateralOrigin;
        return out;
      },
    }),
    toWorld(s: number, l: number, out: PlanCoordinateSample) {
      const span = mappingAt(s);
      const p = span.occurrence.section.coordinates.toWorld(
        span.sourceChainageInFrame(s),
        l + span.sourceLateralOrigin,
        coordinateSample,
      );
      const t = span.viewFromSource;
      out.x = t.cosine * p.x + t.sine * p.z + t.translation.x;
      out.z = -t.sine * p.x + t.cosine * p.z + t.translation.z;
      out.s = s;
      out.l = l;
      out.heading = headingInFrame(span, p.heading);
      return out;
    },
    metricsAt(s: number, l: number, out: Writable<PlanCoordinateMetrics>) {
      const span = mappingAt(s);
      return span.occurrence.section.coordinates.metricsAt(
        span.sourceChainageInFrame(s),
        l + span.sourceLateralOrigin,
        out,
      );
    },
    locateLocal(world: Vec2, previousS: number, out: PlanCoordinateProjection, workspace: PlanProjectionWorkspace) {
      checkProjection(world, previousS, range.start, range.end);
      const from = previousS - PLAN_PROJECTION_WINDOW_METERS;
      const to = previousS + PLAN_PROJECTION_WINDOW_METERS;
      const { local, candidate: projected, bounds } = workspace;
      let bestDistance = Infinity,
        bestInDomain = false,
        bestOwner = false,
        found = false;
      for (const { span, native, start, end } of candidates) {
        const a = Math.max(start, from),
          b = Math.min(end, to);
        if (!(b > a)) continue;
        const t = span.sourceFromView;
        local.x = t.cosine * world.x + t.sine * world.z + t.translation.x;
        local.z = -t.sine * world.x + t.cosine * world.z + t.translation.z;
        native.project(local, span.sourceChainageInFrame(a), span.sourceChainageInFrame(b), projected);
        const s = activeS(span, projected.s);
        const l = projected.l - span.sourceLateralOrigin;
        span.occurrence.section.coordinates.domain.lateralAt(projected.s, bounds);
        const inDomain = projected.isFoot && projected.l >= bounds.left && projected.l <= bounds.right;
        const owner = mappingAt(s) === span;
        if (
          found &&
          ((bestInDomain && !inDomain) ||
            (bestInDomain === inDomain &&
              ((bestOwner && !owner) || (bestOwner === owner && projected.distanceSquared >= bestDistance))))
        )
          continue;
        out.s = s;
        out.l = l;
        out.inDomain = inDomain;
        bestDistance = projected.distanceSquared;
        bestInDomain = inDomain;
        bestOwner = owner;
        found = true;
      }
      if (!found) throw new Error('Admitted mapped projection lost its candidates');
      return out;
    },
  });
}
