import { compileCourseMode } from '../gameplay/course-mode.js';

/**
 * BRANCHING course-debug composition.
 *
 * FIRST_PHYSICAL_CROSSING_LOCKS remains the route rule, but no rival is spawned ahead of the
 * player. The player can therefore validate either physical child road without an earlier DEV
 * actor forcing wrong-branch recovery and making the handoff look stalled.
 */
export const M8_3_BRANCHING_COURSE_MODE = compileCourseMode({
  id: 'DEV_BRANCHING_PLAYER_ROUTE_DEBUG',
  routeKind: 'BRANCHING',
  rivalCount: 0,
});
