import type { Writable } from '../../core/writable.js';
import type { Vec2 } from '../../core/math.js';
import { normalFromHeading, wrapAngle } from '../../core/math.js';
import {
  planPrimitiveIndexAt,
  projectPlanPrimitiveInterval,
  samplePlanPath,
  type CompiledPlanPrimitive,
  type PlanPath,
} from './plan-path.js';
import {
  PLAN_PROJECTION_WINDOW_METERS,
  type SectionPlanCoordinateReader,
  type PlanCoordinateSample,
  type PlanCoordinateProjection,
  type PlanCoordinateMetrics,
  type PlanProjectionWorkspace,
  type PlanProjectionCandidate,
  type PlanProjectionCandidateSample,
  type PlanLateralBounds,
} from './plan-coordinate.js';

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
    forwardEnd(start: number, end: number, yaw: number) {
      for (let i = planPrimitiveIndexAt(plan, start); i < primitives.length; i++) {
        const primitive = primitives[i]!;
        const a = Math.max(start, primitive.sStart);
        const b = Math.min(end, primitive.sEnd);
        if (b <= a) continue;
        const relative = wrapAngle(primitive.start.heading + primitive.curvature * (a - primitive.sStart) - yaw);
        if (Math.abs(relative) >= Math.PI / 2) return a;
        if (primitive.curvature !== 0) {
          const boundary = (Math.sign(primitive.curvature) * Math.PI) / 2;
          const station = a + (boundary - relative) / primitive.curvature;
          if (station <= b) return station;
        }
        if (b === end) break;
      }
      return end;
    },
    projectionCandidates(start: number, end: number) {
      if (typeof start !== 'number' || typeof end !== 'number')
        throw new TypeError('Projection interval endpoints must be numeric');
      if (!(start >= 0 && end >= start && end <= length))
        throw new RangeError('Projection interval must lie inside the Section domain');
      const candidates: PlanProjectionCandidate[] = [];
      for (let i = planPrimitiveIndexAt(plan, start); i < primitives.length; i += 1) {
        const primitive = primitives[i]!;
        if (primitive.sStart >= end) break;
        const a = Math.max(start, primitive.sStart),
          b = Math.min(end, primitive.sEnd);
        if (!(b > a)) continue;
        candidates.push(
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
        );
      }
      return Object.freeze(candidates);
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
        bestChange = Infinity,
        bestInDomain = false,
        found = false;
      for (let i = planPrimitiveIndexAt(plan, from); i < primitives.length; i += 1) {
        const primitive = primitives[i]!;
        if (primitive.sStart >= to) break;
        const a = Math.max(from, primitive.sStart),
          b = Math.min(to, primitive.sEnd);
        if (!(b > a)) continue;
        projectPlanPrimitiveInterval(primitive, world, a, b, projected, projectionSample);
        reader.domain.lateralAt(projected.s, bounds);
        const inDomain = projected.isFoot && projected.l >= bounds.left && projected.l <= bounds.right;
        if (
          found &&
          ((bestInDomain && !inDomain) ||
            (bestInDomain === inDomain &&
              (inDomain ? projected.distanceSquared >= bestDistance : Math.abs(projected.s - previousS) >= bestChange)))
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
        bestChange = Math.abs(candidate.s - previousS);
        bestInDomain = inDomain;
        found = true;
      }
      if (!found) throw new Error('Admitted Section projection lost its candidates');
      return out;
    },
  });
  return reader;
}
