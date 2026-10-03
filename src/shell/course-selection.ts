import type { CourseIndex } from '../content/course-index.js';
export type BrowserCourseId = string;

export interface BrowserCourseSelection {
  readonly label: string;
  readonly id: BrowserCourseId;
}

/** The indexed courses in index order, with their display names. */
export function browserCourses(index: CourseIndex): readonly BrowserCourseSelection[] {
  return Object.freeze(index.map((course) => Object.freeze({ label: course.name, id: course.id })));
}

export function formatBrowserCourseSelector(
  courses: readonly BrowserCourseSelection[],
  activeId: BrowserCourseId,
): string {
  return courses.map((course) => `${course.label}${course.id === activeId ? '*' : ''}`).join('  ');
}
