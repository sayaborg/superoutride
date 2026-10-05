import { TEXT_PALETTES } from '../image/text-tiles.js';
import { TEXT_COLUMNS, TEXT_ROWS, type TextLayer } from '../view/text-layer.js';
import type { MenuCommand } from '../input/menu-input.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { MenuResponse, Screen } from './screen-host.js';

/** The plain background of screens without a scene. */
export const SCREEN_BACKGROUND = 0;

/** Rows from one menu item to the next: items sit on every second row. */
const ITEM_ROWS = 2;

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
  /**
   * The cursor came to this item while its menu is shown; the returned function is called once when the cursor
   * leaves the item or the menu's screen is left.
   */
  focus?(): () => void;
}

/** A line of text in WHITE, or segments written one after another in their palettes. */
export type MenuLine = string | readonly { readonly text: string; readonly palette: number }[];

/** A list to choose from: a title, items read at each use, and what BACK does. */
export interface MenuDefinition {
  readonly title: string;
  /** The title's text palette; WHITE when absent. */
  readonly titlePalette?: number;
  /** Lines of information between the title and the items: WHITE text, or segments in their own palettes. */
  readonly lines?: readonly MenuLine[];
  items(): readonly MenuItem[];
  back?(): void;
}

/**
 * The one menu part every list screen uses. UP and DOWN move over the selectable items, wrapping around; CONFIRM
 * and LEFT/RIGHT go to the current item's own actions; BACK leaves. It writes the title and the items centred in
 * the text grid: the current item YELLOW, unselectable items DARK, the rest WHITE. Text is never shortened, so a line
 * longer than the grid is a `RangeError`. The current item's `focus` follows the cursor from the menu's first command or
 * drawing until `leave`.
 */
export function createMenu(definition: MenuDefinition, initial = 0) {
  const selectable = (items: readonly MenuItem[], i: number) => i >= 0 && i < items.length && !items[i]!.disabled;
  const first = (items: readonly MenuItem[], from: number) => {
    for (let i = 0; i < items.length; i++)
      if (selectable(items, (from + i) % items.length)) return (from + i) % items.length;
    return -1;
  };
  let index = first(definition.items(), Math.max(0, initial));
  // The item whose focus is held, and its release.
  let focused = -1,
    release: (() => void) | null = null;
  const leave = () => {
    release?.();
    release = null;
    focused = -1;
  };
  const settle = () => {
    if (index === focused) return;
    leave();
    focused = index;
    release = definition.items()[index]?.focus?.() ?? null;
  };
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
    /** One command and what it did: a cursor move or value change, a CONFIRM with an action, or a BACK that leaves. */
    command(command: MenuCommand): MenuResponse | null {
      const items = definition.items();
      if (!selectable(items, index)) index = first(items, 0);
      const before = index;
      if (command === 'UP' || command === 'DOWN') {
        move(command === 'UP' ? -1 : 1);
        settle();
        return index === before ? null : 'move';
      }
      if (command === 'BACK') {
        if (!definition.back) return null;
        definition.back();
        return 'back';
      }
      const item = index < 0 ? undefined : items[index];
      if (command === 'CONFIRM') {
        if (!item?.confirm) return null;
        item.confirm();
        return 'confirm';
      }
      if ((command === 'LEFT' || command === 'RIGHT') && item?.adjust) {
        item.adjust(command === 'LEFT' ? -1 : 1);
        return definition.items()[index]?.value === item.value ? null : 'move';
      }
      return null;
    },
    /** The menu's screen is left: release the current item's focus. */
    leave,
    write(text: TextLayer) {
      settle();
      const items = definition.items(),
        lines = definition.lines ?? [];
      // The title, a blank row, any lines and another blank row, then the items on every second row.
      const first = 2 + (lines.length > 0 ? lines.length + 1 : 0);
      const height = first + Math.max(0, items.length * ITEM_ROWS - 1);
      if (height > TEXT_ROWS) throw new RangeError(`A menu of ${height} rows does not fit the text grid`);
      const top = Math.floor((TEXT_ROWS - height) / 2);
      writeCentred(text, top, definition.title, definition.titlePalette ?? TEXT_PALETTES.WHITE);
      lines.forEach((line, i) => {
        const segments = typeof line === 'string' ? [{ text: line, palette: TEXT_PALETTES.WHITE }] : line;
        let column = Math.floor((TEXT_COLUMNS - segments.reduce((n, segment) => n + segment.text.length, 0)) / 2);
        for (const segment of segments) {
          text.write(column, top + 2 + i, segment.text, segment.palette);
          column += segment.text.length;
        }
      });
      items.forEach((item, i) =>
        writeCentred(
          text,
          top + first + i * ITEM_ROWS,
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
    leave: () => menu.leave(),
    render() {
      frame.clear(SCREEN_BACKGROUND);
      text.clear();
      menu.write(text);
      text.draw(frame);
      present();
    },
  };
}
