import { halveRgb555Pixels } from '../image/rgb555.js';
import {
  ornatePalette,
  TEXT_FONTS,
  TEXT_PALETTES,
  TEXT_TILE_SIZE,
  type OrnateStyle,
  type TextFont,
  type TextTiles,
} from '../image/text-tiles.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { lineThinningRanks, newLineCount } from '../view/line-thinning.js';
import { SoftwareSurface } from '../view/software-surface.js';
import { drawSmallPrint, SMALL_PRINT } from './small-print.js';

/**
 * A card: 28×21 tiles (224×168 pixels) shown at 1:1, the one in focus standing at x 48 (column 6) and y 32 (row 4) at
 * rest, four rows clear above it and below it over the path's row (K, 2026-11-09 and 2026-11-11), its neighbours one
 * card and one clear tile away.
 */
export const CARD = Object.freeze({
  columns: 28,
  rows: 21,
  x: 48,
  y: 32,
  pitch: 29 * TEXT_TILE_SIZE,
});
const WIDTH = CARD.columns * TEXT_TILE_SIZE,
  HEIGHT = CARD.rows * TEXT_TILE_SIZE;
/** The name's columns: the card's less a tile either side; a longer name breaks into two lines. */
const NAME_COLUMNS = CARD.columns - 2;
/** The name's top rows, for one line and for two, and the one line's row. */
const NAME_ROWS = Object.freeze({ one: [8], two: [6, 9] });
const LINE_ROW = 13;

/** A rectangle of a card's pixels. */
export interface PixelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What a card is painted on: its 224×168 pixels, which nothing it writes leaves (a `RangeError`). */
export interface PageCanvas {
  readonly surface: SoftwareSurface;
  /** A text palette's main color. */
  mainColor(palette: number): number;
  /** Fill `box`, clipped to the card, with `color`. */
  fill(box: PixelBox, color: number): void;
  /** `line` from tile (`column`, `row`) in the normal font with its shadow, WHITE by default. */
  write(column: number, row: number, line: string, palette?: number): void;
  /** `line` from the pixel (`x`, `y`) in the normal font in `color` alone, without its shadow. */
  ink(x: number, y: number, line: string, color: number): void;
  /** `line` from the pixel (`x`, `y`) in the small print ([small print](./small-print.ts)) in `color`. */
  small(x: number, y: number, line: string, color: number): void;
  /**
   * A title from the pixel (`x`, `y`): in the large ornate font when it fits `columns`, else in two lines of the small
   * one (`cardNameLines`), each 16 pixels tall in all; SUNSET by default.
   */
  title(x: number, y: number, columns: number, text: string, style?: OrnateStyle): void;
}

/** A page's words: their lines' box, a multiple of a tile each way, on a flat `ground`; a YELLOW heading or none. */
export interface PageWords {
  readonly box: PixelBox;
  readonly ground: number;
  readonly heading: string | null;
  readonly description: string;
}

/**
 * A page card's page (K, 2026-11-11: the card UI as before; 2026-11-12: packed with what it is about, no boxes drawn
 * around its parts): one face or several that turn at rest in focus, each painted whole by the page, with its words and
 * what moves on it.
 */
export interface CardPage {
  readonly title: string;
  /** How many faces it has, at least one. */
  readonly faces: number;
  /** Paint face `face` on the card; its words, which the card writes and raises, or null. */
  paint(canvas: PageCanvas, face: number): PageWords | null;
  /** Draw what moves on `face`, `steps` after the card came to rest in focus, over it standing at (`x`, `y`). */
  live?(target: SoftwareSurface, x: number, y: number, steps: number, face: number): void;
  /** What is heard of it `steps` after the card came to rest in focus: a vehicle's revving engine, as the player's. */
  sound?(steps: number): CompetitorObservation;
}

