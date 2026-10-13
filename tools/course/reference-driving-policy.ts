import { PLANNED_DRIVER } from '../../src/race/planned-driver.js';
import type { DriverIntent } from '../../src/race/course-fork-field.js';
import { routeSectionS, selectedSuccessor, type CourseRoute } from '../../src/course/course-route.js';
import type { RacingLines } from '../../src/content/racing-line.js';

/** The reference driver: the driver policy at the reference utilization, part of the reference run's record. */
export const REFERENCE_DRIVER = Object.freeze({ ...PLANNED_DRIVER, utilization: 0.9 });

/**
 * The reference driver's path: the course's racing line and, at a fork, the line toward the Link its route takes. It
 * changes no other lines, so reference runs keep their path whatever traffic the course sees.
 */
export function referenceLine(
  route: CourseRoute,
  lines: RacingLines,
  exit: DriverIntent['exit'],
): (s: number) => number {
  return (s) => {
    const occurrence = route.at(s)!;
    const section = occurrence.section,
      domain = section.coordinates.domain;
    const at = Math.min(domain.end, Math.max(domain.start, routeSectionS(occurrence, s)));
    const link = section.fork
      ? (selectedSuccessor(route, occurrence) ?? section.fork.exits[exit(occurrence)]!.link)
      : null;
    return lines.lateral(section, link, at) - occurrence.lateralOrigin;
  };
}
