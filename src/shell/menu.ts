import { TEXT_PALETTES } from '../image/text-tiles.js';
import { TEXT_COLUMNS, TEXT_ROWS, type TextLayer } from '../view/text-layer.js';
import type { MenuCommand } from '../input/menu-input.js';

/** One menu line. */
export interface MenuItem {
  readonly label: string;
  /** A value shown after the label; LEFT and RIGHT change it. */
  readonly value?: string;
  /** An item that cannot be chosen: drawn DARK and skipped by the selection. */
  readonly disabled?: boolean;
}

/** A list to choose from: a title, items read at each use, and what CONFIRM, BACK and LEFT/RIGHT do. */
export interface MenuDefinition {
  readonly title: string;
  items(): readonly MenuItem[];
  confirm(index: number): void;
  back?(): void;
  adjust?(index: number, step: -1 | 1): void;
}

/**
 * The one menu part every list screen uses. UP and DOWN move over the selectable items, wrapping around; CONFIRM
 * chooses the current item; LEFT and RIGHT change its value; BACK leaves. It writes the title and the items centred in
 * the text grid: the current item YELLOW, unselectable items DARK, the rest WHITE. Text is never shortened, so a line
 * longer than the grid is a `RangeError`.
 */
export function createMenu(definition: MenuDefinition, initial = 0) {
  const selectable = (items: readonly MenuItem[], i: number) => i >= 0 && i < items.length && !items[i]!.disabled;
  const first = (items: readonly MenuItem[], from: number) => {
    for (let i = 0; i < items.length; i++)
      if (selectable(items, (from + i) % items.length)) return (from + i) % items.length;
    return -1;
  };
  let index = first(definition.items(), Math.max(0, initial));
  const move = (step: 1 | -1) => {
    const items = definition.items();
    for (let i = 1; i <= items.length; i++) {
      const next = (((index + step * i) % items.length) + items.length) % items.length;
      if (selectable(items, next)) {
        index = next;
        return;
      }
    }
  };
  return Object.freeze({
    get index() {
      return index;
    },
    command(command: MenuCommand) {
      const items = definition.items();
      if (!selectable(items, index)) index = first(items, 0);
      if (command === 'UP') move(-1);
      else if (command === 'DOWN') move(1);
      else if (command === 'CONFIRM' && index >= 0) definition.confirm(index);
      else if (command === 'BACK') definition.back?.();
      else if ((command === 'LEFT' || command === 'RIGHT') && index >= 0)
        definition.adjust?.(index, command === 'LEFT' ? -1 : 1);
    },
    write(text: TextLayer) {
      const items = definition.items();
      const centre = (row: number, line: string, palette: number) =>
        text.write(Math.floor((TEXT_COLUMNS - line.length) / 2), row, line, palette);
      const top = Math.floor((TEXT_ROWS - (items.length + 2)) / 2);
      centre(top, definition.title, TEXT_PALETTES.WHITE);
      items.forEach((item, i) =>
        centre(
          top + 2 + i,
          item.value === undefined ? item.label : `${item.label}  ${item.value}`,
          item.disabled ? TEXT_PALETTES.DARK : i === index ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.WHITE,
        ),
      );
    },
  });
}
export type Menu = ReturnType<typeof createMenu>;
