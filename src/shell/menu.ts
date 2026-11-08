import { TEXT_FONTS, TEXT_MARKS, TEXT_PALETTES, type TextFont } from '../image/text-tiles.js';
import { TEXT_COLUMNS, TEXT_ROWS, type TextLayer } from '../view/text-layer.js';
import type { MenuCommand } from '../input/menu-input.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { MenuResponse, Screen } from './screen-host.js';

/** The plain background of screens without a scene. */
export const SCREEN_BACKGROUND = 0;

/** One menu item and what CONFIRM on it does. */
export interface MenuItem {
  readonly label: string;
  /** CONFIRM on this item. */
  confirm?(): void;
}

/**
 * A line of text in WHITE, or segments written one after another in their palettes and fonts (`normal` when absent); a
 * line is as many rows high as its tallest font.
 */
export type MenuLine =
  string | readonly { readonly text: string; readonly palette: number; readonly font?: TextFont }[];

/** A carousel to choose from: a title, items read at each use, and what BACK does. */
export interface MenuDefinition {
  readonly title: string;
  /** The title's text palette; WHITE when absent. */
  readonly titlePalette?: number;
  /** The title's font; `normal` when absent. */
  readonly titleFont?: TextFont;
  /** Lines of information between the title and the items: WHITE text, or segments in their own palettes and fonts. */
  readonly lines?: readonly MenuLine[];
  items(): readonly MenuItem[];
  back?(): void;
}

/** Columns between the carousel's arrows and its item: `<` and `>` stand four columns either side of the name. */
const ARROW_COLUMNS = 4;
/** The longest choice its arrows stand beside: 40 columns less the two arrows four columns either side. */
const BESIDE_ARROWS_COLUMNS = TEXT_COLUMNS - 2 * ARROW_COLUMNS;

/**
 * The carousel the screens outside the rows use: PAUSE, RESULT and LOAD FAILED. It shows one item at a time, which
 * LEFT and RIGHT change, wrapping at both ends; CONFIRM goes to the current item's action and BACK leaves. It writes the
 * title, any lines and the item centred in the text grid: the item YELLOW between WHITE arrows when there are several.
 * Text is never shortened, so a line longer than the grid is a `RangeError`.
 */
export function createMenu(definition: MenuDefinition, initial = 0) {
  let index = Math.max(0, Math.min(definition.items().length - 1, initial));
  return Object.freeze({
    get index() {
      return index;
    },
    /** One command and what it did: a change of item, a CONFIRM with an action, or a BACK that leaves. */
    command(command: MenuCommand): MenuResponse | null {
      const items = definition.items();
      if (command === 'LEFT' || command === 'RIGHT') {
        if (items.length < 2) return null;
        index = (index + (command === 'LEFT' ? -1 : 1) + items.length) % items.length;
        return 'move';
      }
      if (command === 'BACK') {
        if (!definition.back) return null;
        definition.back();
        return 'back';
      }
      const item = items[index];
      if (command === 'CONFIRM' && item?.confirm) {
        item.confirm();
        return 'confirm';
      }
      return null;
    },
    write(text: TextLayer) {
      const items = definition.items(),
        lines = definition.lines ?? [];
      // The title, a blank row, any lines and another blank row, then the item.
      const titleRows = TEXT_FONTS[definition.titleFont ?? 'normal'].rows,
        lineRows = lines.map(rowsOf),
        linesHeight = lineRows.reduce((n, rows) => n + rows, 0);
      const first = titleRows + 1 + (lines.length > 0 ? linesHeight + 1 : 0);
      const height = first + Math.min(1, items.length);
      if (height > TEXT_ROWS) throw new RangeError(`A menu of ${height} rows does not fit the text grid`);
      const top = Math.floor((TEXT_ROWS - height) / 2);
      writeCentred(text, top, definition.title, definition.titlePalette ?? TEXT_PALETTES.WHITE, definition.titleFont);
      lines.reduce(
        (row, line, i) => {
          writeLine(text, row, line);
          return row + lineRows[i]!;
        },
        top + titleRows + 1,
      );
      const item = items[index];
      if (item) writeChoice(text, top + first, item.label, TEXT_PALETTES.YELLOW, items.length > 1);
    },
  });
}
export type Menu = ReturnType<typeof createMenu>;

const segmentsOf = (line: MenuLine) =>
  typeof line === 'string' ? [{ text: line, palette: TEXT_PALETTES.WHITE }] : line;
/** The rows a line occupies: its tallest font's. */
const rowsOf = (line: MenuLine) =>
  Math.max(1, ...segmentsOf(line).map((segment) => TEXT_FONTS[segment.font ?? 'normal'].rows));

/**
 * Write `line` centred from `row`: WHITE text, or segments written one after another in their palettes and fonts.
 */
export function writeLine(text: TextLayer, row: number, line: MenuLine) {
  const segments = segmentsOf(line);
  let column = Math.floor((TEXT_COLUMNS - segments.reduce((n, segment) => n + segment.text.length, 0)) / 2);
  for (const segment of segments) {
    text.write(column, row, segment.text, segment.palette, segment.font);
    column += segment.text.length;
  }
}

/**
 * Write one choice centred on `row` in `palette`, with WHITE `◀` and `▶` four columns either side when there is more
 * than one to choose from. A choice longer than `BESIDE_ARROWS_COLUMNS` has its arrows at the grid's first and last
 * columns of the row under it, which every carousel leaves blank.
 */
export function writeChoice(text: TextLayer, row: number, label: string, palette: number, arrows = true) {
  const column = Math.floor((TEXT_COLUMNS - label.length) / 2);
  text.write(column, row, label, palette);
  if (!arrows) return;
  if (label.length > BESIDE_ARROWS_COLUMNS) {
    text.write(0, row + 1, TEXT_MARKS.left, TEXT_PALETTES.WHITE);
    text.write(TEXT_COLUMNS - 1, row + 1, TEXT_MARKS.right, TEXT_PALETTES.WHITE);
    return;
  }
  text.write(column - ARROW_COLUMNS, row, TEXT_MARKS.left, TEXT_PALETTES.WHITE);
  text.write(column + label.length + ARROW_COLUMNS - 1, row, TEXT_MARKS.right, TEXT_PALETTES.WHITE);
}

/** Write `line` centred on `row` of the text grid. */
export function writeCentred(text: TextLayer, row: number, line: string, palette: number, font?: TextFont) {
  text.write(Math.floor((TEXT_COLUMNS - line.length) / 2), row, line, palette, font);
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
