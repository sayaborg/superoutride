import type { CourseRouteKind } from '../gameplay/course-mode.js';

export type BrowserCourseModeQuery = string;

const COURSE_RUNNERS = Object.freeze({
  LINEAR: 'main-linear.js',
  BRANCHING: 'main.js',
  CIRCUIT: 'main-circuit.js',
} as const);

export interface BrowserCourseModeSelection {
  readonly digitCode?: string;
  readonly numpadCode?: string;
  readonly label: string;
  readonly query: BrowserCourseModeQuery;
  readonly routeKind: CourseRouteKind;
  readonly entryName: typeof COURSE_RUNNERS[CourseRouteKind];
}

export function compileBrowserCourseModes(
  entries: readonly Omit<BrowserCourseModeSelection, 'entryName'>[],
): readonly BrowserCourseModeSelection[] {
  const queries = new Set<string>();
  const keys = new Set<string>();
  return Object.freeze(entries.map(entry => {
    if (typeof entry.query !== 'string' || !entry.query.trim() || entry.query.trim() !== entry.query
      || typeof entry.label !== 'string' || !entry.label.trim()) {
      throw new RangeError('course query and label must be nonempty; query must be trimmed');
    }
    if (queries.has(entry.query)) throw new RangeError(`duplicate course query: ${entry.query}`);
    queries.add(entry.query);
    if (!Object.hasOwn(COURSE_RUNNERS, entry.routeKind)) throw new RangeError('unknown course route kind');
    for (const code of [entry.digitCode, entry.numpadCode]) {
      if (code === undefined) continue;
      if (typeof code !== 'string' || !code.trim() || keys.has(code)) {
        throw new RangeError(`invalid or duplicate course shortcut: ${code}`);
      }
      keys.add(code);
    }
    return Object.freeze({ ...entry, entryName: COURSE_RUNNERS[entry.routeKind] });
  }));
}

export const BROWSER_COURSE_MODES = compileBrowserCourseModes([
  Object.freeze({
    digitCode: 'Digit1',
    numpadCode: 'Numpad1',
    label: 'LINEAR',
    query: 'linear',
    routeKind: 'LINEAR',
  }),
  Object.freeze({
    digitCode: 'Digit2',
    numpadCode: 'Numpad2',
    label: 'BRANCHING',
    query: 'branching',
    routeKind: 'BRANCHING',
  }),
  Object.freeze({
    digitCode: 'Digit3',
    numpadCode: 'Numpad3',
    label: 'TSUKUBA',
    query: 'circuit',
    routeKind: 'CIRCUIT',
  }),
  Object.freeze({
    digitCode: 'Digit4',
    numpadCode: 'Numpad4',
    label: 'FISCO',
    query: 'fisco',
    routeKind: 'CIRCUIT',
  }),
]);

export function formatBrowserCourseSelector(activeQuery: BrowserCourseModeQuery): string {
  return BROWSER_COURSE_MODES
    .map((mode) => (
      `${mode.digitCode === undefined ? '' : `[${mode.digitCode.slice(-1)}] `}${mode.label}${mode.query === activeQuery ? '*' : ''}`
    ))
    .join('  ');
}

export function selectBrowserCourseMode(query: string | null, selections = BROWSER_COURSE_MODES): BrowserCourseModeSelection {
  const selected = selections.find((mode) => mode.query === query)
    ?? selections.find((mode) => mode.query === 'branching');
  if (selected === undefined) throw new RangeError('course selection requires a known query or the branching default');
  return selected;
}

export function browserCourseModeForKey(code: string, selections = BROWSER_COURSE_MODES): BrowserCourseModeSelection | null {
  return selections.find(
    (mode) => mode.digitCode === code || mode.numpadCode === code,
  ) ?? null;
}
