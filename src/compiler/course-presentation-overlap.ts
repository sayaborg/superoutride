import { compareCourseBandOverlap } from './course-band-overlap.js';
import { wrapAngle } from '../core/math.js';
import {
  CourseInputError,
  CourseQualificationError,
  courseFailures,
  courseSuccess,
  requireCourse,
} from '../course/course-diagnostics.js';
import type { CoursePresentation } from '../visual/course-presentation.js';
import type { CompiledLink, CompiledPort } from './course-graph.js';
import { COURSE_LINK_RECIPE, coursePortLateral } from './course-links.js';
import { compileCourseConsumerDemand, type CourseQueryExtent } from './course-consumer-demand.js';
import { requireCanonicalCourseLinks, courseOverlapHeight } from './course-overlap-domain.js';

const COURSE_PRESENTATION_OVERLAP_RECIPE = Object.freeze({
  id: 'superoutride.presentation-overlap',
  version: 1,
});
const consumers = ['cameraRender', 'groundFilter', 'scenery'] as const;
function at<T extends { readonly anchor: { readonly s: number } }>(profile: readonly T[], s: number): T {
  let index = 0;
  while (index + 1 < profile.length && profile[index + 1]!.anchor.s <= s) index += 1;
  return profile[index]!;
}

function presentation(port: CompiledPort): CoursePresentation {
  const p = port.section.presentation;
  requireCourse(p !== null, '', 'Common content requires explicit saved presentation', 'presentation_missing');
  return p;
}

function sameEnvironment(link: CompiledLink, as: number, bs: number) {
  const ap = link.source,
    bp = link.destination;
  const ae = at(presentation(ap).environments, as),
    be = at(presentation(bp).environments, bs);
  requireCourse(
    ae.name === be.name &&
      ae.background.asset.source === be.background.asset.source &&
      ae.background.horizonY === be.background.horizonY &&
      ae.background.pixelsPerRadian === be.background.pixelsPerRadian &&
      Math.abs(
        wrapAngle(
          ae.background.yawOriginRadians - ap.pose.heading - (be.background.yawOriginRadians - bp.pose.heading),
        ),
      ) <= COURSE_LINK_RECIPE.headingToleranceRadians,
    '',
    'Environment/background or frame-relative pan origin disagrees',
    'presentation_environment_mismatch',
  );
}

function groundAndEnvironment(link: CompiledLink, domain: CourseQueryExtent): void {
  const a = presentation(link.source),
    b = presentation(link.destination);
  requireCourse(
    courseOverlapHeight(link.source, link.overlap, '') === courseOverlapHeight(link.destination, link.overlap, ''),
    '',
    'Presentation height disagrees',
    'presentation_ground_mismatch',
  );
  const stations = compareCourseBandOverlap(link, a.ground, b.ground, domain);
  for (const delta of stations) sameEnvironment(link, link.source.anchor.s + delta, link.destination.anchor.s + delta);
}

function scenery(port: CompiledPort, overlap: CompiledLink['overlap'], domain: CourseQueryExtent) {
  const result = presentation(port).scenery.flatMap((placement) => {
    const s = placement.anchor.s - port.anchor.s,
      l = placement.l - coursePortLateral(port);
    if (s < -overlap.behind || s > overlap.ahead || l < -domain.left || l > domain.right) return [];
    return [
      {
        instance: placement.instance,
        s,
        l,
        y: port.section.height.sampleRender(placement.anchor.s).y + placement.groundOffset,
      },
    ];
  });
  requireCourse(
    new Set(result.map((p) => p.instance)).size === result.length,
    '',
    'A common scenery instance must have one placement in the declared domain',
    'presentation_scenery_mismatch',
  );
  return result;
}

/** Explicit source/filter/anchor query domains only; actual camera containment and runtime readiness are separate. */
export function compileCoursePresentationDomains(links: readonly CompiledLink[], input: unknown) {
  requireCanonicalCourseLinks(links);
  const demand = compileCourseConsumerDemand(input, consumers);
  if (!demand.ok) return demand;
  const errors: CourseQualificationError[] = [];
  for (const [index, link] of links.entries()) {
    const missing = demand.value.requirements.filter(
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
    if (missing.length) continue;
    try {
      const domain = demand.value.bounds;
      groundAndEnvironment(link, domain);
      const as = scenery(link.source, link.overlap, domain),
        bs = scenery(link.destination, link.overlap, domain);
      const destination = new Map(bs.map((p) => [p.instance, p]));
      requireCourse(
        as.length === bs.length &&
          as.every((p) => {
            const q = destination.get(p.instance);
            return q !== undefined && p.s === q.s && p.l === q.l && p.y === q.y;
          }),
        '',
        'Scenery identity or mapped placement disagrees',
        'presentation_scenery_mismatch',
      );
    } catch (error) {
      if (!(error instanceof CourseInputError)) throw error;
      errors.push(new CourseQualificationError(error.diagnostic.code, index, error.message));
    }
  }
  return errors.length
    ? courseFailures<never>(errors)
    : courseSuccess(
        Object.freeze({
          scope: 'presentation-query-domain' as const,
          recipe: COURSE_PRESENTATION_OVERLAP_RECIPE,
          links: Object.freeze([...links]),
          demand: demand.value,
        }),
      );
}
