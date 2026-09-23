import type { Writable } from '../core/writable.js';
import type { RasterPath } from './geometry/raster-path.js';
import { COURSE_DOCUMENT_LIMITS } from './course-document.js';
import { CourseInputError, requireCourse } from './course-diagnostics.js';
import type { CompiledPlanPrimitive } from './geometry/plan-path.js';
import {
  courseBoundaryAt,
  type CompiledRegion,
  type CompiledRegionPartition,
  type CompiledCarriageway,
} from './course-regions.js';

export const PLAN_COORDINATE_MARGIN_METERS = 4;

export interface CompiledPlanLateralDomain {
  readonly stations: readonly number[];
  lateralAt(s: number, out: Writable<{ left: number; right: number }>): { left: number; right: number };
}

function unionAt(regions: readonly CompiledRegion[], s: number): [number, number][] {
  const result: [number, number][] = [];
  for (const region of regions) {
    const left = courseBoundaryAt(region.left, s);
    const right = courseBoundaryAt(region.right, s);
    if (left === right) continue;
    const previous = result.at(-1);
    if (previous && previous[1] === left) previous[1] = right;
    else result.push([left, right]);
  }
  return result;
}

function sameUnion(a: readonly CompiledRegion[], b: readonly CompiledRegion[], s: number): boolean {
  const left = unionAt(a, s);
  const right = unionAt(b, s);
  return left.length === right.length && left.every((range, i) => range[0] === right[i]![0] && range[1] === right[i]![1]);
}

function lateralDomain(regions: readonly CompiledRegion[], stations: readonly number[]): CompiledPlanLateralDomain {
  const start = stations[0]!;
  const end = stations.at(-1)!;
  return Object.freeze({
    stations: Object.freeze([...stations]),
    lateralAt(s: number, out: Writable<{ left: number; right: number }>) {
      if (!Number.isFinite(s) || s < start || s > end) throw new RangeError('Plan lateral domain query is outside the Section');
      const active = regions.filter((region) => region.start.s <= s && region.end.s >= s);
      if (!active.length) throw new Error('Admitted Region partition lost coordinate-domain coverage');
      out.left =
        Math.min(...active.map((region) => courseBoundaryAt(region.left, s))) - PLAN_COORDINATE_MARGIN_METERS;
      out.right =
        Math.max(...active.map((region) => courseBoundaryAt(region.right, s))) + PLAN_COORDINATE_MARGIN_METERS;
      return out;
    },
  });
}

function validatePlanMetric(
  sectionId: string,
  primitives: readonly CompiledPlanPrimitive[],
  domain: CompiledPlanLateralDomain,
  sectionPath: string,
): void {
  const bounds = { left: 0, right: 0 };
  for (const primitive of primitives) {
    if (primitive.curvature === 0) continue;
    const stations = [
      primitive.sStart,
      ...domain.stations.filter((s) => s > primitive.sStart && s < primitive.sEnd),
      primitive.sEnd,
    ];
    for (const s of stations) {
      domain.lateralAt(s, bounds);
      const l = primitive.curvature > 0 ? bounds.right : bounds.left;
      const metric = 1 - primitive.curvature * l;
      requireCourse(
        metric > 0,
        `${sectionPath}/primitives/${primitive.index}`,
        `Section ${JSON.stringify(sectionId)} primitive ${JSON.stringify(primitive.source.id)} has 1 - kappa*l <= 0 at s=${s}`,
        'plan_coordinate_inversion',
      );
    }
  }
}

