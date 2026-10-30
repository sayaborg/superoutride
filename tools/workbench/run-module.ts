import type { EditorContext, EditorModule } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { courseIdOfPath } from '../authoring/content-places.js';
import { compiledClasses, createGameRunner, runProducts } from '../browser-shared/game-run.js';

/**
 * Run the game on this compile: a new tab of the game page with `dev=1` and `workbench=<commit>`, which imports this
 * build's modules and takes the delivery laid out from the compile's products when it opened, through the game's own
 * manifest and digest checks. Later edits do not reach an open game. RACE and TIME ATTACK run a class
 * (`<series>/<class>`), FREE PLAY a course. While measurements are stale, the game opens in FREE PLAY without rivals,
 * traffic or a time limit, which need none.
 */
export const runModule: EditorModule = {
  id: 'run',
  title: 'Run',
  mount(element: HTMLElement, context: EditorContext) {
    const course = make('select');
    const seriesClass = make('select');
    const vehicle = make('select');
    // RACE and TIME ATTACK are a class's sessions (the URL's `session`); FREE PLAY runs a course.
    const runKind = make('select');
    const runKinds: readonly (readonly [string, string])[] = [
      ['race', 'RACE'],
      ['attack', 'TIME ATTACK'],
      ['free-play', 'FREE PLAY'],
    ];
    for (const [value, name] of runKinds) runKind.append(make('option', name, { value }));
    const run = make('button', 'Run', { type: 'button' });
    const note = make('p', '', { role: 'status' });
    const label = (text: string, control: HTMLElement) => {
      const node = make('label', `${text} `);
      node.append(control);
      return node;
    };
    element.append(
      make('h2', 'Run the game on this build'),
      label('Course', course),
      ' ',
      label('Class', seriesClass),
      ' ',
      label('Vehicle', vehicle),
      ' ',
      label('Run', runKind),
      ' ',
      run,
      note,
    );

    // The options follow the store's courses and vehicles, keeping the choice while it exists.
    const fill = (select: HTMLSelectElement, ids: readonly string[]) => {
      const chosen = select.value;
      if (ids.join() === [...select.options].map((option) => option.value).join()) return;
      select.replaceChildren(...ids.map((id) => make('option', id, { value: id })));
      if (ids.includes(chosen)) select.value = chosen;
    };
    const ids = (directory: string, suffix: string) =>
      context
        .paths()
        .filter((path) => path.startsWith(`${directory}/`) && path.endsWith(suffix))
        .map((path) => path.slice(directory.length + 1, -suffix.length));

    const products = () => runProducts(context.compile());
    const update = () => {
      fill(
        course,
        context
          .paths()
          .map(courseIdOfPath)
          .filter((id) => id !== null),
      );
      fill(vehicle, ids('vehicles', '.json'));
      const current = products();
      fill(seriesClass, current ? compiledClasses(current.compiled).map((c) => c.id) : []);
      run.disabled = !current;
      runKind.disabled = !current?.measured;
      if (current && !current.measured) runKind.value = 'free-play';
      note.textContent = !current
        ? context.compile().status === 'running'
          ? 'Compiling…'
          : 'The compile failed: fix its diagnostics to run.'
        : current.measured
          ? 'The game opens in a new tab with this compile; later edits do not reach it.'
          : 'Measurements are stale: the game opens in FREE PLAY without rivals, traffic or a time limit.';
    };
    context.subscribe(update);
    update();

    const runGame = createGameRunner(context.commit);
    run.addEventListener('click', () => {
      const current = products();
      if (!current) return;
      const chosen = current.measured ? runKind.value : 'free-play';
      const [seriesId = '', classId = ''] = seriesClass.value.split('/');
      // A session names a class, whose first vehicle it drives; FREE PLAY names a course and a vehicle.
      const place: Record<string, string> =
        chosen === 'free-play'
          ? { course: course.value, vehicle: vehicle.value }
          : { series: seriesId, class: classId, session: chosen };
      if (!runGame(place, current.compiled))
        note.textContent = 'The browser blocked the new tab: allow pop-ups for this page.';
    });
  },
};
