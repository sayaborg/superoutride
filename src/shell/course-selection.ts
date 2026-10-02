import type { ContentManifest } from '../content/content-manifest.js';
export type BrowserCourseId = string;

export interface BrowserCourseSelection {
  /** Compact DEV button text; the label when absent. */
  readonly buttonLabel?: string;
  readonly label: string;
  readonly query: BrowserCourseId;
  readonly entryName: 'main-course.js';
}

/** The first saved course is the default; every selection uses the shared product root. */
function compileBrowserCourses(
  entries: readonly Omit<BrowserCourseSelection, 'entryName'>[],
): readonly BrowserCourseSelection[] {
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

const COURSE_CONTROLS = compileBrowserCourses([
  { buttonLabel: '1', label: 'RIBBON COAST', query: 'ribbon-coast' },
  { buttonLabel: '2', label: 'RIBBON RING', query: 'ribbon-ring' },
  { buttonLabel: '3', label: 'RIBBON FORK', query: 'ribbon-fork' },
  { buttonLabel: '4', label: 'RIBBON ROUGH', query: 'ribbon-rough' },
]);

/** The delivered courses in selection order. Availability comes exclusively from delivery; labels remain shell settings. */
export function browserCourses(manifest: ContentManifest): readonly BrowserCourseSelection[] {
  const ids = manifest.files.filter((file) => file.kind === 'course').map((file) => file.id);
  const known = COURSE_CONTROLS.filter((control) => ids.includes(control.query));
  return compileBrowserCourses([
    ...known,
    ...ids.filter((id) => !known.some((control) => control.query === id)).map((query) => ({ query, label: query })),
  ]);
}

export function formatBrowserCourseSelector(
  courses: readonly BrowserCourseSelection[],
  activeQuery: BrowserCourseId,
): string {
  return courses.map((course) => `${course.label}${course.query === activeQuery ? '*' : ''}`).join('  ');
}

export function selectBrowserCourse(
  selections: readonly BrowserCourseSelection[],
  query: string | null,
): BrowserCourseSelection {
  const selected = selections.find((course) => course.query === query) ?? selections[0];
  if (!selected) throw new RangeError('course selection requires a default course');
  return selected;
}
