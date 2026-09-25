import type { ContentManifest } from '../core/content-manifest.js';
export type BrowserCourseModeQuery = string;

export interface BrowserCourseModeSelection {
  /** Compact DEV button text; the label when absent. */
  readonly buttonLabel?: string;
  readonly label: string;
  readonly query: BrowserCourseModeQuery;
  readonly entryName: 'main-course.js';
}

/** The first saved course is the default; every selection uses the shared product root. */
function compileBrowserCourseModes(
  entries: readonly Omit<BrowserCourseModeSelection, 'entryName'>[],
): readonly BrowserCourseModeSelection[] {
  const queries = new Set<string>();
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
      return Object.freeze({ ...entry, entryName: 'main-course.js' as const });
    }),
  );
}

const COURSE_CONTROLS = compileBrowserCourseModes([
  { buttonLabel: '1', label: 'RIBBON COAST', query: 'ribbon-coast' },
  { buttonLabel: '2', label: 'RIBBON RING', query: 'ribbon-ring' },
  { buttonLabel: '3', label: 'RIBBON FORK', query: 'ribbon-fork' },
  { buttonLabel: '4', label: 'RIBBON ROUGH', query: 'ribbon-rough' },
]);

/** Availability comes exclusively from delivery; labels remain shell settings. */
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
  return BROWSER_COURSE_MODES.map((mode) => `${mode.label}${mode.query === activeQuery ? '*' : ''}`).join('  ');
}

export function selectBrowserCourseMode(
  query: string | null,
  selections: readonly BrowserCourseModeSelection[] = BROWSER_COURSE_MODES,
): BrowserCourseModeSelection {
  const selected = selections.find((mode) => mode.query === query) ?? selections[0];
  if (!selected) throw new RangeError('course selection requires a default course');
  return selected;
}
