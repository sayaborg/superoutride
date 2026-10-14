import { compileEngineSound, type CompiledEngineSound } from '../../audio/engine-sound.js';
import { compileFrictionInput, compileSurfaceSound, type SurfaceSound } from '../../audio/surface-sounds.js';
import type { WallSound } from '../../audio/wall-sounds.js';

type Path = readonly (string | number)[];
/** A record's number at `path`, with its label and unit. */
type Field = readonly [label: string, path: Path, unit: string];
type Tree = Readonly<Record<string | number, unknown>>;

const valueAt = (record: unknown, path: Path): number =>
  path.reduce<unknown>((value, key) => (value as Tree)[key], record) as number;

/** A copy of `record` with `value` at `path`, sharing everything off the path. */
function withValue<R>(record: R, path: Path, value: number): R {
  const [key, ...rest] = path;
  if (key === undefined) return value as R;
  const copy = (Array.isArray(record) ? [...(record as unknown[])] : { ...(record as Tree) }) as Record<
    string | number,
    unknown
  >;
  copy[key] = withValue((record as Tree)[key], rest, value);
  return copy as R;
}

/**
 * One DEV panel of sound records by ID: choose a record, then change its numbers (`fields` lists a record's). `compile`
 * is the record's one value check; a value it refuses keeps the previous one. The panel starts from, and its reset
 * returns to, the delivered records; `read` returns the same object until a value changes.
 */
function createRecordSoundSettings<R>(
  host: HTMLElement,
  legendText: string,
  initial: Readonly<Record<string, R>>,
  fields: (record: R) => readonly Field[],
  compile: (record: R) => R,
  onChange: () => void,
  resetText: string,
) {
  let records = initial;
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = legendText;
  const note = document.createElement('p');
  note.textContent =
    'Listening values, not measured properties. Initial values come from the content documents. Reloading restores them.';
  // Keys typed here belong to the panel, not to driving.
  const key = (event: Event): void => event.stopPropagation();
  const select = document.createElement('select');
  select.setAttribute('aria-label', `${legendText} record`);
  for (const id of Object.keys(initial)) select.append(new Option(id, id));
  const body = document.createElement('div');
  let inputs: { readonly input: HTMLInputElement; readonly change: () => void }[] = [];
  const release = (): void => {
    for (const { input, change } of inputs) {
      input.removeEventListener('change', change);
      input.removeEventListener('keydown', key);
    }
  };
  /** The chosen record's fields, showing its current values. */
  function show(): void {
    release();
    const id = select.value;
    const labels: HTMLLabelElement[] = [];
    inputs = fields(records[id]!).map(([label, path, unit]) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.value = String(valueAt(records[id], path));
      input.setAttribute('aria-label', label);
      const change = (): void => {
        try {
          records = { ...records, [id]: compile(withValue(records[id]!, path, Number(input.value))) };
        } catch {
          // The record's value check refused it: keep the previous value.
          input.value = String(valueAt(records[id], path));
          return;
        }
        onChange();
      };
      input.addEventListener('change', change);
      input.addEventListener('keydown', key);
      const wrapper = document.createElement('label');
      wrapper.className = 'range-control';
      wrapper.append(`${label} `, input, unit ? ` ${unit}` : '');
      labels.push(wrapper);
      return { input, change };
    });
    body.replaceChildren(...labels);
  }
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'selector-button';
  reset.textContent = resetText;
  const restore = (): void => {
    records = initial;
    show();
    onChange();
  };
  select.addEventListener('change', show);
  select.addEventListener('keydown', key);
  reset.addEventListener('click', restore);
  show();
  fieldset.replaceChildren(legend, note, select, body, reset);
  host.replaceChildren(fieldset);
  return {
    read: (): Readonly<Record<string, R>> => records,
    /** The chosen record's ID. */
    chosen: (): string => select.value,
    setEnabled(value: boolean): void {
      fieldset.disabled = !value;
    },
    dispose(): void {
      release();
      select.removeEventListener('change', show);
      select.removeEventListener('keydown', key);
      reset.removeEventListener('click', restore);
      host.replaceChildren();
    },
  };
}

const FRICTION_FIELDS: readonly Field[] = [
  ['Friction roughness', ['friction', 'roughness'], ''],
  ['Friction susceptibility', ['friction', 'susceptibility'], ''],
];

/** The surface sounds by material: the rolling palette and the friction input. */
export function mountSurfaceSoundSettings(
  host: HTMLElement,
  initial: Readonly<Record<string, SurfaceSound>>,
  onChange: () => void,
) {
  return createRecordSoundSettings(
    host,
    'SURFACES · rolling palette and friction input',
    initial,
    () => [
      ['Rolling low', ['rolling', 'low'], ''],
      ['Rolling high', ['rolling', 'high'], ''],
      ['Texture length', ['rolling', 'textureLengthMeters'], 'm'],
      ['Texture depth', ['rolling', 'textureDepth'], ''],
      ...FRICTION_FIELDS,
    ],
    compileSurfaceSound,
    onChange,
    'Reset SURFACES to defaults',
  );
}

/** The wall sounds by ID: the friction input. */
export function mountWallSoundSettings(
  host: HTMLElement,
  initial: Readonly<Record<string, WallSound>>,
  onChange: () => void,
) {
  return createRecordSoundSettings(
    host,
    'WALLS · friction input',
    initial,
    () => FRICTION_FIELDS,
    (record) => Object.freeze({ friction: compileFrictionInput(record.friction) }),
    onChange,
    'Reset WALLS to defaults',
  );
}

/** The engine sounds by ID: each cylinder's primary length and each collector pipe's length. */
export function mountEngineSoundRecords(
  host: HTMLElement,
  initial: Readonly<Record<string, CompiledEngineSound>>,
  onChange: () => void,
) {
  return createRecordSoundSettings(
    host,
    'ENGINE SOUNDS · exhaust pipe lengths',
    initial,
    ({ exhaust }) => [
      ...exhaust.lengths.map((_, i): Field => [`Cylinder ${i + 1} primary`, ['exhaust', 'lengths', i], 'm']),
      ...exhaust.pipes.map(({ from, to }, i): Field => [
        `Pipe ${from} → ${to ?? 'open end'}`,
        ['exhaust', 'pipes', i, 'length'],
        'm',
      ]),
    ],
    ({ id, sha256, metadata, ...definition }) =>
      Object.freeze({ ...compileEngineSound(definition), id, sha256, metadata }),
    onChange,
    'Reset ENGINE SOUNDS to defaults',
  );
}
