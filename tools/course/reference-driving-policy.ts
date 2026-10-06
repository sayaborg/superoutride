import { ENVELOPE_DRIVER } from '../../src/race/envelope-driver.js';
import type { DriverIntent } from '../../src/race/course-fork-field.js';
import { routeSectionS, selectedSuccessor, type CourseRoute } from '../../src/course/course-route.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';

/** The reference driver: the driver policy at the reference utilization, part of the reference run's record. */
export const REFERENCE_DRIVER = Object.freeze({ ...ENVELOPE_DRIVER, utilization: 0.9 });

/**
 * The reference driver's lateral target: the centre lane's centre and, at a fork, the centre of the lane the Link its
 * route takes names. It changes no lanes, so reference runs keep their path whatever traffic the course sees.
 */
export function referenceLine(route: CourseRoute, exit: DriverIntent['exit']): (s: number) => number {
  return (s) => {
    const occurrence = route.at(s)!;
    const section = occurrence.section,
      domain = section.coordinates.domain;
    const at = Math.min(domain.end, Math.max(domain.start, routeSectionS(occurrence, s)));
    const lane = section.fork
      ? (selectedSuccessor(route, occurrence) ?? section.fork.exits[exit(occurrence)]!.link).from.lane
      : section.lanes.center;
    return courseBoundaryAt(lane.center, at) - occurrence.lateralOrigin;
  };
}
