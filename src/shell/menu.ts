import { TEXT_MARKS, TEXT_PALETTES } from '../image/text-tiles.js';
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
  /** An item that offers nothing: drawn DARK; a list skips it, and CONFIRM on it in a carousel denies. */
  readonly disabled?: boolean;
  /** A carousel's line two rows under the item, DARK. */
  readonly note?: string;
  /** CONFIRM on this item. */
  confirm?(): void;
  /** Its CONFIRM starts the run: it answers `entry` rather than `confirm`. */
  readonly entry?: boolean;
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

/**
 * How a menu shows its items. `carousel` shows one item at a time, which LEFT and RIGHT (and UP and DOWN) change,
 * wrapping at both ends; `list` shows every item on every second row, UP and DOWN moving over the selectable ones and
 * LEFT and RIGHT changing the current item's value.
 */
export type MenuLayout = 'carousel' | 'list';

/** A list to choose from: a title, items read at each use, and what BACK does. */
export interface MenuDefinition {
  readonly title: string;
  /** The title's text palette; WHITE when absent. */
  readonly titlePalette?: number;
  /** Lines of information between the title and the items: WHITE text, or segments in their own palettes. */
  readonly lines?: readonly MenuLine[];
  /** `carousel` when absent. */
  readonly layout?: MenuLayout;
  items(): readonly MenuItem[];
  back?(): void;
}

/** Columns between the carousel's arrows and its item: `<` and `>` stand four columns either side of the name. */
const ARROW_COLUMNS = 4;

/**
 * The one menu part every menu screen uses. A carousel shows one item at a time: LEFT/RIGHT and UP/DOWN change it,
 * wrapping at both ends, DARK items included, and CONFIRM on a DARK item denies. A list moves over the selectable items
 * with UP and DOWN, wrapping around, and LEFT/RIGHT go to the current item's value. CONFIRM goes to the current item's
 * action; BACK leaves. It writes the title and the items centred in the text grid: the current item YELLOW,
 * unselectable items DARK, the rest WHITE, a carousel's arrows WHITE. Text is never shortened, so a line longer than
 * the grid is a `RangeError`. The current item's `focus` follows the cursor from the menu's first command or drawing
 * until `leave`.
 */
export function createMenu(definition: MenuDefinition, initial = 0) {
  const carousel = (definition.layout ?? 'carousel') === 'carousel';
  const selectable = (items: readonly MenuItem[], i: number) =>
    i >= 0 && i < items.length && (carousel || !items[i]!.disabled);
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
    /**
     * One command and what it did: a change of item or value, a CONFIRM with an action (or a deny on a DARK item), or a
     * BACK that leaves.
     */
    command(command: MenuCommand): MenuResponse | null {
      const items = definition.items();
      if (!selectable(items, index)) index = first(items, 0);
      const before = index;
      const moves = carousel
        ? { LEFT: -1, UP: -1, RIGHT: 1, DOWN: 1 }
        : ({ UP: -1, DOWN: 1 } as Partial<Record<MenuCommand, -1 | 1>>);
      const step = moves[command as keyof typeof moves] as -1 | 1 | undefined;
      if (step) {
        move(step);
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
        if (item?.disabled) return 'deny';
        if (!item?.confirm) return null;
        item.confirm();
        return item.entry ? 'entry' : 'confirm';
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
      // The title, a blank row, any lines and another blank row, then the items: a carousel's one item, or a list's
      // items on every second row.
      const first = 2 + (lines.length > 0 ? lines.length + 1 : 0);
      const notes = items.some((item) => item.note !== undefined);
      const rows = carousel
        ? Math.min(1, items.length) + (notes ? ITEM_ROWS : 0)
        : Math.max(0, items.length * ITEM_ROWS - 1);
      const height = first + rows;
      if (height > TEXT_ROWS) throw new RangeError(`A menu of ${height} rows does not fit the text grid`);
      const top = Math.floor((TEXT_ROWS - height) / 2);
      writeCentred(text, top, definition.title, definition.titlePalette ?? TEXT_PALETTES.WHITE);
      lines.forEach((line, i) => writeLine(text, top + 2 + i, line));
      const label = (item: MenuItem) => (item.value === undefined ? item.label : `${item.label}  ${item.value}`);
      if (carousel) {
        const item = items[index];
        if (!item) return;
        const palette = item.disabled ? TEXT_PALETTES.DARK : TEXT_PALETTES.YELLOW;
        writeChoice(text, top + first, label(item), palette, items.length > 1);
        if (item.note) writeCentred(text, top + first + ITEM_ROWS, item.note, TEXT_PALETTES.DARK);
        return;
      }
      items.forEach((item, i) =>
        writeCentred(
          text,
          top + first + i * ITEM_ROWS,
          label(item),
          item.disabled ? TEXT_PALETTES.DARK : i === index ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.WHITE,
        ),
      );
    },
  });
}
export type Menu = ReturnType<typeof createMenu>;

/** Write `line` centred on `row`: WHITE text, or segments written one after another in their palettes. */
export function writeLine(text: TextLayer, row: number, line: MenuLine) {
  const segments = typeof line === 'string' ? [{ text: line, palette: TEXT_PALETTES.WHITE }] : line;
  let column = Math.floor((TEXT_COLUMNS - segments.reduce((n, segment) => n + segment.text.length, 0)) / 2);
  for (const segment of segments) {
    text.write(column, row, segment.text, segment.palette);
    column += segment.text.length;
  }
}

/**
 * Write one choice centred on `row` in `palette`, with WHITE `◀` and `▶` four columns either side when there is more
 * than one to choose from.
 */
export function writeChoice(text: TextLayer, row: number, label: string, palette: number, arrows = true) {
  const column = Math.floor((TEXT_COLUMNS - label.length) / 2);
  text.write(column, row, label, palette);
  if (!arrows) return;
  text.write(column - ARROW_COLUMNS, row, TEXT_MARKS.left, TEXT_PALETTES.WHITE);
  text.write(column + label.length + ARROW_COLUMNS - 1, row, TEXT_MARKS.right, TEXT_PALETTES.WHITE);
}

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
