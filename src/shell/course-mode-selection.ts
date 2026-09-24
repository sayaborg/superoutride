import type { ContentManifest } from '../core/content-manifest.js';
export type BrowserCourseModeQuery = string;

export interface BrowserCourseModeSelection {
  readonly digitCode?: string;
  readonly numpadCode?: string;
  readonly label: string;
  readonly query: BrowserCourseModeQuery;
  readonly entryName: 'main-course.js';
}

/** The first saved course is the default; every selection uses the shared product root. */
function compileBrowserCourseModes(
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

const COURSE_CONTROLS = compileBrowserCourseModes([
  { digitCode: 'Digit1', numpadCode: 'Numpad1', label: 'RIBBON COAST', query: 'ribbon-coast' },
  { digitCode: 'Digit2', numpadCode: 'Numpad2', label: 'RIBBON RING', query: 'ribbon-ring' },
  { digitCode: 'Digit3', numpadCode: 'Numpad3', label: 'RIBBON FORK', query: 'ribbon-fork' },
]);

/** Availability comes exclusively from delivery; labels and shortcuts remain shell settings. */
export let BROWSER_COURSE_MODES: readonly BrowserCourseModeSelection[] = Object.freeze([]);
export function configureBrowserCourses(manifest: ContentManifest): void {
  const ids = manifest.files.filter((file) => file.kind === 'course').map((file) => file.id);
  const known = COURSE_CONTROLS.filter((control) => ids.includes(control.query));
  BROWSER_COURSE_MODES = compileBrowserCourseModes([
    ...known,
    ...ids.filter((id) => !known.some((control) => control.query === id)).map((query) => ({ query, label: query })),
  ]);
}

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
