import { createHash } from 'node:crypto';
import { ENVELOPE_DRIVER } from '../../src/race/envelope-driver.js';
import type { createCourseForkField, DriverIntent } from '../../src/race/course-fork-field.js';
import type { CourseRoute } from '../../src/course/course-route.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';

/** Offline reference policy is part of the reference identity, not vehicle mechanics. */
export const REFERENCE_DRIVER = Object.freeze({ ...ENVELOPE_DRIVER, utilization: 0.9 });

/**
 * The reference driver's one identity: SHA-256 of its record's JSON with sorted keys. Run cache keys, saved
 * reports and report admission all use it.
 */
export const REFERENCE_DRIVER_SHA256 = createHash('sha256')
  .update(JSON.stringify(REFERENCE_DRIVER, Object.keys(REFERENCE_DRIVER).sort()))
  .digest('hex');

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
