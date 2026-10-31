import type { EditorContext, EditorModule } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { courseIdOfPath } from '../authoring/content-places.js';
import { createRunPanel } from '../browser-shared/run-panel.js';

/**
 * Run the game on this compile: a chosen course with the run panel the course editor's Run is (`createRunPanel`):
 * FREE PLAY with a chosen vehicle, and RACE or TIME ATTACK of each class that runs the course while the measurements
 * are current, in a new tab of the game page that takes the delivery of this compile.
 */
export const runModule: EditorModule = {
  id: 'run',
  title: 'Run',
  mount(element: HTMLElement, context: EditorContext) {
    const course = make('select');
    const label = make('label', 'Course ');
    label.append(course);
    const panel = createRunPanel(context, () => course.value || null);
    element.append(make('h2', 'Run the game on this build'), label, ' ', panel.element);
    // The courses follow the store's, keeping the choice while it exists.
    const update = () => {
      const ids = context
        .paths()
        .map(courseIdOfPath)
        .filter((id) => id !== null);
      if (ids.join() !== [...course.options].map((option) => option.value).join()) {
        const chosen = course.value;
        course.replaceChildren(...ids.map((id) => make('option', id, { value: id })));
        if (ids.includes(chosen)) course.value = chosen;
      }
      panel.update();
    };
    course.addEventListener('change', update);
    context.subscribe(update);
    update();
  },
};
