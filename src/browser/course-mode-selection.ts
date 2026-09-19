import { BROWSER_COURSE_KEYS } from './key-bindings.js';

export type BrowserCourseModeQuery = string;

export interface BrowserCourseModeSelection {
  readonly digitCode?: string;
  readonly numpadCode?: string;
  readonly label: string;
  readonly query: BrowserCourseModeQuery;
  readonly entryName: 'main-course.js';
}

/** The first saved course is the default; every selection uses the shared product root. */
export function compileBrowserCourseModes(
  entries: readonly Omit<BrowserCourseModeSelection, 'entryName'>[],
): readonly BrowserCourseModeSelection[] {
  const queries = new Set<string>(),
    keys = new Set<string>();
  if (entries.length === 0) throw new RangeError('At least one course is required');
  return Object.freeze(
    entries.map((entry) => {
      if (
        typeof entry.query !== 'string' ||
        !entry.query.trim() ||
        entry.query.trim() !== entry.query ||
        typeof entry.label !== 'string' ||
        !entry.label.trim()
      )
        throw new RangeError('course query and label must be nonempty; query must be trimmed');
      if (queries.has(entry.query)) throw new RangeError(`duplicate course query: ${entry.query}`);
      queries.add(entry.query);
      for (const code of [entry.digitCode, entry.numpadCode]) {
        if (code === undefined) continue;
        if (typeof code !== 'string' || !code.trim() || keys.has(code))
          throw new RangeError(`invalid or duplicate course shortcut: ${code}`);
        keys.add(code);
      }
      return Object.freeze({ ...entry, entryName: 'main-course.js' as const });
    }),
  );
}

export const BROWSER_COURSE_MODES = compileBrowserCourseModes([
  { ...BROWSER_COURSE_KEYS.linear, label: 'LINEAR', query: 'linear' },
  { digitCode: 'Digit2', numpadCode: 'Numpad2', label: 'SEAM', query: 'seam' },
  { digitCode: 'Digit3', numpadCode: 'Numpad3', label: 'CIRCUIT', query: 'circuit' },
  { digitCode: 'Digit4', numpadCode: 'Numpad4', label: 'BRANCH', query: 'branch' },
]);

export function formatBrowserCourseSelector(activeQuery: BrowserCourseModeQuery): string {
  return BROWSER_COURSE_MODES.map(
    (mode) =>
      `${mode.digitCode === undefined ? '' : `[${mode.digitCode.slice(-1)}] `}${mode.label}${mode.query === activeQuery ? '*' : ''}`,
  ).join('  ');
}

export function selectBrowserCourseMode(
  query: string | null,
  selections: readonly BrowserCourseModeSelection[] = BROWSER_COURSE_MODES,
): BrowserCourseModeSelection {
  const selected = selections.find((mode) => mode.query === query) ?? selections[0];
  if (!selected) throw new RangeError('course selection requires a default course');
  return selected;
}

export function browserCourseModeForKey(
  code: string,
  selections: readonly BrowserCourseModeSelection[] = BROWSER_COURSE_MODES,
): BrowserCourseModeSelection | null {
  return selections.find((mode) => mode.digitCode === code || mode.numpadCode === code) ?? null;
}
