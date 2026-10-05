import { readSpriteAssets } from '../../src/vehicle/vehicle-sprite-library.js';
import type { VehicleSpriteSet } from '../../src/vehicle/vehicle-sprite-set.js';
import {
  addSetSprite,
  bindSetCell,
  createSpriteSet,
  removeSetSprite,
  replaceSetSprite,
  setBankDegrees,
  setBrakeLamp,
  type VehicleSpriteSetDocument,
} from '../graphics/sprite-set-operations.js';
import type { WorkbenchContext } from './workbench-context.js';
import type { ImportedMaster } from './sprite-source-view.js';
import { createSpritePreview, PREVIEW_DEPTH } from './sprite-preview.js';
import { make } from './dom.js';

/** Lamp colors before any set is open: the provisional coupe's. */
const FIRST_LAMP = { off: 12321, on: 32038 } as const;

/**
 * A vehicle sprite set: its yaw × bank grid of cells, each showing one of the set's images, edited by the sprite
 * operations (one step each); its lamp colors and lean; and a preview of the compiled library's set turned, leaned and
 * moved away with the product's drawing.
 */
export function mountSetView(element: HTMLElement, context: WorkbenchContext, master: () => ImportedMaster | null) {
  const set = make('select');
  const grid = make('table', '', { class: 'sprite-grid' });
  const images = make('ol', '', { start: '0', class: 'sprite-images' });
  const add = make('button', 'Add the imported image', { type: 'button' });
  const lampOff = make('input', '', { type: 'number', min: '0', max: '32767' });
  const lampOn = make('input', '', { type: 'number', min: '0', max: '32767' });
  const bankDegrees = make('input', '', { type: 'number', step: 'any' });
  const newName = make('input', '', { placeholder: 'new set name' });
  const newYaw = make('input', '', { type: 'number', value: '24', min: '1' });
  const newBank = make('input', '', { type: 'number', value: '1', min: '1' });
  const create = make('button', 'New set from the imported image', { type: 'button' });
  const yaw = make('input', '', { type: 'range', min: '0', value: '0', step: '1' });
  const bank = make('input', '', { type: 'range', min: '0', value: '0', step: '1' });
  const depth = make('input', '', {
    type: 'range',
    min: String(PREVIEW_DEPTH.min),
    max: String(PREVIEW_DEPTH.max),
    step: '0.5',
    value: '6',
  });
  const preview = createSpritePreview();
  const note = make('p', '', { role: 'status' });
  const field = (text: string, control: HTMLElement) => {
    const label = make('label', `${text} `);
    label.append(control);
    return label;
  };
  element.append(
    make('h2', 'Sets'),
    field('Set', set),
    ' ',
    field('Lamp off', lampOff),
    field('on', lampOn),
    ' ',
    field('Bank degrees', bankDegrees),
    make('p', 'Choose a cell, then an image to show in it.', { class: 'hint' }),
    grid,
    images,
    add,
    make('p'),
    newName,
    ' ',
    field('yaw', newYaw),
    field('bank', newBank),
    ' ',
    create,
    make('h2', 'Set preview (compiled library)'),
    preview.canvas,
    make('br'),
    field('Yaw', yaw),
    ' ',
    field('Bank', bank),
    ' ',
    field('Depth (m)', depth),
    note,
  );

  let name: string | null = null,
    value: VehicleSpriteSetDocument | null = null,
    cell: { yaw: number; bank: number } | null = null;
  const path = () => `sprites/${name}.json`;
  const save = (next: VehicleSpriteSetDocument, label: string) => context.replace(path(), next, `${label} (${name})`);
  const attempt = (edit: () => void) => {
    try {
      edit();
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      note.textContent = error.message;
    }
  };

  /** The compiled library's set, from the latest products that compiled. */
  const compiled = (): VehicleSpriteSet | null => {
    const state = context.compile();
    const products = state.status === 'failed' ? (state.unmeasured ?? state.last) : state.last;
    const library = products?.files.find((file) => file.kind === 'image' && file.id === 'vehicles');
    if (!library || !name) return null;
    return readSpriteAssets(JSON.parse(new TextDecoder().decode(library.bytes))).sets[name] ?? null;
  };
  const drawPreview = () => {
    const shown = compiled();
    if (!shown) {
      preview.draw([], Number(depth.value));
      return;
    }
    yaw.max = String(shown.yawVariants - 1);
    bank.max = String(shown.bankVariants - 1);
    const asset = shown.assets[Number(yaw.value)]?.[Number(bank.value)];
    if (!asset) return;
    const palette = Object.keys(asset.palettes)[0]!;
    const levels = preview.draw(
      [
        { asset, palette, lamp: shown.brakeLamp.off },
        { asset, palette, lamp: shown.brakeLamp.on },
      ],
      Number(depth.value),
    );
    note.textContent = `Yaw ${yaw.value}, bank ${bank.value} at ${depth.value} m: level ${levels[0]} of ${asset.levels.length}; lamp off and on.`;
  };

  const show = async () => {
    const names = context
      .paths()
      .filter((p) => /^sprites\/[^/]+\.json$/.test(p))
      .map((p) => p.slice('sprites/'.length, -'.json'.length));
    if (names.join() !== [...set.options].map((o) => o.value).join()) {
      const chosen = set.value;
      set.replaceChildren(...names.map((n) => make('option', n, { value: n })));
      if (names.includes(chosen)) set.value = chosen;
    }
    if (set.value !== name) cell = null;
    name = set.value || null;
    value = null;
    if (name)
      try {
        value = JSON.parse(new TextDecoder().decode(await context.store.read(path()))) as VehicleSpriteSetDocument;
      } catch {
        note.textContent = `${path()} is not JSON.`;
      }
    if (!value) {
      grid.replaceChildren();
      images.replaceChildren();
      return;
    }
    for (const [input, text] of [
      [lampOff, value.brakeLamp?.off],
      [lampOn, value.brakeLamp?.on],
      [bankDegrees, value.bankDegrees ?? ''],
    ] as const)
      if (document.activeElement !== input) input.value = String(text ?? '');
    bankDegrees.disabled = value.bankVariants <= 1;
    const header = make('tr');
    header.append(
      make('th', 'yaw \\ bank'),
      ...Array.from({ length: value.bankVariants }, (_, b) => make('th', String(b))),
    );
    grid.replaceChildren(
      header,
      ...value.assets.map((row, y) => {
        const line = make('tr');
        line.append(make('th', String(y)));
        row.forEach((index, b) => {
          const button = make('button', `${index} ${value!.sprites[index]?.name ?? '?'}`, {
            type: 'button',
            'data-cell': `${y}:${b}`,
          });
          if (cell?.yaw === y && cell.bank === b) button.classList.add('active');
          button.addEventListener('click', () => {
            cell = { yaw: y, bank: b };
            yaw.value = String(y);
            bank.value = String(b);
            void refresh();
          });
          const td = make('td');
          td.append(button);
          line.append(td);
        });
        return line;
      }),
    );
    const used = value.assets.flat();
    images.replaceChildren(
      ...value.sprites.map((sprite, index) => {
        const item = make('li');
        const showIt = make('button', cell ? `Show in ${cell.yaw}:${cell.bank}` : 'Choose a cell', {
          type: 'button',
          'data-image': String(index),
        });
        showIt.disabled = !cell;
        showIt.addEventListener('click', () =>
          attempt(
            () =>
              cell &&
              save(bindSetCell(value!, cell.yaw, cell.bank, index), `Show image ${index} in ${cell.yaw}:${cell.bank}`),
          ),
        );
        const replace = make('button', 'Replace with the imported image', { type: 'button' });
        replace.addEventListener('click', () =>
          attempt(() => {
            const imported = master();
            if (imported) save(replaceSetSprite(value!, index, imported.master), `Replace image ${index}`);
          }),
        );
        const remove = make('button', 'Remove', { type: 'button' });
        remove.disabled = used.includes(index);
        remove.addEventListener('click', () =>
          attempt(() => save(removeSetSprite(value!, index), `Remove image ${index}`)),
        );
        item.append(
          `${sprite.name} (${sprite.width} × ${sprite.height}, ${used.filter((i) => i === index).length} cells) `,
          showIt,
          ' ',
          replace,
          ' ',
          remove,
        );
        return item;
      }),
    );
    add.disabled = !master() || master()!.recipe.target !== 'vehicle';
    create.disabled = add.disabled;
    drawPreview();
  };
  let showing = Promise.resolve();
  const refresh = () => (showing = showing.then(show));
  context.subscribe(() => void refresh());
  set.addEventListener('change', () => void refresh());
  for (const input of [yaw, bank, depth]) input.addEventListener('input', drawPreview);
  void refresh();

  add.addEventListener('click', () =>
    attempt(() => {
      const imported = master();
      if (value && imported) save(addSetSprite(value, imported.master), `Add image ${imported.name}`);
    }),
  );
  const lamp = () =>
    attempt(
      () =>
        value && save(setBrakeLamp(value, { off: Number(lampOff.value), on: Number(lampOn.value) }), 'Set lamp colors'),
    );
  lampOff.addEventListener('change', lamp);
  lampOn.addEventListener('change', lamp);
  bankDegrees.addEventListener('change', () =>
    attempt(() => value && save(setBankDegrees(value, Number(bankDegrees.value)), 'Set bank degrees')),
  );
  create.addEventListener('click', () =>
    attempt(() => {
      const imported = master();
      const chosen = newName.value.trim();
      if (!imported || !/^[a-z0-9][a-z0-9_-]*$/i.test(chosen)) {
        note.textContent = 'Import a vehicle image and name the set (letters, digits, - and _).';
        return;
      }
      const bankVariants = Number(newBank.value);
      const next = createSpriteSet(
        { yawVariants: Number(newYaw.value), bankVariants, ...(bankVariants > 1 ? { bankDegrees: 60 } : {}) },
        value?.brakeLamp ?? FIRST_LAMP,
        imported.master,
      );
      context.replace(`sprites/${chosen}.json`, next, `New set ${chosen}`);
      newName.value = '';
      set.value = chosen;
    }),
  );

  return {
    /** The open set's lamp colors, which the import preview uses. */
    lamp: () => value?.brakeLamp ?? FIRST_LAMP,
  };
}