/** How the plain cards look: an ID, and a painter of a name or list card's ground that gives the name's ornate style. */
export interface PlainCardStyle {
  readonly id: string;
  plain(canvas: PageCanvas, kind: 'name' | 'list'): OrnateStyle;
}

/**
 * What a card shows: its name and one line, and whether it is dimmed; a list card's name and its entries, each a label
 * and a value, one of them selected (K, 2026-11-11); or a page.
 */
export interface CardFace {
  readonly name: string;
  readonly line: string;
  readonly dim: boolean;
  readonly items?: readonly { readonly label: string; readonly value: string; readonly selected: boolean }[];
  /** A page card's page, drawn in place of its name and line. */
  readonly page?: CardPage;
}

/**
 * A list card's layout: the name centred on its top rows, then an entry a row from `first`, the label from
 * `label`, the value centred between the marks at `marks`, which stand either side of the selected entry's value.
 */
export const LIST = Object.freeze({ nameRow: 1, first: 5, label: 1, marks: [18, 26] as const });

/**
 * `name` in lines of at most `NAME_COLUMNS` characters: one, else two broken at the last space that leaves both short
 * enough, else cut where the first line ends; a name of up to twice the columns always fits in two.
 */
export function cardNameLines(name: string): readonly string[] {
  if (name.length <= NAME_COLUMNS) return [name];
  const space = name.lastIndexOf(' ', NAME_COLUMNS);
  return space > 0 && name.length - space - 1 <= NAME_COLUMNS
    ? [name.slice(0, space), name.slice(space + 1)]
    : [name.slice(0, NAME_COLUMNS), name.slice(NAME_COLUMNS)];
}

/** `text` in lines of at most `columns` characters, broken at spaces; a longer word is broken where its line ends. */
export function wrappedLines(text: string, columns: number): readonly string[] {
  const lines: string[] = [];
  let line = '';
  const end = () => {
    if (line) lines.push(line);
    line = '';
  };
  for (const word of text.split(' ')) {
    let rest = word;
    // A word longer than a line: its whole lines first, and its rest begins the next.
    if (rest.length > columns) {
      end();
      for (; rest.length > columns; rest = rest.slice(columns)) lines.push(rest.slice(0, columns));
    }
    if (line && line.length + 1 + rest.length > columns) end();
    line = line ? `${line} ${rest}` : rest;
  }
  end();
  return Object.freeze(lines);
}

/**
 * The words' scroll while their card rests in focus, in fixed steps (provisional, for K): held at their top for `hold`,
 * rising a pixel every `pixel` until their last line shows, held there for `end`, then at their top again.
 */
export const WORDS_SCROLL = Object.freeze({ hold: 90, pixel: 10, end: 180 });
/** How far the words have risen after `steps` at rest, in pixels, when they are `overflow` pixels taller than their box. */
export function wordsScroll(overflow: number, steps: number): number {
  if (overflow <= 0) return 0;
  const { hold, pixel, end } = WORDS_SCROLL,
    t = steps % (hold + overflow * pixel + end);
  return Math.min(overflow, Math.max(0, Math.floor((t - hold) / pixel)));
}

/**
 * A page's faces at rest in focus: each shows for `steps` fixed steps (6 s, as the catalog's pages did), and the next
 * comes over `thin` steps by line thinning, the only transition of this game (K, 2026-11-08), over the card's rows
 * ([line thinning](../view/line-thinning.ts)).
 */
export const FACE_TURN = Object.freeze({ steps: 360, thin: 16 });
// The card's rows' ranks in line thinning's order.
const THIN_RANK = lineThinningRanks(HEIGHT);

