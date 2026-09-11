import { compileCourseMode } from '../../gameplay/course-mode.js';
import { compileSessionConfiguration } from '../../gameplay/session-configuration.js';

/**
 * Focused route fixture: branching point-to-point with one rival.
 *
 * The rival remains an ordinary physical actor under FIRST_PHYSICAL_CROSSING_LOCKS. The first
 * route gate is placed far enough into the fully separated child roads for the deterministic DEV
 * driver to physically occupy its intended branch before arbitration; no route choice is granted
 * from AI intent alone.
 */
export const SINGLE_RIVAL_BRANCHING_MODE = compileCourseMode({
  id: 'DEV_BRANCHING_ONE_RIVAL',
  routeKind: 'BRANCHING',
});
export const SINGLE_RIVAL_BRANCHING_SESSION = compileSessionConfiguration({ rivalCount: 1 });
