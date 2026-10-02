import { browserContent } from './browser-content.js';
import { browserCourses, selectBrowserCourse, type BrowserCourseSelection } from './course-selection.js';
import { mustGet } from './dom.js';
import { mountMobileCourseSelector } from './mobile-selector-controls.js';

try {
  // The delivered course list is built once here and passed to every user.
  const courses = browserCourses((await browserContent()).manifest);
  const parameters = new URLSearchParams(location.search);
  const selectedCourse = selectBrowserCourse(courses, parameters.get('course'));
  const courseSelector = mustGet<HTMLElement>('course-selector-buttons');
  const devPanel = mustGet<HTMLDetailsElement>('dev-panel');
  // Keys typed in DEV controls never reach driving input.
  devPanel.addEventListener('keydown', (event) => {
    event.stopPropagation();
  });
  devPanel.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        devPanel.open = false;
        devPanel.querySelector<HTMLElement>('summary')?.focus();
      }
    },
    true,
  );

  mountMobileCourseSelector(courseSelector, courses, selectedCourse.query, navigateToCourse);

  function navigateToCourse(target: BrowserCourseSelection): void {
    if (target.query === selectedCourse.query) return;
    const next = new URL(location.href);
    next.searchParams.set('course', target.query);
    for (const key of ['mode', 'vehicle', 'rivals', 'laps', 'pool', 'autostart']) next.searchParams.delete(key);
    location.assign(next.href);
  }

  const entry: typeof import('./main-course.js') = await import(`./${selectedCourse.entryName}`);
  await entry.startCourse(courses, selectedCourse);
} catch (error) {
  console.error('Course could not start', error);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = `Course could not start: ${error instanceof Error ? error.message : String(error)}`;
  mustGet('game').insertAdjacentElement('afterend', status);
}
