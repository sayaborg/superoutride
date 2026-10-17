import {
  checkPuffAmounts,
  checkPuffMotion,
  puffKindPalettes,
  type CompiledPuffs,
  type PuffDocument,
  type PuffKindRecord,
  type PuffMotion,
  type PuffSurfaceRecord,
} from '../../content/puff-catalog.js';

const MOTION_FIELDS: readonly (readonly [label: string, key: keyof PuffMotion, unit: string])[] = [
  ['Release', 'releaseDegrees', '°'],
  ['Response', 'responseSeconds', 's'],
  ['Rise', 'riseMps', 'm/s'],
  ['Start diameter', 'startDiameterMeters', 'm'],
  ['Growth', 'growthMps', 'm/s'],
  ['Life', 'lifeSeconds', 's'],
];
const AMOUNT_FIELDS: readonly (readonly [label: string, key: 'metersPerPuff' | 'joulesPerPuff', unit: string])[] = [
  ['Rolling', 'metersPerPuff', 'm per puff'],
  ['Sliding', 'joulesPerPuff', 'J per puff'],
];

/**
 * DEV's PUFFS group: a chosen kind's six motion values and a chosen surface's kind, palette and two amounts, as number
 * fields (an empty amount is null, none) and choices. `checkPuffMotion` and `checkPuffAmounts` are the values' one
 * check and a surface's palette is one every picture of its kind has; a value refused keeps the previous one. The group
 * starts from, and its reset returns to, the delivered document; `read` returns the same object until a value changes.
 * A change applies to the puffs thrown after it.
 */
export function mountPuffSettings(host: HTMLElement, puffs: CompiledPuffs) {
  const initial = puffs.source;
  let current: PuffDocument = initial;
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'PUFFS · tire smoke, spray and dust';
  const note = document.createElement('p');
  note.textContent =
    'Starting values without a measured basis. Initial values come from the puff document. Reloading restores them.';
  // Keys typed here belong to the group, not to driving.
  const key = (event: Event): void => event.stopPropagation();
  const listeners: { readonly element: HTMLElement; readonly type: string; readonly listener: () => void }[] = [];
  const listen = (element: HTMLElement, type: string, listener: () => void) => {
    element.addEventListener(type, listener);
    listeners.push({ element, type, listener });
  };
  const select = (label: string, options: readonly string[]) => {
    const element = document.createElement('select');
    element.setAttribute('aria-label', label);
    for (const option of options) element.append(new Option(option, option));
    element.addEventListener('keydown', key);
    return element;
  };
  const labelled = (label: string, input: HTMLElement, unit: string) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'range-control';
    wrapper.append(`${label} `, input, unit ? ` ${unit}` : '');
    return wrapper;
  };
  const numberInput = (label: string) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.setAttribute('aria-label', label);
    input.addEventListener('keydown', key);
    return input;
  };

  const kindChoice = select('PUFFS kind', Object.keys(initial.kinds));
  const motionInputs = MOTION_FIELDS.map(([label, field, unit]) => {
    const input = numberInput(label);
    listen(input, 'change', () => {
      const id = kindChoice.value;
      const kind: PuffKindRecord = { ...current.kinds[id]!, [field]: Number(input.value) };
      try {
        checkPuffMotion(kind);
      } catch {
        // The kind's value check refused it: keep the previous value.
        input.value = String(current.kinds[id]![field]);
        return;
      }
      current = { ...current, kinds: { ...current.kinds, [id]: kind } };
    });
    return { input, field, row: labelled(label, input, unit) };
  });
  const showKind = () => {
    for (const { input, field } of motionInputs) input.value = String(current.kinds[kindChoice.value]![field]);
  };

  const surfaceChoice = select('PUFFS surface', Object.keys(initial.surfaces));
  const surfaceKind = select('Kind', Object.keys(initial.kinds));
  const surfacePalette = select('Palette', []);
  const amountInputs = AMOUNT_FIELDS.map(([label, field, unit]) => ({
    input: numberInput(label),
    field,
    label,
    unit,
  }));
  const setSurface = (record: PuffSurfaceRecord) => {
    current = { ...current, surfaces: { ...current.surfaces, [surfaceChoice.value]: record } };
  };
  const showPalettes = (kind: string, palette: string) => {
    surfacePalette.replaceChildren(...puffKindPalettes(puffs.pictures[kind]!).map((name) => new Option(name, name)));
    surfacePalette.value = palette;
  };
  const showSurface = () => {
    const record = current.surfaces[surfaceChoice.value]!;
    surfaceKind.value = record.kind;
    showPalettes(record.kind, record.palette);
    for (const { input, field } of amountInputs) input.value = record[field] === null ? '' : String(record[field]);
  };
  // A kind whose pictures lack the surface's palette takes the first palette they all have.
  listen(surfaceKind, 'change', () => {
    const record = current.surfaces[surfaceChoice.value]!;
    const palettes = puffKindPalettes(puffs.pictures[surfaceKind.value]!);
    setSurface({
      ...record,
      kind: surfaceKind.value,
      palette: palettes.includes(record.palette) ? record.palette : palettes[0]!,
    });
    showSurface();
  });
  listen(surfacePalette, 'change', () =>
    setSurface({ ...current.surfaces[surfaceChoice.value]!, palette: surfacePalette.value }),
  );
  for (const { input, field } of amountInputs)
    listen(input, 'change', () => {
      const record = {
        ...current.surfaces[surfaceChoice.value]!,
        [field]: input.value === '' ? null : Number(input.value),
      };
      try {
        checkPuffAmounts(record);
      } catch {
        // The amounts' value check refused it: keep the previous value.
        showSurface();
        return;
      }
      setSurface(record);
    });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'selector-button';
  reset.textContent = 'Reset PUFFS to defaults';
  listen(reset, 'click', () => {
    current = initial;
    showKind();
    showSurface();
  });
  listen(kindChoice, 'change', showKind);
  listen(surfaceChoice, 'change', showSurface);
  showKind();
  showSurface();
  fieldset.replaceChildren(
    legend,
    note,
    kindChoice,
    ...motionInputs.map(({ row }) => row),
    surfaceChoice,
    labelled('Kind', surfaceKind, ''),
    labelled('Palette', surfacePalette, ''),
    ...amountInputs.map(({ input, label, unit }) => labelled(label, input, unit)),
    reset,
  );
  host.replaceChildren(fieldset);
  return {
    /** The current puff document: what the run's puffs are thrown with and the export saves. */
    read: (): PuffDocument => current,
    dispose(): void {
      for (const { element, type, listener } of listeners) element.removeEventListener(type, listener);
      for (const element of [
        kindChoice,
        surfaceChoice,
        surfaceKind,
        surfacePalette,
        ...motionInputs.map((m) => m.input),
      ])
        element.removeEventListener('keydown', key);
      for (const { input } of amountInputs) input.removeEventListener('keydown', key);
      host.replaceChildren();
    },
  };
}
