import { compileCourseMode } from '../gameplay/course-mode.js';

/**
 * Current public CIRCUIT DEV composition: the validated three-lap finite window with one rival.
 *
 * This selects only field cardinality. Final product grid size, placement, AI difficulty and
 * collision behavior remain deliberately unauthorised by this integration fixture.
 */
export const M6_54_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_CIRCUIT_THREE_LAP_ONE_RIVAL',
  routeKind: 'CIRCUIT',
  rivalCount: 1,
});
