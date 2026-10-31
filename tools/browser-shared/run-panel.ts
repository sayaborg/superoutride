import type { EditorContext } from './editor-context.js';
import { make } from './dom.js';
import { compiledClasses, createGameRunner, runProducts } from './game-run.js';

/**
 * The one Run of the editing pages, the course editor's and the workbench's: run `course` on this compile in a new tab
 * of the game page (`createGameRunner`, `dev=1`, `workbench=<commit>`): FREE PLAY with a chosen vehicle, and RACE or
 * TIME ATTACK of each class that runs the course (`<series>/<class>`, driving its first vehicle) while the measurements
 * are current; while they are stale, FREE PLAY without rivals, traffic or a time limit. Later edits do not reach an
 * open game. The page calls `update` when its course changes.
 */
export function createRunPanel(context: EditorContext, course: () => string | null) {
  const vehicle = make('select');
  const run = make('select');
  const go = make('button', 'Run', { type: 'button' });
  const note = make('span', '', { role: 'status', class: 'hint' });
  const label = make('label', 'Vehicle ');
  label.append(vehicle);
  const element = make('div', '', { class: 'course-run' });
  element.append(label, ' ', run, ' ', go, ' ', note);
  const fill = (select: HTMLSelectElement, options: readonly (readonly [string, string])[]) => {
    const chosen = select.value;
    if (options.map(([value]) => value).join() === [...select.options].map((option) => option.value).join()) return;
    select.replaceChildren(...options.map(([value, text]) => make('option', text, { value })));
    if (options.some(([value]) => value === chosen)) select.value = chosen;
  };
  const update = () => {
    const vehicles = context
      .paths()
      .filter((path) => /^vehicles\/[^/]+\.json$/.test(path))
      .map((path) => path.slice('vehicles/'.length, -'.json'.length));
    fill(
      vehicle,
      vehicles.map((id) => [id, id]),
    );
    const current = runProducts(context.compile());
    // A class's sessions are offered while the measurements are current; FREE PLAY always.
    const classes = current?.measured ? compiledClasses(current.compiled).filter((c) => c.course === course()) : [];
    fill(run, [
      ['free-play', 'FREE PLAY'],
      ...classes.flatMap(({ id }) => [
        [`race ${id}`, `RACE ${id}`] as const,
        [`attack ${id}`, `TIME ATTACK ${id}`] as const,
      ]),
    ]);
    go.disabled = !current || !course();
    note.textContent = !current
      ? context.compile().status === 'running'
        ? 'Compiling…'
        : 'The compile failed: fix its diagnostics to run.'
      : current.measured
        ? 'Opens the game in a new tab with this compile; later edits do not reach it.'
        : 'Measurements are stale: FREE PLAY without rivals, traffic or a time limit.';
  };
  context.subscribe(update);
  update();
  const runGame = createGameRunner(context.commit, context.delivery);
  go.addEventListener('click', () => {
    const current = runProducts(context.compile()),
      id = course();
    if (!current || !id) return;
    const [session = 'free-play', classId = ''] = run.value.split(' ');
    const [seriesId = '', className = ''] = classId.split('/');
    // A session names a class, whose first vehicle it drives; FREE PLAY names the course and a vehicle.
    const place: Record<string, string> =
      session === 'free-play' || !current.measured
        ? { course: id, vehicle: vehicle.value }
        : { series: seriesId, class: className, session };
    if (!runGame(place, current.compiled)) note.textContent = 'The browser blocked the new tab: allow pop-ups.';
  });
  return { element, update };
}
