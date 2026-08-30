import {
  browserCourseModeForKey,
  selectBrowserCourseMode,
} from './browser/course-mode-selection.js';

const parameters = new URLSearchParams(location.search);
const selectedMode = selectBrowserCourseMode(parameters.get('mode'));

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const targetMode = browserCourseModeForKey(event.code);
  if (targetMode === null || targetMode.query === selectedMode.query) return;
  const next = new URL(location.href);
  next.searchParams.set('mode', targetMode.query);
  location.assign(next.href);
});

await import(`./${selectedMode.entryName}`);
