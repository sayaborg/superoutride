import { courseBandAt, courseBoundaryAt } from '../course/course-bands.js';
import {
  courseFailures,
  CourseInputError,
  CourseQualificationError,
  courseSuccess,
  requireCourse,
  type CourseResult,
} from '../course/course-diagnostics.js';
import type { CompiledLink, CompiledPort } from './course-graph.js';
import { COURSE_LINK_RECIPE, coursePortLateral } from './course-links.js';
import { compileCourseOverlapStations } from '../course/course-overlap-stations.js';
import { coursePhysicalMaterialAt } from '../course/course-physical-binding.js';
import { SURFACE_MATERIALS } from '../physics/surface-map.js';
import { compileCoursePhysicalDemand } from './course-physical-demand.js';
import { COURSE_PHYSICAL_RECIPE } from './course-physical-content.js';

interface PhysicalOverlapQualification {
  readonly scope: 'physical-overlap';
  readonly links: readonly CompiledLink[];
}

type Demand = Extract<ReturnType<typeof compileCoursePhysicalDemand>, { ok: true }>['value'];
type LateralDomain = Pick<Demand['bounds'], 'left' | 'right'>;

function ruler(port: CompiledPort, overlap: CompiledLink['overlap'], domain?: LateralDomain) {
  const crossings: number[] = [];
  if (domain) {
    const origin = coursePortLateral(port);
    for (const { band } of port.section.physicalBindings)
      for (const boundary of [band.left, band.right]) {
        for (let i = 1; i < boundary.knots.length; i += 1) {
          const a = boundary.knots[i - 1]!,
            b = boundary.knots[i]!;
          const start = Math.max(a.anchor.s, band.start.s, port.anchor.s - overlap.behind);
          const end = Math.min(b.anchor.s, band.end.s, port.anchor.s + overlap.ahead);
          if (end <= start) continue;
          const l0 = courseBoundaryAt(boundary, start) - origin,
            l1 = courseBoundaryAt(boundary, end) - origin;
          for (const edge of [-domain.left, domain.right]) {
            if (!(edge > Math.min(l0, l1) && edge < Math.max(l0, l1))) continue;
            const s = start + (end - start) * ((edge - l0) / (l1 - l0));
            requireCourse(s > start && s < end, '', 'Domain-edge crossing must remain distinct in the source ruler');
            crossings.push(s);
          }
        }
      }
  }
  return {
    seam: port.anchor.s,
    stations: [
      ...crossings,
      ...port.section.physicalBindings.flatMap(({ band, sections }) => [
        band.start.s,
        band.end.s,
        ...[band.left, band.right].flatMap((b) => b.knots.map((k) => k.anchor.s)),
        ...sections.map((s) => s.anchor.s),
      ]),
    ],
  };
}

