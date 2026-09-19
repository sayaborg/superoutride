import type { GuideEnvelope } from '../core/guide-envelope.js';
import { tangentFromHeading, type Vec2 } from '../core/math.js';
import type { RasterPath } from '../core/raster-path.js';
import { COURSE_DOCUMENT_LIMITS } from './course-document.js';
import { CourseInputError, requireCourse } from './course-diagnostics.js';
import {
  courseBoundaryAt,
  type CompiledBand,
  type CompiledBandPartition,
  type CompiledCarriageway,
} from './course-bands.js';

function cross(a: Vec2, b: Vec2): number {
  return a.x * b.z - a.z * b.x;
}
function unionAt(bands: readonly CompiledBand[], s: number): [number, number][] {
  const result: [number, number][] = [];
  for (const band of bands) {
    const left = courseBoundaryAt(band.left, s),
      right = courseBoundaryAt(band.right, s);
    if (left === right) continue;
    const previous = result.at(-1);
    if (previous && previous[1] === left) previous[1] = right;
    else result.push([left, right]);
  }
  return result;
}

function sameUnion(a: readonly CompiledBand[], b: readonly CompiledBand[], s: number): boolean {
  const left = unionAt(a, s),
    right = unionAt(b, s);
  return (
    left.length === right.length && left.every((range, i) => range[0] === right[i]![0] && range[1] === right[i]![1])
  );
}

/** Prove each active strip and its transitions; construction cells never become an independent public authority. */
export function compileCourseBandGeometry(
  raster: RasterPath,
  bands: readonly CompiledBand[],
  carriageways: readonly CompiledCarriageway[],
  margin: number,
  sectionPath: string,
): { readonly partition: CompiledBandPartition; readonly envelope: GuideEnvelope } {
  const path = `${sectionPath}/bands`;
  const boundaries = [...new Set(bands.flatMap((band) => [band.left, band.right]))];
  const stations = [
    ...new Set([
      ...raster.vertexS,
      ...boundaries.flatMap((b) => b.knots.map((k) => k.anchor.s)),
      ...bands.flatMap((b) => [b.start.s, b.end.s]),
    ]),
  ].sort((a, b) => a - b);
  if (stations.length - 1 > COURSE_DOCUMENT_LIMITS.bandCells)
    throw new CourseInputError(
      'resource_limit',
      path,
      `Mapped band partition exceeds ${COURSE_DOCUMENT_LIMITS.bandCells} cells`,
    );
  const spans = stations.slice(0, -1).map((sStart, index) => {
    const sEnd = stations[index + 1]!;
    const ordered = bands
      .filter((band) => band.start.s <= sStart && band.end.s >= sEnd)
      .sort(
        (a, b) =>
          courseBoundaryAt(a.left, sStart) +
          courseBoundaryAt(a.left, sEnd) -
          (courseBoundaryAt(b.left, sStart) + courseBoundaryAt(b.left, sEnd)),
      );
    requireCourse(
      ordered.length > 0,
      path,
      `Section requires active Bands throughout [${sStart}, ${sEnd}]`,
      'band_coverage_gap',
    );
    for (const s of [sStart, sEnd]) {
      for (let i = 0; i < ordered.length; i += 1) {
        const band = ordered[i]!;
        const left = courseBoundaryAt(band.left, s),
          right = courseBoundaryAt(band.right, s);
        requireCourse(
          right > left || (right === left && (s === band.start.s || s === band.end.s)),
          path,
          `Band ${JSON.stringify(band.id)} needs positive width except at its birth/death endpoint; s=${s}`,
          'invalid_band_width',
        );
        if (i > 0) {
          const previous = ordered[i - 1]!;
          const edge = courseBoundaryAt(previous.right, s);
          requireCourse(
            edge <= left,
            path,
            `Bands ${JSON.stringify(previous.id)} and ${JSON.stringify(band.id)} overlap at s=${s}`,
            'band_overlap',
          );
          const endpoint = s === band.start.s || s === band.end.s || s === previous.start.s || s === previous.end.s;
          requireCourse(
            edge !== left || previous.right === band.left || endpoint,
            path,
            `Adjacent Bands must reference the same canonical shared Boundary at s=${s}`,
            'shared_boundary_required',
          );
        }
      }
    }
    for (let i = 0; i < ordered.length; i += 1) {
      const band = ordered[i]!;
      requireCourse(
        courseBoundaryAt(band.right, sStart) -
          courseBoundaryAt(band.left, sStart) +
          (courseBoundaryAt(band.right, sEnd) - courseBoundaryAt(band.left, sEnd)) >
          0,
        path,
        `Band ${JSON.stringify(band.id)} has zero width throughout [${sStart}, ${sEnd}]`,
        'invalid_band_width',
      );
      if (i > 0) {
        const previous = ordered[i - 1]!;
        requireCourse(
          previous.right === band.left ||
            [sStart, sEnd].some((s) => courseBoundaryAt(previous.right, s) !== courseBoundaryAt(band.left, s)),
          path,
          'Adjacent Bands must reference the same canonical shared Boundary',
          'shared_boundary_required',
        );
      }
    }
    carriageways.forEach((carriageway, i) => {
      const members = ordered.filter((band) => carriageway.bands.includes(band));
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
      `Active Band union must be continuous at s=${s}`,
      'band_transition_discontinuity',
    );
    requireCourse(
      sameUnion(
        before.filter((b) => b.role !== 'shoulder'),
        after.filter((b) => b.role !== 'shoulder'),
        s,
      ),
      path,
      `Pavement/median union must be continuous at s=${s}`,
      'band_transition_discontinuity',
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
          `Mapped band envelope inverts on Raster segment ${segmentIndex} at s=${s}`,
          'mapped_band_inversion',
        );
      }
    }
  }
  return Object.freeze({
    partition: Object.freeze({ raster, length: raster.length, bands: Object.freeze([...bands]) }),
    envelope: Object.freeze(envelope),
  });
}
