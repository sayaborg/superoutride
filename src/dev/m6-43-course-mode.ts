import { compileCourseMode } from '../gameplay/course-mode.js';

/**
 * Current browser fixture: branching point-to-point with one rival.
 *
 * M6.46 defines the losing-sibling response, so the DEV rival can participate in the same
 * FIRST_PHYSICAL_CROSSING_LOCKS field arbitration again. A forbidden sibling crossing now
 * requests recovery to the already-authorized branch instead of leaving the actor stranded.
 */
export const M6_43_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_BRANCHING_ONE_RIVAL',
  routeKind: 'BRANCHING',
  rivalCount: 1,
});