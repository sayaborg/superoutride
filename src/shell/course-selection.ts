import type { CourseIndex } from '../content/course-index.js';
export type BrowserCourseId = string;

export interface BrowserCourseSelection {
  /** Compact DEV button text. */
  readonly buttonLabel: string;
  readonly label: string;
  readonly id: BrowserCourseId;
}

/** The indexed courses in selection order; the first is the default. DEV buttons are numbered in that order. */
export function browserCourses(index: CourseIndex): readonly BrowserCourseSelection[] {
  return Object.freeze(
    index.map((course, position) =>
      Object.freeze({ buttonLabel: String(position + 1), label: course.name, id: course.id }),
    ),
  );
}

export function formatBrowserCourseSelector(
  courses: readonly BrowserCourseSelection[],
  activeId: BrowserCourseId,
): string {
  return courses.map((course) => `${course.label}${course.id === activeId ? '*' : ''}`).join('  ');
}