/** A cell has fixed active bindings/materials and linear edges. Include both closed endpoint limits. */
function regions(port: CompiledPort, start: number, end: number, domain?: LateralDomain) {
  const origin = coursePortLateral(port),
    point = start === end;
  const clip = (l: number) => (domain ? Math.max(-domain.left, Math.min(domain.right, l)) : l);
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
      const left = clip(courseBoundaryAt(band.left, start) - origin),
        right = clip(courseBoundaryAt(band.right, start) - origin);
      const leftEnd = clip(courseBoundaryAt(band.left, end) - origin),
        rightEnd = clip(courseBoundaryAt(band.right, end) - origin);
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

function horizontalHeight(port: CompiledPort, behind: number, ahead: number, path: string): number {
  const start = port.anchor.s - behind,
    end = port.anchor.s + ahead;
  const nodes = port.section.height.nodes;
  for (let i = 1; i < nodes.length; i += 1) {
    const a = nodes[i - 1]!,
      b = nodes[i]!;
    if (a.s < end && b.s > start)
      requireCourse(
        a.y === b.y,
        path,
        'Physical overlap must be horizontal throughout the complete height segments intersecting its guard',
        'nonhorizontal_overlap',
      );
  }
  return port.section.height.samplePhysics(port.anchor.s);
}

function qualify(links: readonly CompiledLink[], demand?: Demand) {
  if (!Array.isArray(links)) throw new TypeError('Qualification requires a canonical Link array');
  if (new Set(links).size !== links.length) throw new RangeError('Qualification Links must be unique');
  const errors: CourseQualificationError[] = [];
  links.forEach((link, index) => {
    if (!link || typeof link !== 'object' || !link.source || !link.destination)
      throw new TypeError('Qualification requires compiled Link objects');
    if (!link.source.section.outgoing.includes(link) || !link.destination.section.incoming.includes(link))
      throw new RangeError('Qualification requires canonical compiled Link references');
    try {
      const path = `/links/${index}/overlap`,
        tolerance = COURSE_LINK_RECIPE.positionToleranceMeters;
      if (demand) {
        const missing = demand.requirements.filter(
          ({ bounds }) => bounds.behind > link.overlap.behind || bounds.ahead > link.overlap.ahead,
        );
        for (const { consumer, bounds } of missing)
          errors.push(
            new CourseQualificationError(
              'coverage_gap',
              index,
              `Required [-${bounds.behind}, ${bounds.ahead}] exceeds common guard [-${link.overlap.behind}, ${link.overlap.ahead}]`,
              consumer,
            ),
          );
        if (missing.length) return;
      }
      const aHeight = horizontalHeight(link.source, link.overlap.behind, link.overlap.ahead, `${path}/source/height`);
      const bHeight = horizontalHeight(
        link.destination,
        link.overlap.behind,
        link.overlap.ahead,
        `${path}/destination/height`,
      );
      requireCourse(
        Math.abs(aHeight - bHeight) <= tolerance,
        `${path}/height`,
        'Source and destination physical height disagree',
        'physical_height_mismatch',
      );
      const domain = demand?.bounds;
      const stations = compileCourseOverlapStations(
        ruler(link.source, link.overlap, domain),
        ruler(link.destination, link.overlap, domain),
        link.overlap,
        path,
      );
      const material = (port: CompiledPort, s: number, l: number) => {
        const band = courseBandAt(port.section.bandPartition, s, l, coursePortLateral(port));
        if (!band) return SURFACE_MATERIALS.VOID;
        const binding = port.section.physicalBindings.find((candidate) => candidate.band === band);
        if (!binding) throw new Error('Compiled Band has no physical binding');
        return coursePhysicalMaterialAt(binding, s);
      };
      const compareEdges = (source: number, destination: number) => {
        if (!domain) return;
        for (const l of [-domain.left, domain.right])
          requireCourse(
            material(link.source, source, l) === material(link.destination, destination, l),
            `${path}/physicalBindings`,
            'Closed lateral-domain edge has different half-open material ownership',
            'physical_support_mismatch',
          );
      };
      const compare = (start: (typeof stations)[number], end: (typeof stations)[number]) => {
        requireCourse(
          start === end || (end.source > start.source && end.destination > start.destination),
          path,
          'Physical overlap cells must remain representable in both rulers',
        );
        const a = regions(link.source, start.source, end.source, domain),
          b = regions(link.destination, start.destination, end.destination, domain);
        requireCourse(
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
          'physical_support_mismatch',
        );
        // Crossings partition every lateral-domain edge into constant-material open cells.
        // One interior witness proves that ownership; exact endpoint ownership is checked separately.
        if (domain && start !== end) {
          const source = start.source + (end.source - start.source) / 2;
          const destination = start.destination + (end.destination - start.destination) / 2;
          requireCourse(
            source > start.source &&
              source < end.source &&
              destination > start.destination &&
              destination < end.destination,
            path,
            'Open overlap cell must have a representable interior witness',
            'invalid_numeric_domain',
          );
          compareEdges(source, destination);
        }
      };
      // Point ownership and the preceding/following open cells are distinct at profile/activation changes.
      stations.forEach((station, i) => {
        compare(station, station);
        compareEdges(station.source, station.destination);
        if (i + 1 < stations.length) compare(station, stations[i + 1]!);
      });
    } catch (error) {
      if (!(error instanceof CourseInputError)) throw error;
      errors.push(new CourseQualificationError(error.diagnostic.code, index, error.message));
    }
  });
  return errors.length ? courseFailures<never>(errors) : courseSuccess(Object.freeze([...links]));
}

/** Whole lateral field proof. A subset certifies only its supplied Links, not the entire course. */
export function compileCoursePhysicalOverlaps(
  links: readonly CompiledLink[],
): CourseResult<PhysicalOverlapQualification> {
  const result = qualify(links);
  return result.ok ? courseSuccess(Object.freeze({ scope: 'physical-overlap', links: result.value })) : result;
}

/** Declared physical query coverage only; never a picture, product-envelope or runtime-readiness certificate. */
export function compileCoursePhysicalDomains(links: readonly CompiledLink[], input: unknown) {
  const demand = compileCoursePhysicalDemand(input);
  if (!demand.ok) return demand;
  const result = qualify(links, demand.value);
  return result.ok
    ? courseSuccess(
        Object.freeze({
          scope: 'physical-query-domain' as const,
          recipe: COURSE_PHYSICAL_RECIPE.overlap,
          links: result.value,
          demand: demand.value,
        }),
      )
    : result;
}
