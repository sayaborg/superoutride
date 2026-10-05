import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import type { SpriteAsset } from '../../src/image/sprite.js';
import type { VehicleSpriteSet } from '../../src/vehicle/vehicle-sprite-set.js';
import { NO_ADJUSTMENT, type PaletteAdjustment } from '../graphics/oklab.js';
import { BRAKE_LAMP_SLOT } from '../graphics/sprite-import.js';
import {
  addSetPalette,
  adjustSetPalette,
  removeSetPalette,
  renameSetPalette,
  setSlotColor,
  type VehicleSpriteSetDocument,
} from '../graphics/sprite-set-operations.js';
import type { WorkbenchContext } from './workbench-context.js';
import { createSpritePreview } from './sprite-preview.js';
import { make } from './dom.js';

/** The name the adjustment previews under before it is saved. */
const PREVIEW_PALETTE = '(adjusting)';

/**
 * The open set's named palettes: added, renamed and removed for every image at once; a new palette derived by an Oklab
 * adjustment of chosen slots, previewed on every image of the set as the sliders move and saved as one step; one slot
 * of one image's palette set directly; and every color with the lamp off and on.
 */
export function mountPaletteView(
  element: HTMLElement,
  context: WorkbenchContext,
  open: () => {
    readonly path: string;
    readonly value: VehicleSpriteSetDocument;
    readonly compiled: VehicleSpriteSet | null;
    readonly cell: { readonly yaw: number; readonly bank: number };
  } | null,
) {
  const palettes = make('ul', '', { class: 'palette-list' });
  const from = make('select');
  const slots = make('span');
  const sliders = {
    hue: slider(-180, 180, 1),
    saturation: slider(-1, 1, 0.01),
    lightness: slider(-0.5, 0.5, 0.01),
    tintHue: slider(-180, 180, 1),
    tintAmount: slider(0, 0.2, 0.002),
  };
  const newName = make('input', '', { placeholder: 'new palette name' });
  const save = make('button', 'Save as a new palette', { type: 'button' });
  const reset = make('button', 'Reset', { type: 'button' });
  const adjustPreview = createSpritePreview();
  const statesPreview = createSpritePreview();
  const slotImage = make('input', '', { type: 'number', min: '0', value: '0' });
  const slotPalette = make('select');
  const slotIndex = make('input', '', { type: 'number', min: '1', max: '14', value: '1' });
  const slotColor = make('input', '', { type: 'number', min: '0', max: '32767' });
  const setSlot = make('button', 'Set slot color', { type: 'button' });
  const note = make('p', '', { role: 'status' });
  const field = (text: string, control: HTMLElement) => {
    const label = make('label', `${text} `);
    label.append(control);
    return label;
  };
  // The controls beside the two previews.
  const column = (...children: (string | HTMLElement)[]) => {
    const div = make('div');
    div.append(...children);
    return div;
  };
  const panes = make('div', '', { class: 'side-by-side' });
  panes.append(
    column(
      palettes,
      make('h3', 'Adjust (Oklab)'),
      field('From', from),
      make('p'),
      'Slots: ',
      slots,
      make('p'),
      field('Hue', sliders.hue),
      field('Saturation', sliders.saturation),
      field('Lightness', sliders.lightness),
      field('Tint hue', sliders.tintHue),
      field('Tint amount', sliders.tintAmount),
      make('p'),
      newName,
      ' ',
      save,
      ' ',
      reset,
      make('h3', 'One slot'),
      field('Image', slotImage),
      field('Palette', slotPalette),
      field('Slot', slotIndex),
      field('RGB555', slotColor),
      ' ',
      setSlot,
      note,
    ),
    column(
      make('p', 'Every image of the set, adjusted:', { class: 'hint' }),
      adjustPreview.canvas,
      make('p', 'Every color, lamp off and on (the chosen cell):', { class: 'hint' }),
      statesPreview.canvas,
    ),
  );
  element.append(make('h2', 'Palettes'), panes);
  for (let slot = 1; slot < BRAKE_LAMP_SLOT; slot++) {
    const box = make('input', '', { type: 'checkbox', value: String(slot), 'data-slot': String(slot) });
    const label = make('label', '', { class: 'slot' });
    label.append(box, make('span', '', { class: 'swatch' }), String(slot));
    slots.append(label);
  }
  const attempt = (edit: () => void) => {
    try {
      edit();
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      note.textContent = error.message;
    }
  };
  const adjustment = (): PaletteAdjustment => ({
    ...NO_ADJUSTMENT,
    hue: Number(sliders.hue.value),
    saturation: Number(sliders.saturation.value),
    lightness: Number(sliders.lightness.value),
    tint: { hue: Number(sliders.tintHue.value), amount: Number(sliders.tintAmount.value) },
  });
  const chosenSlots = () =>
    [...slots.querySelectorAll<HTMLInputElement>('input:checked')].map((box) => Number(box.value));

  /** Each compiled image of the set with palette `name` set to `colors` from `value`'s same image. */
  const withColors = (compiled: VehicleSpriteSet, value: VehicleSpriteSetDocument, name: string) => {
    const images: SpriteAsset[] = [];
    const seen = new Set<SpriteAsset>();
    compiled.assets.forEach((row, y) =>
      row.forEach((asset, b) => {
        if (seen.has(asset)) return;
        seen.add(asset);
        // A compiled library behind the document (a compile still running) shows what it has.
        const colors = value.sprites[value.assets[y]?.[b] ?? -1]?.palettes[name]?.colors;
        if (!colors) return;
        images.push({
          ...asset,
          palettes: { ...asset.palettes, [name]: { colors: [...colors, compiled.brakeLamp.off] } },
        });
      }),
    );
    return images;
  };
  const drawAdjusted = () => {
    const current = open();
    if (!current?.compiled) return;
    attempt(() => {
      const adjusted = adjustSetPalette(current.value, from.value, PREVIEW_PALETTE, chosenSlots(), adjustment());
      const images = withColors(current.compiled!, adjusted, PREVIEW_PALETTE);
      adjustPreview.draw(
        images.map((asset) => ({ asset, palette: PREVIEW_PALETTE, lamp: current.compiled!.brakeLamp.off })),
        6,
        Math.ceil(Math.sqrt(images.length)),
      );
    });
  };
  const show = () => {
    const current = open();
    if (!current) {
      palettes.replaceChildren();
      return;
    }
    const { value, compiled, cell } = current;
    const names = Object.keys(value.sprites[0]?.palettes ?? {});
    for (const select of [from, slotPalette])
      if (names.join() !== [...select.options].map((o) => o.value).join()) {
        const chosen = select.value;
        select.replaceChildren(...names.map((n) => make('option', n, { value: n })));
        if (names.includes(chosen)) select.value = chosen;
      }
    palettes.replaceChildren(
      ...names.map((name) => {
        const item = make('li');
        const copy = make('button', 'Copy as…', { type: 'button' });
        copy.addEventListener('click', () =>
          attempt(() => {
            const to = newName.value.trim();
            context.replace(current.path, addSetPalette(value, to, name), `Add palette ${to}`);
          }),
        );
        const rename = make('button', 'Rename to…', { type: 'button' });
        rename.addEventListener('click', () =>
          attempt(() => {
            const to = newName.value.trim();
            context.replace(current.path, renameSetPalette(value, name, to), `Rename palette ${name} to ${to}`);
          }),
        );
        const remove = make('button', 'Remove', { type: 'button' });
        remove.addEventListener('click', () =>
          attempt(() => context.replace(current.path, removeSetPalette(value, name), `Remove palette ${name}`)),
        );
        item.append(`${name} `, copy, ' ', rename, ' ', remove, ' (the name field names the new one)');
        return item;
      }),
    );
    // The chosen source palette's colors on the slot boxes, from the cell's image.
    const image = value.sprites[value.assets[cell.yaw]?.[cell.bank] ?? 0];
    for (const label of slots.children) {
      const slot = Number((label.querySelector('input') as HTMLInputElement).value);
      const color = image?.palettes[from.value]?.colors[slot];
      const box = label.querySelector<HTMLElement>('.swatch')!;
      if (color !== undefined) {
        const { r, g, b } = unpackRgba(rgb555ToRgba(color));
        box.style.background = `rgb(${r} ${g} ${b})`;
      }
    }
    if (!compiled) return;
    drawAdjusted();
    const asset = compiled.assets[cell.yaw]?.[cell.bank];
    if (asset)
      statesPreview.draw(
        // The compiled image's own palettes: the document's may be ahead of the compile.
        Object.keys(asset.palettes).flatMap((palette) => [
          { asset, palette, lamp: compiled.brakeLamp.off },
          { asset, palette, lamp: compiled.brakeLamp.on },
        ]),
        6,
        2,
      );
  };

  for (const input of [...Object.values(sliders), from]) input.addEventListener('input', drawAdjusted);
  slots.addEventListener('change', show);
  from.addEventListener('change', show);
  reset.addEventListener('click', () => {
    for (const input of Object.values(sliders)) input.value = '0';
    drawAdjusted();
  });
  save.addEventListener('click', () =>
    attempt(() => {
      const current = open();
      const to = newName.value.trim();
      if (!current) return;
      context.replace(
        current.path,
        adjustSetPalette(current.value, from.value, to, chosenSlots(), adjustment()),
        `Adjust ${from.value} into ${to}`,
      );
    }),
  );
  setSlot.addEventListener('click', () =>
    attempt(() => {
      const current = open();
      if (!current) return;
      context.replace(
        current.path,
        setSlotColor(
          current.value,
          Number(slotImage.value),
          slotPalette.value,
          Number(slotIndex.value),
          Number(slotColor.value),
        ),
        `Set ${slotPalette.value} slot ${slotIndex.value} of image ${slotImage.value}`,
      );
    }),
  );
  return { show };
}

function slider(min: number, max: number, step: number) {
  return make('input', '', { type: 'range', min: String(min), max: String(max), step: String(step), value: '0' });
}
