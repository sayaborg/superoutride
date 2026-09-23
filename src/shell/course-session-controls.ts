import { compileSessionConfiguration, type SessionConfiguration } from '../race/session-configuration.js';
import { VEHICLE_CATALOG } from '../vehicle/vehicle-catalog.js';

interface BrowserSessionSettings extends SessionConfiguration {
  readonly vehicleId: string;
}
export function readBrowserSessionSettings(
  params: URLSearchParams,
  preset: { readonly vehicleId: string; readonly rivalCount: number; readonly lapCount: number },
): BrowserSessionSettings {
  const mode = params.get('session') ?? 'CLASSIC';
  if (mode !== 'CLASSIC' && mode !== 'CUSTOM') throw new RangeError('Unknown Session mode');
  const values =
    mode === 'CLASSIC'
      ? { ...preset, countdown: true }
      : {
          rivalCount: Number(params.get('rivals') ?? preset.rivalCount),
          lapCount: Number(params.get('laps') ?? preset.lapCount),
          countdown: params.get('clock') !== 'off',
          vehicleId: params.get('vehicle') ?? preset.vehicleId,
        };
  if (!VEHICLE_CATALOG.some((v) => v.profile.id === values.vehicleId)) throw new RangeError('Unknown Session vehicle');
  return Object.freeze({ ...compileSessionConfiguration({ mode, ...values }), vehicleId: values.vehicleId });
}

/** Session settings precede the start signal; ordinary driving input remains unchanged. */
export function mountCourseSessionControls(
  canvas: HTMLElement,
  current: BrowserSessionSettings,
  preset: BrowserSessionSettings,
  maxLaps: number,
  actions: { start(): void; pause(paused: boolean): void },
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
    ['CLASSIC', 'CUSTOM'].map((value) => ({ value, label: value })),
    current.mode,
  );
  const vehicle = select(
    'Vehicle',
    VEHICLE_CATALOG.map((v) => ({ value: v.profile.id, label: `${v.manufacturer} ${v.model}` })),
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
  const rivals = numeric('Rivals', current.rivalCount, 0, 16),
    laps = numeric('Laps', current.lapCount, 1, maxLaps);
  const clock = select(
    'Checkpoint clock',
    [
      { value: 'on', label: 'ON' },
      { value: 'off', label: 'OFF' },
    ],
    current.countdown ? 'on' : 'off',
  );
  const lockPreset = () => {
    const classic = mode.value === 'CLASSIC';
    if (classic) {
      vehicle.value = preset.vehicleId;
      rivals.value = String(preset.rivalCount);
      laps.value = String(preset.lapCount);
      clock.value = 'on';
    }
    vehicle.disabled = rivals.disabled = clock.disabled = classic;
    laps.disabled = classic || maxLaps === 1;
  };
  mode.addEventListener('change', lockPreset);
  lockPreset();
  const start = document.createElement('button');
  start.type = 'submit';
  start.textContent = 'START';
  panel.append(start);
  const hint = document.createElement('p');
  hint.textContent = 'Arrows drive · Backspace recovers';
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
  let paused = false;
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'RESUME' : 'PAUSE';
    actions.pause(paused);
    if (!paused) canvas.focus();
  });
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
    params.set('clock', clock.value);
    const next = readBrowserSessionSettings(params, preset);
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      params.set('autostart', '1');
      location.search = params.toString();
    } else begin();
  });
  canvas.insertAdjacentElement('afterend', panel);
  canvas.insertAdjacentElement('afterend', toolbar);
  return Object.freeze({
    begin,
    complete() {
      pause.hidden = true;
    },
  });
}
