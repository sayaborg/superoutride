import type { ContentManifest } from '../content/content-manifest.js';
export type BrowserCourseId = string;

export interface BrowserCourseSelection {
  /** Compact DEV button text; the label when absent. */
  readonly buttonLabel?: string;
  readonly label: string;
  readonly id: BrowserCourseId;
}

/** The first saved course is the default. */
function compileBrowserCourses(entries: readonly BrowserCourseSelection[]): readonly BrowserCourseSelection[] {
  const seen = new Set<string>();
  if (entries.length === 0) throw new RangeError('At least one course is required');
  return Object.freeze(
    entries.map((entry) => {
      if (
        typeof entry.id !== 'string' ||
        !entry.id.trim() ||
        entry.id.trim() !== entry.id ||
        typeof entry.label !== 'string' ||
        !entry.label.trim()
      )
        throw new RangeError('course id and label must be nonempty; id must be trimmed');
      if (seen.has(entry.id)) throw new RangeError(`duplicate course id: ${entry.id}`);
      seen.add(entry.id);
      return Object.freeze({ ...entry });
    }),
  );
}

const COURSE_CONTROLS = compileBrowserCourses([
  { buttonLabel: '1', label: 'RIBBON COAST', id: 'ribbon-coast' },
  { buttonLabel: '2', label: 'RIBBON RING', id: 'ribbon-ring' },
  { buttonLabel: '3', label: 'RIBBON FORK', id: 'ribbon-fork' },
  { buttonLabel: '4', label: 'RIBBON ROUGH', id: 'ribbon-rough' },
]);

/** The delivered courses in selection order. Availability comes exclusively from delivery; labels remain shell settings. */
export function browserCourses(manifest: ContentManifest): readonly BrowserCourseSelection[] {
  const ids = manifest.files.filter((file) => file.kind === 'course').map((file) => file.id);
  const known = COURSE_CONTROLS.filter((control) => ids.includes(control.id));
  return compileBrowserCourses([
    ...known,
    ...ids.filter((id) => !known.some((control) => control.id === id)).map((id) => ({ id, label: id })),
  ]);
}

export function formatBrowserCourseSelector(
  courses: readonly BrowserCourseSelection[],
  activeId: BrowserCourseId,
): string {
  return courses.map((course) => `${course.label}${course.id === activeId ? '*' : ''}`).join('  ');
}

export function selectBrowserCourse(
  selections: readonly BrowserCourseSelection[],
  id: string | null,
): BrowserCourseSelection {
  const selected = selections.find((course) => course.id === id) ?? selections[0];
  if (!selected) throw new RangeError('course selection requires a default course');
  return selected;
}
