import {
  browserCourseModeForKey,
  selectBrowserCourseMode,
  type BrowserCourseModeSelection,
} from './browser/course-mode-selection.js';
import { mountMobileCourseSelector } from './browser/mobile-selector-controls.js';

const parameters = new URLSearchParams(location.search);
const selectedMode = selectBrowserCourseMode(parameters.get('mode'));
const courseSelector = mustGet<HTMLElement>('course-selector-buttons');

mountMobileCourseSelector(courseSelector, selectedMode.query, navigateToCourseMode);

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const targetMode = browserCourseModeForKey(event.code);
  if (targetMode !== null) navigateToCourseMode(targetMode);
});

function navigateToCourseMode(targetMode: BrowserCourseModeSelection): void {
  if (targetMode.query === selectedMode.query) return;
  const next = new URL(location.href);
  next.searchParams.set('mode', targetMode.query);
  location.assign(next.href);
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

await import(`./${selectedMode.entryName}`);
