import { courseBandAt } from '../course/course-bands.js';
import {
  courseFailures,
  CourseInputError,
  CourseQualificationError,
  courseSuccess,
  requireCourse,
} from '../course/course-diagnostics.js';
import type { CompiledLink, CompiledPort } from './course-graph.js';
import { COURSE_LINK_RECIPE, coursePortLateral } from './course-links.js';
import { compileCourseOverlapStations } from '../course/course-overlap-stations.js';
import { coursePhysicalMaterialAt } from '../course/course-physical-binding.js';
import { SURFACE_MATERIALS } from '../physics/surface-map.js';
import { compileCoursePhysicalDemand } from './course-physical-demand.js';
import { COURSE_PHYSICAL_RECIPE } from './course-physical-content.js';
import {
  requireCanonicalCourseLinks,
  courseOverlapRuler,
  courseOverlapBandRegions,
  courseOverlapHeight,
} from './course-overlap-domain.js';

type Demand = Extract<ReturnType<typeof compileCoursePhysicalDemand>, { ok: true }>['value'];
type LateralDomain = Pick<Demand['bounds'], 'left' | 'right'>;

function ruler(port: CompiledPort, overlap: CompiledLink['overlap'], domain?: LateralDomain) {
  return courseOverlapRuler(
    port,
    overlap,
    domain,
    port.section.physicalBindings.flatMap(({ sections }) => sections.map((s) => s.anchor.s)),
  );
}

/** Geometry cells are shared; supported material equality belongs to the physical proof. */
function regions(port: CompiledPort, start: number, end: number, domain?: LateralDomain) {
  const result = courseOverlapBandRegions(port, start, end, domain).flatMap(({ band, ...edges }) => {
    const binding = port.section.physicalBindings.find((binding) => binding.band === band);
    if (!binding) throw new Error('Compiled Band has no physical binding');
    const material = coursePhysicalMaterialAt(binding, start);
    return material.supported ? [{ ...edges, material }] : [];
  });
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

function qualify(links: readonly CompiledLink[], demand: Demand) {
  requireCanonicalCourseLinks(links);
  const errors: CourseQualificationError[] = [];
  links.forEach((link, index) => {
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
      const aHeight = courseOverlapHeight(link.source, link.overlap, `${path}/source/height`);
      const bHeight = courseOverlapHeight(link.destination, link.overlap, `${path}/destination/height`);
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
          'unrepresentable_overlap',
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
