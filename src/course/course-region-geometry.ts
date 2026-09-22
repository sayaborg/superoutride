import type { GuideEnvelope } from './geometry/guide-envelope.js';
import { tangentFromHeading, type Vec2 } from '../core/math.js';
import type { RasterPath } from './geometry/raster-path.js';
import { COURSE_DOCUMENT_LIMITS } from './course-document.js';
import { CourseInputError, requireCourse } from './course-diagnostics.js';
import {
  courseBoundaryAt,
  type CompiledRegion,
  type CompiledRegionPartition,
  type CompiledCarriageway,
} from './course-regions.js';

function cross(a: Vec2, b: Vec2): number {
  return a.x * b.z - a.z * b.x;
}
function unionAt(regions: readonly CompiledRegion[], s: number): [number, number][] {
  const result: [number, number][] = [];
  for (const region of regions) {
    const left = courseBoundaryAt(region.left, s),
      right = courseBoundaryAt(region.right, s);
    if (left === right) continue;
    const previous = result.at(-1);
    if (previous && previous[1] === left) previous[1] = right;
    else result.push([left, right]);
  }
  return result;
}

function sameUnion(a: readonly CompiledRegion[], b: readonly CompiledRegion[], s: number): boolean {
  const left = unionAt(a, s),
    right = unionAt(b, s);
  return (
    left.length === right.length && left.every((range, i) => range[0] === right[i]![0] && range[1] === right[i]![1])
  );
}

/** Prove each active strip and its transitions; construction cells never become an independent public authority. */
export function compileCourseRegionGeometry(
  raster: RasterPath,
  regions: readonly CompiledRegion[],
  carriageways: readonly CompiledCarriageway[],
  margin: number,
  sectionPath: string,
): { readonly partition: CompiledRegionPartition; readonly envelope: GuideEnvelope } {
  const path = `${sectionPath}/regions`;
  const boundaries = [...new Set(regions.flatMap((region) => [region.left, region.right]))];
  const stations = [
    ...new Set([
      ...raster.vertexS,
      ...boundaries.flatMap((b) => b.knots.map((k) => k.anchor.s)),
      ...regions.flatMap((b) => [b.start.s, b.end.s]),
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
        const left = courseBoundaryAt(region.left, s),
          right = courseBoundaryAt(region.right, s);
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
    const before = spans[i - 1]!.ordered,
      after = spans[i]!.ordered,
      s = spans[i]!.sStart;
    requireCourse(
      sameUnion(before, after, s),
      path,
      `Active Region union must be continuous at s=${s}`,
      'region_transition_discontinuity',
    );
    requireCourse(
      sameUnion(
        before.filter((b) => b.role !== 'shoulder'),
        after.filter((b) => b.role !== 'shoulder'),
        s,
      ),
      path,
      `Pavement/median union must be continuous at s=${s}`,
      'region_transition_discontinuity',
    );
  }
  const envelope = stations.map((s, i) => {
    // Include both closed sides of a transition, including zero-area birth/death points.
    const incident = [...(spans[i - 1]?.ordered ?? []), ...(spans[i]?.ordered ?? [])];
    const extent = Math.max(
      ...incident.flatMap((b) => [Math.abs(courseBoundaryAt(b.left, s)), Math.abs(courseBoundaryAt(b.right, s))]),
    );
    return Object.freeze({ s, lMax: extent + margin });
  });
  let segmentIndex = 0;
  for (const { sStart, sEnd, ordered } of spans) {
    while (segmentIndex + 1 < raster.segments.length && raster.vertexS[segmentIndex + 1]! <= sStart) segmentIndex += 1;
    const segment = raster.segments[segmentIndex]!;
    const a = raster.vertexMiters[segment.startVertexIndex]!,
      b = raster.vertexMiters[segment.endVertexIndex]!;
    const derivative = { x: (b.x - a.x) / segment.length, z: (b.z - a.z) / segment.length };
    const tangent = tangentFromHeading(segment.heading);
    for (const boundary of [ordered[0]!.left, ordered.at(-1)!.right]) {
      const l0 = courseBoundaryAt(boundary, sStart),
        l1 = courseBoundaryAt(boundary, sEnd);
      for (const [s, l] of [
        [sStart, l0],
        [sEnd, l1],
      ] as const) {
        const t = (s - segment.sStart) / segment.length;
        const m = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        // The Raster map's Jacobian is affine in (s,l); linear edges need only these extrema.
        requireCourse(
          cross(m, tangent) + l * cross(m, derivative) > 0,
          path,
          `Mapped region envelope inverts on Raster segment ${segmentIndex} at s=${s}`,
          'mapped_region_inversion',
        );
      }
    }
  }
  return Object.freeze({
    partition: Object.freeze({ raster, length: raster.length, regions: Object.freeze([...regions]) }),
    envelope: Object.freeze(envelope),
  });
}
