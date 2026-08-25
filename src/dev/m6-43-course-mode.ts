import { compileCourseMode } from '../gameplay/course-mode.js';

/**
 * Current public browser fixture: branching point-to-point with no rivals.
 *
 * BRANCHING product semantics still use FIRST_PHYSICAL_CROSSING_LOCKS and the full 0..16 rival
 * architecture remains tested. The public interactive fixture intentionally has no rival so the
 * player's first physical branch crossing owns the route choice instead of an ahead-of-player DEV
 * rival pre-locking the field and immediately forcing wrong-course recovery.
 */
export const M6_43_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_BRANCHING_PLAYER_ONLY',
  routeKind: 'BRANCHING',
  rivalCount: 0,
});