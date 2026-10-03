import type { SeriesCourse } from '../content/series-catalog.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { RunFacts } from './run-screen.js';
import { formPool } from '../race/free-play-field.js';
import { recordedColor, runSettings, type RunRequest, type RunSettings } from './run-request.js';
import type { PlayerRecord } from './player-record.js';

/**
 * Session settings precede the start signal; ordinary driving input remains unchanged. The PAUSE button asks
 * the run state to toggle, and its label and visibility follow the run-state facts it is shown. Changed settings ask
 * for a new run of the changed request, and NEW SESSION for the same request; the form belongs to its run and is
 * disposed with it.
 */
export function mountCourseSessionControls(
  canvas: HTMLElement,
  request: RunRequest,
  current: RunSettings,
  arcade: SeriesCourse | null,
  maxLaps: number,
  player: PlayerRecord,
  actions: { start(): void; togglePause(): void; reassemble(request: RunRequest, begin: boolean): void },
  vehicles: readonly CompiledVehicleDefinition[],
) {
  const panel = document.createElement('form');
  panel.className = 'session-setup';
  panel.setAttribute('aria-label', 'Session setup');
  panel.setAttribute('data-driving-input', 'ignore');
  panel.addEventListener('keydown', (event) => event.stopPropagation());
  panel.addEventListener('keyup', (event) => event.stopPropagation());
  const heading = document.createElement('h1');
  heading.textContent = 'SUPER OUTRIDE';
  panel.append(heading);
  const select = (name: string, values: readonly { value: string; label: string }[], current: string) => {
    const label = document.createElement('label');
    label.textContent = name;
    const control = document.createElement('select');
    control.setAttribute('aria-label', name);
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value.value;
      option.textContent = value.label;
      control.append(option);
    }
    control.value = current;
    label.append(control);
    panel.append(label);
    return control;
  };
  const mode = select(
    'Mode',
    (arcade ? ['ARCADE', 'FREE_PLAY', 'TIME_TRIAL'] : ['FREE_PLAY', 'TIME_TRIAL']).map((value) => ({
      value,
      label: value.replace('_', ' '),
    })),
    current.mode,
  );
  const vehicle = select(
    'Vehicle',
    vehicles.map((v) => ({ value: v.compiledVehicle.id, label: `${v.manufacturer} ${v.model}` })),
    current.vehicleId,
  );
  const numeric = (name: string, value: number, min: number, max: number) => {
    const label = document.createElement('label');
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.required = true;
    input.setAttribute('aria-label', name);
    label.append(input);
    panel.append(label);
    return input;
  };
  const rivals = numeric('Rivals', current.rivalCount, 0, SESSION_RULE_LIMITS.rivals),
    laps = numeric('Laps', current.lapCount, 1, maxLaps);
  // ARCADE is offered only for a series course; it locks the series' ARCADE settings and has the clock. TIME TRIAL
  // has no rivals.
  const lockPreset = () => {
    const locked = mode.value === 'ARCADE';
    if (locked && arcade) {
      vehicle.value = arcade.series.vehicles[0]!;
      rivals.value = String(arcade.entries.length - 1);
      laps.value = String(arcade.laps);
    }
    if (mode.value === 'TIME_TRIAL') rivals.value = '0';
    vehicle.disabled = locked;
    rivals.disabled = locked || mode.value === 'TIME_TRIAL';
    laps.disabled = locked || maxLaps === 1;
  };
  mode.addEventListener('change', lockPreset);
  lockPreset();
  const start = document.createElement('button');
  start.type = 'submit';
  start.textContent = 'START';
  panel.append(start);
  const hint = document.createElement('p');
  hint.textContent = 'Arrows drive';
  panel.append(hint);
  const toolbar = document.createElement('div');
  toolbar.className = 'session-actions';
  toolbar.setAttribute('data-driving-input', 'ignore');
  toolbar.hidden = true;
  const pause = document.createElement('button');
  pause.type = 'button';
  pause.textContent = 'PAUSE';
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.textContent = 'NEW SESSION';
  restart.addEventListener('click', () => actions.reassemble(request, false));
  pause.addEventListener('click', () => actions.togglePause());
  toolbar.append(pause, restart);
  const begin = () => {
    panel.hidden = true;
    toolbar.hidden = false;
    canvas.focus();
    actions.start();
  };
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const entry = vehicles.find((v) => v.compiledVehicle.id === vehicle.value)!;
    const choice = { courseId: request.courseId, vehicleId: vehicle.value, color: recordedColor(player, entry) };
    const lapCount = Number(laps.value);
    const next: RunRequest =
      mode.value === 'ARCADE'
        ? { ...choice, mode: 'ARCADE' }
        : mode.value === 'TIME_TRIAL'
          ? { ...choice, mode: 'TIME_TRIAL', lapCount }
          : {
              ...choice,
              mode: 'FREE_PLAY',
              lapCount,
              rivalCount: Number(rivals.value),
              rivalPool: request.mode === 'FREE_PLAY' ? request.rivalPool : formPool(entry),
            };
    const changed =
      JSON.stringify(runSettings(next, arcade, vehicles, maxLaps)) !== JSON.stringify(current) ||
      next.color !== request.color;
    if (changed) actions.reassemble(next, true);
    else begin();
  });
  canvas.insertAdjacentElement('afterend', panel);
  canvas.insertAdjacentElement('afterend', toolbar);
  return Object.freeze({
    begin,
    /** Remove the form and its toolbar with their run. */
    dispose() {
      panel.remove();
      toolbar.remove();
    },
    /** PAUSE or RESUME by `paused`; a finished Session hides the button. */
    show(facts: RunFacts) {
      pause.textContent = facts.paused ? 'RESUME' : 'PAUSE';
      pause.hidden = facts.finished;
    },
  });
}
