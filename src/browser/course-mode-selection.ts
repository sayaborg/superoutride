import type { CourseRouteKind } from '../gameplay/course-mode.js';

export type BrowserCourseModeQuery = 'linear' | 'branching' | 'circuit' | 'fisco';

export interface BrowserCourseModeSelection {
  readonly digitCode: 'Digit1' | 'Digit2' | 'Digit3' | 'Digit4';
  readonly numpadCode: 'Numpad1' | 'Numpad2' | 'Numpad3' | 'Numpad4';
  readonly label: 'LINEAR' | 'BRANCHING' | 'TSUKUBA' | 'FISCO';
  readonly query: BrowserCourseModeQuery;
  readonly routeKind: CourseRouteKind;
  readonly entryName: 'main-linear.js' | 'main.js' | 'main-circuit.js';
}

export const BROWSER_COURSE_MODES: readonly BrowserCourseModeSelection[] = Object.freeze([
  Object.freeze({
    digitCode: 'Digit1',
    numpadCode: 'Numpad1',
    label: 'LINEAR',
    query: 'linear',
    routeKind: 'LINEAR',
    entryName: 'main-linear.js',
  }),
  Object.freeze({
    digitCode: 'Digit2',
    numpadCode: 'Numpad2',
    label: 'BRANCHING',
    query: 'branching',
    routeKind: 'BRANCHING',
    entryName: 'main.js',
  }),
  Object.freeze({
    digitCode: 'Digit3',
    numpadCode: 'Numpad3',
    label: 'TSUKUBA',
    query: 'circuit',
    routeKind: 'CIRCUIT',
    entryName: 'main-circuit.js',
  }),
  Object.freeze({
    digitCode: 'Digit4',
    numpadCode: 'Numpad4',
    label: 'FISCO',
    query: 'fisco',
    routeKind: 'CIRCUIT',
    entryName: 'main-circuit.js',
  }),
]);

export function formatBrowserCourseSelector(activeQuery: BrowserCourseModeQuery): string {
  return BROWSER_COURSE_MODES
    .map((mode) => (
      `[${mode.digitCode.slice(-1)}] ${mode.label}${mode.query === activeQuery ? '*' : ''}`
    ))
    .join('  ');
}

export function selectBrowserCourseMode(query: string | null): BrowserCourseModeSelection {
  return BROWSER_COURSE_MODES.find((mode) => mode.query === query)
    ?? BROWSER_COURSE_MODES[1]!;
}

export function browserCourseModeForKey(code: string): BrowserCourseModeSelection | null {
  return BROWSER_COURSE_MODES.find(
    (mode) => mode.digitCode === code || mode.numpadCode === code,
  ) ?? null;
}
