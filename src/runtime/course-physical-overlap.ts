import { courseBoundaryAt } from '../course/course-bands.js';
import { courseFailure, CourseInputError, courseSuccess, type CourseResult } from '../course/course-diagnostics.js';
import type { CompiledLink, CompiledPort } from '../course/course-graph.js';
import { COURSE_LINK_RECIPE, coursePortLateral } from '../course/course-links.js';
import { compileCourseOverlapStations } from '../course/course-overlap-stations.js';
import { coursePhysicalMaterialAt } from '../course/course-physical-binding.js';
import type { SurfaceMaterial } from '../physics/surface-map.js';

interface PhysicalOverlapQualification {
  readonly scope: 'physical-overlap';
  readonly links: readonly CompiledLink<SurfaceMaterial>[];
}

function requireAgreement(condition: boolean, path: string, message: string): asserts condition {
  if (!condition) throw new CourseInputError('semantic_compile_failure', path, message);
}

function ruler(port: CompiledPort<SurfaceMaterial>) {
  return {
    seam: port.anchor.s,
    stations: port.section.physicalBindings.flatMap(({ band, sections }) => [
      band.start.s,
      band.end.s,
      ...[band.left, band.right].flatMap((b) => b.knots.map((k) => k.anchor.s)),
      ...sections.map((s) => s.anchor.s),
    ]),
  };
}

/** A cell has fixed active bindings/materials and linear edges. Include both closed endpoint limits. */
function regions(port: CompiledPort<SurfaceMaterial>, start: number, end: number) {
  const origin = coursePortLateral(port),
    point = start === end;
  const result = port.section.physicalBindings
    .flatMap((binding) => {
      const band = binding.band;
      if (
        band.start.s > start ||
        band.end.s < end ||
        (point && start === band.end.s && start !== port.section.bandPartition.length)
      )
        return [];
      const material = coursePhysicalMaterialAt(binding, start);
      if (!material.supported) return [];
      const left = courseBoundaryAt(band.left, start) - origin,
        right = courseBoundaryAt(band.right, start) - origin;
      const leftEnd = courseBoundaryAt(band.left, end) - origin,
        rightEnd = courseBoundaryAt(band.right, end) - origin;
      if (left === right && leftEnd === rightEnd) return [];
      return [{ left, right, leftEnd, rightEnd, material }];
    })
    .sort((a, b) => a.left + a.leftEnd - (b.left + b.leftEnd));
  const merged: typeof result = [];
  for (const region of result) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.material === region.material &&
      previous.right === region.left &&
      previous.rightEnd === region.leftEnd
    ) {
      previous.right = region.right;
      previous.rightEnd = region.rightEnd;
    } else merged.push(region);
  }
  return merged;
}

function horizontalHeight(port: CompiledPort<SurfaceMaterial>, behind: number, ahead: number, path: string): number {
  const start = port.anchor.s - behind,
    end = port.anchor.s + ahead;
  const nodes = port.section.height.nodes;
  for (let i = 1; i < nodes.length; i += 1) {
    const a = nodes[i - 1]!,
      b = nodes[i]!;
    if (a.s < end && b.s > start)
      requireAgreement(
        a.y === b.y,
        path,
        'Physical overlap must be horizontal throughout the complete height segments intersecting its guard',
      );
  }
  return port.section.height.samplePhysics(port.anchor.s);
}

/** All supplied canonical Links, including every incoming merge Link. No presentation/coverage readiness claim. */
export function compileCoursePhysicalOverlaps(
  links: readonly CompiledLink<SurfaceMaterial>[],
): CourseResult<PhysicalOverlapQualification> {
  try {
    links.forEach((link, index) => {
      const path = `/links/${index}/overlap`,
        tolerance = COURSE_LINK_RECIPE.positionToleranceMeters;
      const aHeight = horizontalHeight(link.source, link.overlap.behind, link.overlap.ahead, `${path}/source/height`);
      const bHeight = horizontalHeight(
        link.destination,
        link.overlap.behind,
        link.overlap.ahead,
        `${path}/destination/height`,
      );
      requireAgreement(
        Math.abs(aHeight - bHeight) <= tolerance,
        `${path}/height`,
        'Source and destination physical height disagree',
      );
      const stations = compileCourseOverlapStations(ruler(link.source), ruler(link.destination), link.overlap, path);
      const compare = (start: (typeof stations)[number], end: (typeof stations)[number]) => {
        requireAgreement(
          start === end || (end.source > start.source && end.destination > start.destination),
          path,
          'Physical overlap cells must remain representable in both rulers',
        );
        const a = regions(link.source, start.source, end.source),
          b = regions(link.destination, start.destination, end.destination);
        requireAgreement(
          a.length === b.length &&
            a.every((region, i) => {
              const other = b[i]!;
              return (
                region.material === other.material &&
                (['left', 'right', 'leftEnd', 'rightEnd'] as const).every(
                  (key) => Math.abs(region[key] - other[key]) <= tolerance,
                )
              );
            }),
          `${path}/physicalBindings`,
          `Physical support/material field disagrees over delta [${start.delta}, ${end.delta}]`,
        );
      };
      // Point ownership and the preceding/following open cells are distinct at profile/activation changes.
      stations.forEach((station, i) => {
        compare(station, station);
        if (i + 1 < stations.length) compare(station, stations[i + 1]!);
      });
    });
    return courseSuccess(Object.freeze({ scope: 'physical-overlap', links: Object.freeze([...links]) }));
  } catch (error) {
    if (error instanceof CourseInputError) return courseFailure(error);
    throw error;
  }
}
