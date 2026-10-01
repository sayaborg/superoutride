import type { SeriesCourse } from '../content/series-catalog.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import { compileSessionConfiguration, type SessionConfiguration } from '../race/session-configuration.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { RunFacts } from './run-state.js';

/** The chosen settings; each Session assembly adds its own seed. */
interface BrowserSessionSettings extends Omit<SessionConfiguration, 'seed'> {
  readonly vehicleId: string;
}
/**
 * A series course defaults to its ARCADE settings with the series' first vehicle and the clock. FREE PLAY has no clock.
 * A course in no series offers only FREE PLAY, defaulting to the first vehicle in selection order, no rivals and one lap.
 */
export function readBrowserSessionSettings(
  params: URLSearchParams,
  arcade: SeriesCourse | null,
  vehicles: readonly CompiledVehicleDefinition[],
): BrowserSessionSettings {
  const preset = arcade
    ? { vehicleId: arcade.series.vehicles[0]!, rivalCount: arcade.entries.length - 1, lapCount: arcade.laps }
    : { vehicleId: vehicles[0]!.compiledVehicle.id, rivalCount: 0, lapCount: 1 };
  const mode = params.get('session') ?? (arcade ? 'ARCADE' : 'FREE_PLAY');
  if (mode !== 'ARCADE' && mode !== 'FREE_PLAY') throw new RangeError('Unknown Session mode');
  if (mode === 'ARCADE' && !arcade) throw new RangeError('An untimed course has no ARCADE Session');
  const values =
    mode === 'ARCADE'
      ? { ...preset, timeLimit: true }
      : {
          rivalCount: Number(params.get('rivals') ?? preset.rivalCount),
          lapCount: Number(params.get('laps') ?? preset.lapCount),
          timeLimit: false,
          vehicleId: params.get('vehicle') ?? preset.vehicleId,
        };
  if (!vehicles.some((v) => v.compiledVehicle.id === values.vehicleId)) throw new RangeError('Unknown Session vehicle');
  // Product Sessions use standing starts. The seed is chosen per assembly, so validation uses a placeholder.
  const { seed: _seed, ...configuration } = compileSessionConfiguration({ mode, ...values, initialSpeed: 0, seed: 0 });
  return Object.freeze({ ...configuration, vehicleId: values.vehicleId });
}

/**
 * Session settings precede the start signal; ordinary driving input remains unchanged. The PAUSE button asks
 * the run state to toggle, and its label and visibility follow the run-state facts it is shown.
 */
export function mountCourseSessionControls(
  canvas: HTMLElement,
  current: BrowserSessionSettings,
  arcade: SeriesCourse | null,
  maxLaps: number,
  actions: { start(): void; togglePause(): void },
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
    (arcade ? ['ARCADE', 'FREE_PLAY'] : ['FREE_PLAY']).map((value) => ({ value, label: value.replace('_', ' ') })),
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
  // ARCADE is offered only for a series course; it locks the series' ARCADE settings and has the clock.
  const lockPreset = () => {
    const locked = mode.value === 'ARCADE';
    if (locked && arcade) {
      vehicle.value = arcade.series.vehicles[0]!;
      rivals.value = String(arcade.entries.length - 1);
      laps.value = String(arcade.laps);
    }
    vehicle.disabled = rivals.disabled = locked;
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
  restart.addEventListener('click', () => {
    const p = new URLSearchParams(location.search);
    p.delete('autostart');
    location.search = p.toString();
  });
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
    const params = new URLSearchParams(location.search);
    params.set('session', mode.value);
    params.set('vehicle', vehicle.value);
    params.set('rivals', rivals.value);
    params.set('laps', laps.value);
    const next = readBrowserSessionSettings(params, arcade, vehicles);
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      params.set('autostart', '1');
      location.search = params.toString();
    } else begin();
  });
  canvas.insertAdjacentElement('afterend', panel);
  canvas.insertAdjacentElement('afterend', toolbar);
  return Object.freeze({
    begin,
    /** PAUSE or RESUME by `paused`; a finished Session hides the button. */
    show(facts: RunFacts) {
      pause.textContent = facts.paused ? 'RESUME' : 'PAUSE';
      pause.hidden = facts.finished;
    },
  });
}
