import { compileCourseMode } from '../../gameplay/course-mode.js';
import { compileSessionConfiguration } from '../../gameplay/session-configuration.js';

/**
 * Focused CIRCUIT fixture: the validated three-lap finite window with one rival.
 *
 * This selects only field cardinality. Final product grid size, placement, AI difficulty and
 * collision behavior remain deliberately unauthorised by this integration fixture.
 */
export const SINGLE_RIVAL_CIRCUIT_MODE = compileCourseMode({
  id: 'DEV_CIRCUIT_THREE_LAP_ONE_RIVAL',
  routeKind: 'CIRCUIT',
});
export const SINGLE_RIVAL_CIRCUIT_SESSION = compileSessionConfiguration({ rivalCount: 1 });
