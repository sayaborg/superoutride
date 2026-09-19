import { compileCourseGeometryWindow } from '../course/course-geometry-window.js';
import { courseFailures, courseSuccess, CourseForkQualificationError } from '../course/course-diagnostics.js';
import { compileCourseConsumerDemand } from './course-consumer-demand.js';
import type { CompiledFork, CompiledLink } from './course-graph.js';
import { compileCoursePresentationDomains } from './course-presentation-overlap.js';

const consumers = ['cameraRender', 'groundFilter', 'scenery', 'contact', 'driverLookahead', 'reverseRecovery'] as const;

/** Parent-owned source coverage before choice. No pending successor or inferred guard can supply it. */
export function compileCoursePreLockCoverage(fork: CompiledFork, input: unknown) {
  if (!fork || !fork.section || !Array.isArray(fork.regions))
    throw new TypeError('Pre-lock coverage needs a compiled fork');
  if (fork.section.fork !== fork) throw new RangeError('Pre-lock coverage requires the canonical compiled fork');
  const demand = compileCourseConsumerDemand(input, consumers);
  if (!demand.ok) return demand;
  const { section, lock } = fork;
  const errors: CourseForkQualificationError[] = [];
  const fail = (
    code: ConstructorParameters<typeof CourseForkQualificationError>[0],
    message: string,
    consumer?: string,
  ) => errors.push(new CourseForkQualificationError(code, section.id, message, consumer));
  if (demand.value.pose.ahead !== 0) fail('coverage_gap', 'Pre-lock pose envelope must end at the lock line');
  const commonEnd = Math.min(...fork.regions.map((r) => r.link.source.anchor.s));
  const ranges = demand.value.requirements.map(({ consumer, bounds }) => {
    const start = lock.s - bounds.behind,
      end = lock.s + bounds.ahead;
    if (start < 0 || end > commonEnd)
      fail('coverage_gap', `Parent query [${start}, ${end}] exceeds [0, ${commonEnd}] before selection`, consumer);
    return Object.freeze({ consumer, start, end });
  });
  if (section.presentation === null)
    fail('presentation_missing', 'Pre-lock camera queries require explicit parent presentation');
  else {
    for (const { consumer, bounds } of demand.value.requirements.filter(
      (r) => r.consumer === 'cameraRender' || r.consumer === 'groundFilter' || r.consumer === 'scenery',
    ))
      if (bounds.left > section.presentation.ground.left || bounds.right >= section.presentation.ground.right)
        fail('coverage_gap', 'Closed pre-lock presentation query domain exceeds the half-open parent strip', consumer);
  }
  if (errors.length) return courseFailures<never>(errors);
  const range = Object.freeze({
    sStart: Math.min(...ranges.map((r) => r.start)),
    sEnd: Math.max(...ranges.map((r) => r.end)),
  });
  if (range.sEnd <= range.sStart) {
    fail('invalid_numeric_domain', 'Pre-lock geometry qualification requires a positive longitudinal interval');
    return courseFailures<never>(errors);
  }
  const geometry = compileCourseGeometryWindow(section, range);
  if (!geometry.ok) {
    for (const issue of geometry.diagnostics) fail(issue.code, issue.message);
    return courseFailures<never>(errors);
  }
  return courseSuccess(
    Object.freeze({
      scope: 'pre-lock-query-domain' as const,
      fork,
      commonEnd,
      demand: demand.value,
      ranges: Object.freeze(ranges),
      geometry: geometry.value,
    }),
  );
}

/** Conservative exclusive visible-end bound from the entire matching guard and each full query footprint. */
export function compileCourseExitVisibility(links: readonly CompiledLink[], input: unknown) {
  const result = compileCoursePresentationDomains(links, input);
  if (!result.ok) return result;
  const { demand } = result.value;
  const behind = Math.max(...demand.requirements.map((r) => demand.step.behind + r.footprint.behind));
  const ahead = Math.max(...demand.requirements.map((r) => demand.step.ahead + r.footprint.ahead));
  const exits = links.map((link) =>
    Object.freeze({
      link,
      parentSpecificVisibleEndUpperBound: link.source.anchor.s - link.overlap.behind + behind,
      clearThrough: link.source.anchor.s + link.overlap.ahead - ahead,
    }),
  );
  return courseSuccess(
    Object.freeze({
      scope: 'exit-presentation-domain' as const,
      presentation: result.value,
      exits: Object.freeze(exits),
    }),
  );
}
