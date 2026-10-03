import { TEXT_PALETTES } from '../image/text-tiles.js';
import { TEXT_COLUMNS, TEXT_ROWS, type TextLayer } from '../view/text-layer.js';
import type { MenuCommand } from '../input/menu-input.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Screen } from './screen-host.js';

/** The plain background of screens without a scene. */
export const SCREEN_BACKGROUND = 0;

/** One menu line and what choosing or adjusting it does. */
export interface MenuItem {
  readonly label: string;
  /** A value shown after the label. */
  readonly value?: string;
  /** An item that cannot be chosen: drawn DARK and skipped by the selection. */
  readonly disabled?: boolean;
  /** CONFIRM on this item. */
  confirm?(): void;
  /** LEFT (-1) or RIGHT (+1) on this item, changing its value. */
  adjust?(step: -1 | 1): void;
}

/** A list to choose from: a title, items read at each use, and what BACK does. */
export interface MenuDefinition {
  readonly title: string;
  /** The title's text palette; WHITE when absent. */
  readonly titlePalette?: number;
  items(): readonly MenuItem[];
  back?(): void;
}

/**
 * The one menu part every list screen uses. UP and DOWN move over the selectable items, wrapping around; CONFIRM
 * and LEFT/RIGHT go to the current item's own actions; BACK leaves. It writes the title and the items centred in
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
      else if (command === 'BACK') definition.back?.();
      else if (index < 0) return;
      else if (command === 'CONFIRM') items[index]!.confirm?.();
      else if (command === 'LEFT' || command === 'RIGHT') items[index]!.adjust?.(command === 'LEFT' ? -1 : 1);
    },
    write(text: TextLayer) {
      const items = definition.items();
      const top = Math.floor((TEXT_ROWS - (items.length + 2)) / 2);
      writeCentred(text, top, definition.title, definition.titlePalette ?? TEXT_PALETTES.WHITE);
      items.forEach((item, i) =>
        writeCentred(
          text,
          top + 2 + i,
          item.value === undefined ? item.label : `${item.label}  ${item.value}`,
          item.disabled ? TEXT_PALETTES.DARK : i === index ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.WHITE,
        ),
      );
    },
  });
}
export type Menu = ReturnType<typeof createMenu>;

/** Write `line` centred on `row` of the text grid. */
export function writeCentred(text: TextLayer, row: number, line: string, palette: number) {
  text.write(Math.floor((TEXT_COLUMNS - line.length) / 2), row, line, palette);
}

/** A screen showing one menu on the plain background. */
export function createMenuScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  definition: MenuDefinition,
  initial = 0,
): Screen {
  const menu = createMenu(definition, initial);
  return {
    live: false,
    tick() {},
    command: (command) => menu.command(command),
    render() {
      frame.clear(SCREEN_BACKGROUND);
      text.clear();
      menu.write(text);
      text.draw(frame);
      present();
    },
  };
}
