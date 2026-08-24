import { compileCourseMode } from '../gameplay/course-mode.js';

/**
 * Current browser fixture: branching point-to-point with no rivals.
 *
 * BRANCHING intentionally keeps FIRST_PHYSICAL_CROSSING_LOCKS as the product rule, but the
 * wrong-branch physical response is still UNDECIDED. A DEV rival must therefore not be allowed
 * to pre-lock a sibling branch before the player until that policy is explicitly authored.
 */
export const M6_43_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_BRANCHING_PLAYER_ONLY',
  routeKind: 'BRANCHING',
  rivalCount: 0,
});