/** Prove structural Region relationships and derive the physical coordinate domain. */
export function compileCourseRegionGeometry(
  sectionId: string,
  raster: RasterPath,
  primitives: readonly CompiledPlanPrimitive[],
  regions: readonly CompiledRegion[],
  carriageways: readonly CompiledCarriageway[],
  sectionPath: string,
): { readonly partition: CompiledRegionPartition; readonly lateralDomain: CompiledPlanLateralDomain } {
  const path = `${sectionPath}/regions`;
  const boundaries = [...new Set(regions.flatMap((region) => [region.left, region.right]))];
  const stations = [
    ...new Set([
      0,
      raster.length,
      ...boundaries.flatMap((boundary) => boundary.knots.map((knot) => knot.anchor.s)),
      ...regions.flatMap((region) => [region.start.s, region.end.s]),
    ]),
  ].sort((a, b) => a - b);
  if (stations.length - 1 > COURSE_DOCUMENT_LIMITS.regionCells)
    throw new CourseInputError(
      'resource_limit',
      path,
      `Mapped region partition exceeds ${COURSE_DOCUMENT_LIMITS.regionCells} cells`,
    );
  const spans = stations.slice(0, -1).map((sStart, index) => {
    const sEnd = stations[index + 1]!;
    const ordered = regions
      .filter((region) => region.start.s <= sStart && region.end.s >= sEnd)
      .sort(
        (a, b) =>
          courseBoundaryAt(a.left, sStart) +
          courseBoundaryAt(a.left, sEnd) -
          (courseBoundaryAt(b.left, sStart) + courseBoundaryAt(b.left, sEnd)),
      );
    requireCourse(
      ordered.length > 0,
      path,
      `Section requires active Regions throughout [${sStart}, ${sEnd}]`,
      'region_coverage_gap',
    );
    for (const s of [sStart, sEnd]) {
      for (let i = 0; i < ordered.length; i += 1) {
        const region = ordered[i]!;
        const left = courseBoundaryAt(region.left, s);
        const right = courseBoundaryAt(region.right, s);
        requireCourse(
          right > left || (right === left && (s === region.start.s || s === region.end.s)),
          path,
          `Region ${JSON.stringify(region.id)} needs positive width except at its birth/death endpoint; s=${s}`,
          'invalid_region_width',
        );
        if (i > 0) {
          const previous = ordered[i - 1]!;
          const edge = courseBoundaryAt(previous.right, s);
          requireCourse(
            edge <= left,
            path,
            `Regions ${JSON.stringify(previous.id)} and ${JSON.stringify(region.id)} overlap at s=${s}`,
            'region_overlap',
          );
          const endpoint = s === region.start.s || s === region.end.s || s === previous.start.s || s === previous.end.s;
          requireCourse(
            edge !== left || previous.right === region.left || endpoint,
            path,
            `Adjacent Regions must reference the same canonical shared Boundary at s=${s}`,
            'shared_boundary_required',
          );
        }
      }
    }
    for (let i = 0; i < ordered.length; i += 1) {
      const region = ordered[i]!;
      requireCourse(
        courseBoundaryAt(region.right, sStart) -
          courseBoundaryAt(region.left, sStart) +
          (courseBoundaryAt(region.right, sEnd) - courseBoundaryAt(region.left, sEnd)) >
          0,
        path,
        `Region ${JSON.stringify(region.id)} has zero width throughout [${sStart}, ${sEnd}]`,
        'invalid_region_width',
      );
      if (i > 0) {
        const previous = ordered[i - 1]!;
        requireCourse(
          previous.right === region.left ||
            [sStart, sEnd].some((s) => courseBoundaryAt(previous.right, s) !== courseBoundaryAt(region.left, s)),
          path,
          'Adjacent Regions must reference the same canonical shared Boundary',
          'shared_boundary_required',
        );
      }
    }
    carriageways.forEach((carriageway, i) => {
      const members = ordered.filter((region) => carriageway.regions.includes(region));
      for (let j = 1; j < members.length; j += 1)
        requireCourse(
          members[j - 1]!.right === members[j]!.left,
          `${sectionPath}/carriageways/${i}`,
          `Carriageway ${JSON.stringify(carriageway.id)} must be contiguous throughout [${sStart}, ${sEnd}]`,
          'invalid_carriageway',
        );
    });
    return { sStart, sEnd, ordered };
  });
  for (let i = 1; i < spans.length; i += 1) {
    const before = spans[i - 1]!.ordered;
    const after = spans[i]!.ordered;
    const s = spans[i]!.sStart;
    requireCourse(
      sameUnion(before, after, s),
      path,
      `Active Region union must be continuous at s=${s}`,
      'region_transition_discontinuity',
    );
    requireCourse(
      sameUnion(
        before.filter((region) => region.role !== 'shoulder'),
        after.filter((region) => region.role !== 'shoulder'),
        s,
      ),
      path,
      `Pavement/median union must be continuous at s=${s}`,
      'region_transition_discontinuity',
    );
  }
  const domain = lateralDomain(regions, stations);
  validatePlanMetric(sectionId, primitives, domain, sectionPath);
  return Object.freeze({
    partition: Object.freeze({ raster, length: raster.length, regions: Object.freeze([...regions]) }),
    lateralDomain: domain,
  });
}
