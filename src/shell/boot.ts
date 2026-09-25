import { browserContent } from './browser-content.js';
import {
  configureBrowserCourses,
  selectBrowserCourseMode,
  type BrowserCourseModeSelection,
} from './course-mode-selection.js';
import { mustGet } from './dom.js';
import { mountMobileCourseSelector } from './mobile-selector-controls.js';

try {
  configureBrowserCourses((await browserContent()).manifest);
  const parameters = new URLSearchParams(location.search);
  const selectedMode = selectBrowserCourseMode(parameters.get('mode'));
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

  mountMobileCourseSelector(courseSelector, selectedMode.query, navigateToCourseMode);

  function navigateToCourseMode(targetMode: BrowserCourseModeSelection): void {
    if (targetMode.query === selectedMode.query) return;
    const next = new URL(location.href);
    next.searchParams.set('mode', targetMode.query);
    for (const key of ['session', 'vehicle', 'rivals', 'laps', 'clock', 'autostart']) next.searchParams.delete(key);
    location.assign(next.href);
  }

  await import(`./${selectedMode.entryName}`);
} catch (error) {
  console.error('Course could not start', error);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = `Course could not start: ${error instanceof Error ? error.message : String(error)}`;
  mustGet('game').insertAdjacentElement('afterend', status);
}
