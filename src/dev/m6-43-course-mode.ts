import { compileCourseMode } from '../gameplay/course-mode.js';

/** Current browser fixture: branching point-to-point with one rival. */
export const M6_43_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_BRANCHING_1_RIVAL',
  routeKind: 'BRANCHING',
  rivalCount: 1,
});