/**
 * The card faces, each painted once into its own 224×168 pixels from the text tiles and the small print, in `style`'s
 * look as it is when the card is first drawn in it. A name card: the name in the large ornate font and the line in the
 * normal font's WHITE, both centred; a list card's name and entries ([browser](../../docs/browser.md#card-rows)). A page
 * card: what its page paints, and its words, painted once as one strip that shows its top lines. A dimmed card is
 * painted at half brightness, as by palettes at half brightness. Nothing is written beyond its card: text that would be
 * is a `RangeError`. `draw` copies a face to any position, clipped to the target; after `steps` at rest in focus a page
 * shows the face `FACE_TURN` gives, its words risen by `wordsScroll` when taller than their box, and what moves on it.
 */
export function createCardFaces(tiles: TextTiles, style: () => PlainCardStyle) {
  const faces = new Map<string, Uint16Array>();
  const pages = new WeakMap<CardPage, (PageFace | undefined)[]>();
  const dimmed = new WeakMap<CardPage, Uint16Array>();
  // Write `line` in `font` from the pixel (`x`, `y`) of the `width`-pixel-wide `pixels`, entirely within them.
  const paintText = (
    pixels: Uint16Array,
    width: number,
    x: number,
    y: number,
    line: string,
    font: TextFont,
    palette: number,
  ) => {
    const rows = TEXT_FONTS[font].rows;
    if (x < 0 || y < 0 || x + line.length * TEXT_TILE_SIZE > width)
      throw new RangeError(`${JSON.stringify(line)} leaves its card at x ${x}`);
    if ((y + rows * TEXT_TILE_SIZE) * width > pixels.length)
      throw new RangeError(`${JSON.stringify(line)} leaves its card at y ${y}`);
    for (let r = 0; r < rows; r++)
      tiles
        .encode(line, font, r)
        .forEach((pattern, i) =>
          tiles.paint(pixels, (y + r * TEXT_TILE_SIZE) * width + x + i * TEXT_TILE_SIZE, width, pattern, palette + r),
        );
  };
  const white = tiles.mainColor(TEXT_PALETTES.WHITE);
  // A line in the normal font's main color alone: painted WHITE on a clear ground, its main-color pixels kept.
  const inkPixels = (line: string) => {
    const width = line.length * TEXT_TILE_SIZE,
      pixels = new Uint16Array(width * TEXT_TILE_SIZE).fill(CLEAR);
    paintText(pixels, width, 0, 0, line, 'normal', TEXT_PALETTES.WHITE);
    return { width, pixels };
  };
  const canvasOf = (pixels: Uint16Array): PageCanvas => {
    const surface = new SoftwareSurface(WIDTH, HEIGHT, pixels);
    const within = (x: number, y: number, width: number, line: string, height = TEXT_TILE_SIZE) => {
      if (x < 0 || y < 0 || x + width > WIDTH || y + height > HEIGHT)
        throw new RangeError(`${JSON.stringify(line)} leaves its card at (${x}, ${y})`);
    };
    return {
      surface,
      mainColor: (palette) => tiles.mainColor(palette),
      fill: ({ x, y, width, height }, color) => {
        for (let row = Math.max(0, y); row < Math.min(HEIGHT, y + height); row++)
          surface.fillSpan(row, x, x + width - 1, color);
      },
      write: (column, row, line, palette = TEXT_PALETTES.WHITE) =>
        paintText(pixels, WIDTH, column * TEXT_TILE_SIZE, row * TEXT_TILE_SIZE, line, 'normal', palette),
      ink: (x, y, line, color) => {
        within(x, y, line.length * TEXT_TILE_SIZE, line);
        const inked = inkPixels(line);
        for (let row = 0; row < TEXT_TILE_SIZE; row++)
          for (let k = 0; k < inked.width; k++)
            if (inked.pixels[row * inked.width + k] === white) pixels[(y + row) * WIDTH + x + k] = color;
      },
      small: (x, y, line, color) => {
        within(x, y, line.length * SMALL_PRINT.width, line, SMALL_PRINT.rows);
        drawSmallPrint(surface, x, y, line, color);
      },
      title: (x, y, columns, text, ornate = 'SUNSET') => {
        if (text.length <= columns)
          paintText(pixels, WIDTH, x, y, text, 'ornateLarge', ornatePalette('ornateLarge', ornate));
        else
          cardNameLines(text).forEach((line, i) =>
            paintText(
              pixels,
              WIDTH,
              x,
              y + i * TEXT_TILE_SIZE,
              line,
              'ornateSmall',
              ornatePalette('ornateSmall', ornate),
            ),
          );
      },
    };
  };
  const centred = (line: string) => Math.floor((CARD.columns - line.length) / 2);
  const paint = (face: CardFace) => {
    const pixels = new Uint16Array(WIDTH * HEIGHT),
      canvas = canvasOf(pixels);
    const ornate = style().plain(canvas, face.items ? 'list' : 'name');
    const name = (line: string, row: number) =>
      paintText(
        pixels,
        WIDTH,
        centred(line) * TEXT_TILE_SIZE,
        row * TEXT_TILE_SIZE,
        line,
        'ornateLarge',
        ornatePalette('ornateLarge', ornate),
      );
    if (face.items) {
      name(face.name, LIST.nameRow);
      const [left, right] = LIST.marks;
      face.items.forEach((item, i) => {
        const row = LIST.first + i,
          shade = item.selected ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.DARK;
        canvas.write(LIST.label, row, item.label, shade);
        const at = left + 1 + Math.floor((right - left - 1 - item.value.length) / 2);
        canvas.write(at, row, item.value, item.selected ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.WHITE);
        if (item.selected && item.value) {
          canvas.write(left, row, '◀');
          canvas.write(right, row, '▶');
        }
      });
    } else {
      const lines = cardNameLines(face.name);
      lines.forEach((line, i) => name(line, (lines.length === 1 ? NAME_ROWS.one : NAME_ROWS.two)[i]!));
      if (face.line) canvas.write(centred(face.line), LINE_ROW, face.line);
    }
    if (face.dim) halveRgb555Pixels(pixels);
    return pixels;
  };

  const paintPage = (page: CardPage, face: number): PageFace => {
    const pixels = new Uint16Array(WIDTH * HEIGHT);
    const words = page.paint(canvasOf(pixels), face);
    if (!words) return { pixels, words: null, strip: new Uint16Array(0), overflow: 0 };
    const { box, ground, heading, description } = words;
    if (box.width % TEXT_TILE_SIZE || box.height % TEXT_TILE_SIZE || box.x < 0 || box.y < 0)
      throw new RangeError("A page's words stand in whole tiles");
    if (box.x + box.width > WIDTH || box.y + box.height > HEIGHT) throw new RangeError("A page's words leave its card");
    // The words, every line of them, on a strip of their own.
    const columns = box.width / TEXT_TILE_SIZE;
    const lines = [
      ...(heading === null ? [] : wrappedLines(heading, columns).map((line) => [line, true] as const)),
      ...wrappedLines(description, columns).map((line) => [line, false] as const),
    ];
    const strip = new Uint16Array(box.width * Math.max(box.height, lines.length * TEXT_TILE_SIZE)).fill(ground);
    lines.forEach(([line, yellow], i) =>
      paintText(
        strip,
        box.width,
        0,
        i * TEXT_TILE_SIZE,
        line,
        'normal',
        yellow ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.WHITE,
      ),
    );
    copy(pixels, WIDTH, HEIGHT, strip.subarray(0, box.width * box.height), box.width, box.x, box.y);
    return { pixels, words, strip, overflow: strip.length / box.width - box.height };
  };
  const pageFace = (page: CardPage, face: number): PageFace => {
    let painted = pages.get(page);
    if (!painted) pages.set(page, (painted = []));
    return (painted[face] ??= paintPage(page, face));
  };
  // A page's face `face` as it is `steps` after it came, with what moves on it after `rest` steps at rest, at (x, y).
  const drawPage = (
    target: SoftwareSurface,
    page: CardPage,
    face: number,
    x: number,
    y: number,
    steps: number,
    rest: number,
  ) => {
    const { pixels, words, strip, overflow } = pageFace(page, face);
    copy(target.pixels, target.width, target.height, pixels, WIDTH, x, y);
    const risen = wordsScroll(overflow, steps);
    if (words && risen > 0) {
      const { box } = words;
      copy(
        target.pixels,
        target.width,
        target.height,
        strip.subarray(risen * box.width, (risen + box.height) * box.width),
        box.width,
        x + box.x,
        y + box.y,
      );
    }
    if (rest > 0) page.live?.(target, x, y, rest, face);
  };
  const scratch = [new SoftwareSurface(WIDTH, HEIGHT), new SoftwareSurface(WIDTH, HEIGHT)] as const;
  return Object.freeze({
    /**
     * Copy `face` with its top-left corner at (`x`, `y`), clipped to `target`; a page as it is after `steps` at rest in
     * focus.
     */
    draw(target: SoftwareSurface, face: CardFace, x: number, y: number, steps = 0) {
      const { page } = face;
      if (page && face.dim) {
        let pixels = dimmed.get(page);
        if (!pixels) {
          pixels = pageFace(page, 0).pixels.slice();
          halveRgb555Pixels(pixels);
          dimmed.set(page, pixels);
        }
        copy(target.pixels, target.width, target.height, pixels, WIDTH, x, y);
      } else if (page) {
        const turn = Math.floor(steps / FACE_TURN.steps),
          since = steps % FACE_TURN.steps,
          shown = turn % page.faces;
        if (page.faces === 1) drawPage(target, page, 0, x, y, steps, steps);
        else if (turn === 0 || since >= FACE_TURN.thin) drawPage(target, page, shown, x, y, since, steps);
        else {
          // The face before, as it was when it went, and the one that comes, mixed by rows.
          const [before, after] = scratch;
          drawPage(before, page, (turn - 1) % page.faces, 0, 0, FACE_TURN.steps - 1, steps);
          drawPage(after, page, shown, 0, 0, since, steps);
          const rows = newLineCount(HEIGHT, (since + 1) / FACE_TURN.thin);
          for (let row = 0; row < HEIGHT; row++)
            copy(
              target.pixels,
              target.width,
              target.height,
              (THIN_RANK[row]! < rows ? after : before).pixels.subarray(row * WIDTH, (row + 1) * WIDTH),
              WIDTH,
              x,
              y + row,
            );
        }
      } else {
        const key = JSON.stringify([style().id, face.name, face.line, face.dim, face.items ?? null]);
        let pixels = faces.get(key);
        if (!pixels) faces.set(key, (pixels = paint(face)));
        copy(target.pixels, target.width, target.height, pixels, WIDTH, x, y);
      }
    },
  });
}
export type CardFaces = ReturnType<typeof createCardFaces>;

/** Where no ink fell: bit 15, which no RGB555 color sets. */
const CLEAR = 0x8000;

/** A page's face painted: its pixels, its words, their strip and how much taller it is than their box, in pixels. */
interface PageFace {
  readonly pixels: Uint16Array;
  readonly words: PageWords | null;
  readonly strip: Uint16Array;
  readonly overflow: number;
}

/** Copy the `width`-pixel-wide `source` into `target` with its top-left corner at (`x`, `y`), clipped to `target`. */
function copy(
  target: Uint16Array,
  targetWidth: number,
  targetHeight: number,
  source: Uint16Array,
  width: number,
  x: number,
  y: number,
) {
  const height = source.length / width,
    left = Math.max(0, -x),
    right = Math.min(width, targetWidth - x),
    top = Math.max(0, -y),
    bottom = Math.min(height, targetHeight - y);
  if (left >= right) return;
  for (let row = top; row < bottom; row++)
    target.set(source.subarray(row * width + left, row * width + right), (y + row) * targetWidth + x + left);
}
