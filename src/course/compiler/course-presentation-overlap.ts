import { compareCourseBandOverlap } from './course-band-overlap.js';
import { wrapAngle } from '../../core/math.js';
import { courseSuccess, requireCourse } from '../course-diagnostics.js';
import type { CoursePresentation } from '../course-presentation.js';
import type { CompiledLink, LegacyOverlapLink, CompiledPort } from './course-graph.js';
import { COURSE_LINK_RECIPE, coursePortLateral } from './course-links.js';
import { compileCourseConsumerDemand, type CourseQueryExtent } from './course-consumer-demand.js';
import { courseOverlapHeight } from './course-overlap-domain.js';

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

function sameEnvironment(link: LegacyOverlapLink, as: number, bs: number) {
  const ap = link.from,
    bp = link.to;
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

function groundAndEnvironment(link: LegacyOverlapLink, domain: CourseQueryExtent): void {
  const a = presentation(link.from),
    b = presentation(link.to);
  requireCourse(
    courseOverlapHeight(link.from, link.overlap, '') === courseOverlapHeight(link.to, link.overlap, ''),
    '',
    'Presentation height disagrees',
    'presentation_ground_mismatch',
  );
  const stations = compareCourseBandOverlap(link, a.ground, b.ground, domain);
  for (const delta of stations) sameEnvironment(link, link.from.anchor.s + delta, link.to.anchor.s + delta);
}

function scenery(port: CompiledPort, overlap: LegacyOverlapLink['overlap'], domain: CourseQueryExtent) {
  const result = presentation(port).scenery.flatMap((placement) => {
    const s = placement.anchor.s - port.anchor.s,
      l = placement.l - coursePortLateral(port);
    if (s < -overlap.behind || s > overlap.ahead || l < -domain.left || l > domain.right) return [];
    return [
      {
        instance: placement.instance,
        s,
        l,
        y: port.section.renderHeight.sample(placement.anchor.s).y + placement.groundOffset,
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
  const demand = compileCourseConsumerDemand(input, consumers);
  if (!demand.ok) return demand;
  // Cut lines do not require shared appearance or a presentation overlap guard.
  return courseSuccess(
    Object.freeze({
      scope: 'presentation-query-domain' as const,
      recipe: COURSE_PRESENTATION_OVERLAP_RECIPE,
      links: Object.freeze([...links]),
      demand: demand.value,
    }),
  );
}

// Retained overlap helpers are removed in 6-8b.
void groundAndEnvironment;
void scenery;
