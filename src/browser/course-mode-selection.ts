import type { CourseRouteKind } from '../gameplay/course-mode.js';

export type BrowserCourseModeQuery = 'linear' | 'branching' | 'circuit';

export interface BrowserCourseModeSelection {
  readonly digitCode: 'Digit1' | 'Digit2' | 'Digit3';
  readonly numpadCode: 'Numpad1' | 'Numpad2' | 'Numpad3';
  readonly query: BrowserCourseModeQuery;
  readonly routeKind: CourseRouteKind;
  readonly entryName: 'main-linear.js' | 'main.js' | 'main-circuit.js';
}

export const BROWSER_COURSE_MODES: readonly BrowserCourseModeSelection[] = Object.freeze([
  Object.freeze({
    digitCode: 'Digit1',
    numpadCode: 'Numpad1',
    query: 'linear',
    routeKind: 'LINEAR',
    entryName: 'main-linear.js',
  }),
  Object.freeze({
    digitCode: 'Digit2',
    numpadCode: 'Numpad2',
    query: 'branching',
    routeKind: 'BRANCHING',
    entryName: 'main.js',
  }),
  Object.freeze({
    digitCode: 'Digit3',
    numpadCode: 'Numpad3',
    query: 'circuit',
    routeKind: 'CIRCUIT',
    entryName: 'main-circuit.js',
  }),
]);

export const COURSE_MODE_HOTKEY_LABEL = BROWSER_COURSE_MODES
  .map((mode, index) => `[${index + 1}] ${mode.routeKind}`)
  .join('  ');

export function selectBrowserCourseMode(query: string | null): BrowserCourseModeSelection {
  return BROWSER_COURSE_MODES.find((mode) => mode.query === query)
    ?? BROWSER_COURSE_MODES[1]!;
}

export function browserCourseModeForKey(code: string): BrowserCourseModeSelection | null {
  return BROWSER_COURSE_MODES.find(
    (mode) => mode.digitCode === code || mode.numpadCode === code,
  ) ?? null;
}
