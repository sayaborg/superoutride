import { ENVELOPE_DRIVER } from '../../src/race/envelope-driver.js';
import type { createCourseForkField, DriverIntent } from '../../src/race/course-fork-field.js';
import type { CourseRoute } from '../../src/course/course-route.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';

/** The reference driver: the driver policy at the reference utilization, part of the reference run's record. */
export const REFERENCE_DRIVER = Object.freeze({ ...ENVELOPE_DRIVER, utilization: 0.9 });

/**
 * The reference driver's lateral target: the fixed lateral line `l` off forks and, at a fork, the centre of the
 * Carriageway its target exit follows (the fork field's `targetCarriageway`). It follows no lanes, so reference runs keep
 * their path whatever lanes the course declares.
 */
export function referenceLine(
  forks: Pick<ReturnType<typeof createCourseForkField>, 'targetCarriageway'>,
  route: CourseRoute,
  l: number,
  exit: DriverIntent['exit'],
): (s: number) => number {
  return (s) => {
    const occurrence = route.at(s)!;
    if (!occurrence.section.fork)
      return l + (occurrence.incoming ? occurrence.incoming.to.lateralOrigin - occurrence.lateralOrigin : 0);
    const { road, at } = forks.targetCarriageway(s, exit);
    return (courseBoundaryAt(road.left, at) + courseBoundaryAt(road.right, at)) / 2 - occurrence.lateralOrigin;
  };
}
