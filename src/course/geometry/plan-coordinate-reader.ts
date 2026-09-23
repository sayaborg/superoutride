import type { Writable } from '../../core/writable.js';
import type { Vec2 } from '../../core/math.js';
import { normalFromHeading } from '../../core/math.js';
import type { PlanarTransform } from '../../core/planar-transform.js';
import { createPlanarCoordinateSample } from '../../core/planar-sample.js';
import {
  planPrimitiveBounds,
  projectPlanPrimitiveInterval,
  samplePlanPath,
  type CompiledPlanPrimitive,
  type PlanPath,
} from './plan-path.js';
import {
  createPlanCoordinateSample,
  type PlanCoordinateReader,
  type SectionPlanCoordinateReader,
  type PlanCoordinateSample,
  type PlanCoordinateProjection,
  type PlanCoordinateMetrics,
  type PlanProjectionWorkspace,
  type PlanProjectionSeed,
  type PlanLateralBounds,
} from './plan-coordinate.js';
import type { CourseGeometryView } from '../course-geometry-view.js';

interface NativePlanDomain {
  readonly start: number;
  readonly end: number;
  lateralAt(s: number, out: Writable<PlanLateralBounds>): PlanLateralBounds;
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
  const candidateSampleA = { x: 0, z: 0, s: 0, heading: 0, primitiveIndex: -1 };
  const candidateSampleB = { x: 0, z: 0, s: 0, heading: 0, primitiveIndex: -1 };
  const project = { s: 0, l: 0, primitiveIndex: -1, distanceSquared: 0 };
  return Object.freeze({
    seedCount: primitives.length,
    projectionCandidates(start: number, end: number) {
      if (typeof start !== 'number' || typeof end !== 'number')
        throw new TypeError('Projection interval endpoints must be numeric');
      if (!(start >= 0 && end >= start && end <= length))
        throw new RangeError('Projection interval must lie inside the Section domain');
      return Object.freeze(
        primitives.flatMap((primitive) => {
          const a = Math.max(start, primitive.sStart);
          const b = Math.min(end, primitive.sEnd);
          if (!(b > a)) return [];
          return [
            Object.freeze({
              seed: primitive.index,
              start: a,
              end: b,
              extent: Object.freeze({ start: primitive.sStart, end: primitive.sEnd }),
              bounds: Object.freeze(planPrimitiveBounds(primitive, a, b, candidateSampleA, candidateSampleB)),
              project(world: Vec2, out: PlanCoordinateProjection) {
                projectPlanPrimitiveInterval(primitive, world, a, b, project, projectionSample);
                out.s = project.s;
                out.l = project.l;
                out.seed = primitive.index;
                out.distanceSquared = project.distanceSquared;
                return out;
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
        if (!Number.isFinite(s) || s < 0 || s > length) throw new RangeError('Plan chainage is outside the Section domain');
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
      out.seed = sample.primitiveIndex;
      return out;
    },
    metricsAt(s: number, l: number, seed: PlanProjectionSeed, out: Writable<PlanCoordinateMetrics>) {
      if (!Number.isFinite(s) || s < 0 || s > length) throw new RangeError('Plan chainage is outside the Section domain');
      if (!Number.isInteger(seed) || seed < 0 || seed >= primitives.length)
        throw new RangeError('Projection seed does not identify a plan primitive');
      const primitive = primitives[seed]!;
      out.curvature = primitive.curvature;
      out.metric = 1;
      out.offsetMetric = 1 - primitive.curvature * l;
      return out;
    },
    locateLocal(
      world: Vec2,
      previousSeed: PlanProjectionSeed,
      searchRadius: number,
      out: PlanCoordinateProjection,
      _workspace: PlanProjectionWorkspace,
    ) {
      if (!world || typeof world.x !== 'number' || typeof world.z !== 'number' || typeof previousSeed !== 'number' || typeof searchRadius !== 'number')
        throw new TypeError('Projection requires numeric world position and seed/radius');
      if (!Number.isFinite(world.x) || !Number.isFinite(world.z))
        throw new RangeError('Projection world coordinates must be finite');
      if (!Number.isSafeInteger(previousSeed) || previousSeed < 0 || previousSeed >= primitives.length || !Number.isSafeInteger(searchRadius) || searchRadius < 0)
        throw new RangeError('Projection requires an admitted seed and nonnegative search radius');
      const first = Math.max(0, previousSeed - searchRadius);
      const last = Math.min(primitives.length - 1, previousSeed + searchRadius);
      let found = false;
      for (let index = first; index <= last; index += 1) {
        const primitive = primitives[index]!;
        projectPlanPrimitiveInterval(primitive, world, primitive.sStart, primitive.sEnd, project, projectionSample);
        if (!found || project.distanceSquared < out.distanceSquared) {
          out.s = project.s;
          out.l = project.l;
          out.seed = index;
          out.distanceSquared = project.distanceSquared;
          found = true;
        }
      }
      if (!found) throw new Error('Admitted plan projection lost its candidates');
      return out;
    },
  });
}

type PlanCoordinateSpan = CourseGeometryView['spans'][number] & { readonly sourceFromView: PlanarTransform };
interface PlanCoordinateMapping {
  readonly mapped: readonly PlanCoordinateSpan[];
  /** One native seed capacity for the admitted physical product, independent of the retained window. */
  readonly seedStride: number;
  mappingAt(s: number): PlanCoordinateSpan;
  activeS(mapping: PlanCoordinateSpan, s: number): number;
  headingInFrame(mapping: PlanCoordinateSpan, heading: number): number;
}

/** The same reader contract over the caller's admitted occurrence mapping. */
export function createMappedPlanCoordinateReader(view: CourseGeometryView, mapping: PlanCoordinateMapping) {
  const { mapped, seedStride, mappingAt, activeS, headingInFrame } = mapping;
  if (!Number.isSafeInteger(seedStride) || seedStride < 1)
    throw new RangeError('Occurrence projection requires a positive exact seed capacity');
  const planSeed = (ordinal: number, index: number) => {
    const value = ordinal * seedStride + index;
    if (!Number.isSafeInteger(value) || value < 0 || index >= seedStride)
      throw new RangeError('Occurrence projection seed exceeds its exact integer domain');
    return value;
  };
  const range = view.activeRange;
  const candidates = mapped.flatMap((mapping) =>
    mapping.occurrence.section.coordinates
      .projectionCandidates(mapping.sourceRange.start, mapping.sourceRange.end)
      .map((native) => ({ mapping, native, seed: planSeed(mapping.occurrence.ordinal, native.seed) })),
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
      const mapping = mappingAt(s);
      const section = mapping.occurrence.section;
      const index = projectionSeed - mapping.occurrence.ordinal * seedStride;
      if (!Number.isInteger(index) || index < 0 || index >= section.coordinates.seedCount)
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
      const { local } = workspace;
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
      let bestS = 0;
      let bestL = 0;
      let bestDistance = Infinity;
      let previousMapping: (typeof mapped)[number] | null = null;
      const first = Math.max(0, at - searchRadius);
      const last = Math.min(candidates.length - 1, at + searchRadius);
      let bestIndex = -1;
      for (let cursor = first - 1; cursor <= last; cursor += 1) {
        const i = cursor < first ? at : cursor;
        if (cursor === at) continue;
        const candidate = candidates[i]!;
        const { mapping, native } = candidate;
        if (
          native.start > Math.max(mapping.sourceOwnership.start, native.extent.start) ||
          native.end < Math.min(mapping.sourceOwnership.end, native.extent.end)
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
          const bounds = native.bounds;
          const dx = Math.max(bounds.left - local.x, 0, local.x - bounds.right);
          const dz = Math.max(bounds.back - local.z, 0, local.z - bounds.front);
          if (dx * dx + dz * dz > bestDistance) continue;
        }
        native.project(local, out, workspace);
        const projectedS = out.s;
        const projectedL = out.l;
        const origin = mapping.sourceLateralOrigin;
        let distanceSquared = out.distanceSquared;
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
