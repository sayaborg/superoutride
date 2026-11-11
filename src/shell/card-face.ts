import { halveRgb555Pixels } from '../image/rgb555.js';
import {
  ornatePalette,
  TEXT_FONTS,
  TEXT_PALETTES,
  TEXT_TILE_SIZE,
  type TextFont,
  type TextTiles,
} from '../image/text-tiles.js';
import { SoftwareSurface } from '../view/software-surface.js';

/**
 * A card: 28×21 tiles (224×168 pixels) shown at 1:1, the one in focus standing at x 48 (column 6) and y 32 (row 4) at
 * rest, four rows clear above it and below it over the path's row (K, 2026-11-09 and 2026-11-11), its neighbours one
 * card and one clear tile away. Its ground is a dark RGB555 color, provisional until the cards are designed.
 */
export const CARD = Object.freeze({
  columns: 28,
  rows: 21,
  x: 48,
  y: 32,
  pitch: 29 * TEXT_TILE_SIZE,
  ground: (2 << 10) | (2 << 5) | 4,
});
const WIDTH = CARD.columns * TEXT_TILE_SIZE,
  HEIGHT = CARD.rows * TEXT_TILE_SIZE;
/** The name's columns: the card's less a tile either side; a longer name breaks into two lines. */
const NAME_COLUMNS = CARD.columns - 2;
/** The name's top rows, for one line and for two, and the one line's row. */
const NAME_ROWS = Object.freeze({ one: [8], two: [6, 9] });
const LINE_ROW = 13;

/** What a page paints on: its card's pixels, and boxes of tiles and text that never leave them. */
export interface PageCanvas {
  /** The card's 224×168 pixels. */
  readonly surface: SoftwareSurface;
  /** A text palette's main color. */
  mainColor(palette: number): number;
  /** A box of tiles: a 1-pixel edge on its left and top and a 2-pixel edge on its right and bottom around `ground`. */
  box(box: TileBox, ground: number): void;
  /** `line` from tile (`column`, `row`) in the normal font, WHITE by default; leaving the card is a `RangeError`. */
  write(column: number, row: number, line: string, palette?: number): void;
}

/**
 * A page card's page (K's prototype of the cards, 2026-11-09; K, 2026-11-11: the card UI as before): its title on the
 * band, the boxes it paints itself, and its words.
 */
export interface CardPage {
  readonly title: string;
  /** Paint the picture's and the facts' boxes, and the words' box when it has no words. */
  paint(canvas: PageCanvas): void;
  /** Its words in the words' box, a YELLOW heading (or none) over a WHITE description; null when it paints that box. */
  readonly words: { readonly heading: string | null; readonly description: string } | null;
}

/**
 * What a card shows: its name and one line, and whether it is dimmed, until its row's cards are designed (K,
 * 2026-11-09); a list card's name and its entries, each a label and a value, one of them selected (K, 2026-11-11); or a
 * page.
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

/** An inclusive span of a card's tiles: its first column and row and its last. */
export type TileBox = readonly [first: number, top: number, last: number, bottom: number];
/**
 * A page card's boxes (K's prototype of the cards, 2026-11-09, on 28×21 tiles): the title band, the picture and the
 * facts beside it, and the words.
 */
export const PAGE = Object.freeze({
  band: [0, 0, 27, 2] as TileBox,
  picture: [0, 3, 15, 11] as TileBox,
  facts: [16, 3, 27, 11] as TileBox,
  words: [0, 12, 27, 20] as TileBox,
});
/**
 * Where a page writes, in tiles: the title from column 1 on rows 1–2; the facts 10 columns from column 17 on rows 4–10;
 * the words 26 columns from column 1 on rows 13–19, seven lines.
 */
export const PAGE_TEXT = Object.freeze({
  title: Object.freeze({ column: 1, row: 1, columns: CARD.columns - 2 }),
  facts: Object.freeze({ column: 17, row: 4, columns: 10, rows: 7 }),
  words: Object.freeze({ column: 1, row: 13, columns: CARD.columns - 2, rows: 7 }),
});
/** A page's colors, RGB555, from K's prototype: a box's ground and edge, and the deep ground behind a picture. */
export const PAGE_COLORS = Object.freeze({
  ground: (1 << 10) | (2 << 5) | 6,
  edge: (17 << 10) | (19 << 5) | 27,
  deep: (1 << 10) | (2 << 5) | 4,
});

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
 * The card faces, each painted once into its own 224×168 pixels from the text tiles. A name card: a bright 1-pixel edge
 * over a dark ground, the name in the large ornate font's SUNSET style and the line in the normal font's WHITE, both
 * centred; a list card's name and entries ([browser](../../docs/browser.md#card-rows)). A page card: the title band, the
 * title in the large ornate font's SUNSET style or, longer than the band, in two lines of the small one; the boxes the
 * page paints; and its words, painted once as one strip that shows its top seven lines. A dimmed card is painted at half
 * brightness, as by palettes at half brightness. Nothing is written beyond its card: text that would be is a
 * `RangeError`. `draw` copies a face to any position, clipped to the target, and a page whose words are taller than
 * their box shows them risen by `wordsScroll` after `steps` at rest in focus.
 */
export function createCardFaces(tiles: TextTiles) {
  const faces = new Map<string, Uint16Array>();
  const pages = new WeakMap<CardPage, { plain: PageFace; dimmed?: PageFace }>();
  // Write `line` in `font` from tile (`column`, `row`) of the `width`-pixel-wide `pixels`, entirely within them.
  const paintText = (
    pixels: Uint16Array,
    width: number,
    column: number,
    row: number,
    line: string,
    font: TextFont,
    palette: number,
  ) => {
    const rows = TEXT_FONTS[font].rows;
    if (column < 0 || row < 0 || (column + line.length) * TEXT_TILE_SIZE > width)
      throw new RangeError(`${JSON.stringify(line)} leaves its card at column ${column}`);
    if ((row + rows) * TEXT_TILE_SIZE * width > pixels.length)
      throw new RangeError(`${JSON.stringify(line)} leaves its card at row ${row}`);
    for (let r = 0; r < rows; r++)
      tiles
        .encode(line, font, r)
        .forEach((pattern, i) =>
          tiles.paint(pixels, ((row + r) * width + column + i) * TEXT_TILE_SIZE, width, pattern, palette + r),
        );
  };
  const write = (
    pixels: Uint16Array,
    column: number,
    row: number,
    line: string,
    font: 'normal' | 'ornateLarge',
    palette = font === 'normal' ? TEXT_PALETTES.WHITE : ornatePalette('ornateLarge', 'SUNSET'),
  ) => paintText(pixels, WIDTH, column, row, line, font, palette);
  const centred = (line: string) => Math.floor((CARD.columns - line.length) / 2);
  const paint = (face: CardFace) => {
    const pixels = new Uint16Array(WIDTH * HEIGHT).fill(CARD.ground);
    const edge = tiles.mainColor(TEXT_PALETTES.WHITE);
    for (let x = 0; x < WIDTH; x++) pixels[x] = pixels[(HEIGHT - 1) * WIDTH + x] = edge;
    for (let y = 0; y < HEIGHT; y++) pixels[y * WIDTH] = pixels[y * WIDTH + WIDTH - 1] = edge;
    if (face.items) {
      write(pixels, centred(face.name), LIST.nameRow, face.name, 'ornateLarge');
      const [left, right] = LIST.marks;
      face.items.forEach((item, i) => {
        const row = LIST.first + i,
          shade = item.selected ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.DARK;
        write(pixels, LIST.label, row, item.label, 'normal', shade);
        const at = left + 1 + Math.floor((right - left - 1 - item.value.length) / 2);
        write(pixels, at, row, item.value, 'normal', item.selected ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.WHITE);
        if (item.selected && item.value) {
          write(pixels, left, row, '◀', 'normal');
          write(pixels, right, row, '▶', 'normal');
        }
      });
    } else {
      const lines = cardNameLines(face.name);
      lines.forEach((line, i) =>
        write(pixels, centred(line), (lines.length === 1 ? NAME_ROWS.one : NAME_ROWS.two)[i]!, line, 'ornateLarge'),
      );
      if (face.line) write(pixels, centred(face.line), LINE_ROW, face.line, 'normal');
    }
    if (face.dim) halveRgb555Pixels(pixels);
    return pixels;
  };

  // A page's box: its edge around its ground.
  const box = (pixels: Uint16Array, [first, top, last, bottom]: TileBox, ground: number) => {
    const [x0, y0] = [first * TEXT_TILE_SIZE, top * TEXT_TILE_SIZE],
      [x1, y1] = [(last + 1) * TEXT_TILE_SIZE, (bottom + 1) * TEXT_TILE_SIZE];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        pixels[y * WIDTH + x] = y === y0 || y >= y1 - 2 || x === x0 || x >= x1 - 2 ? PAGE_COLORS.edge : ground;
  };
  const paintPage = (page: CardPage): PageFace => {
    const pixels = new Uint16Array(WIDTH * HEIGHT);
    const { title, words } = PAGE_TEXT;
    box(pixels, PAGE.band, PAGE_COLORS.ground);
    // The title in the large ornate font; longer than the band, in two lines of the small one.
    if (page.title.length <= title.columns) write(pixels, title.column, title.row, page.title, 'ornateLarge');
    else
      cardNameLines(page.title).forEach((line, i) =>
        paintText(
          pixels,
          WIDTH,
          title.column,
          title.row + i,
          line,
          'ornateSmall',
          ornatePalette('ornateSmall', 'SUNSET'),
        ),
      );
    page.paint({
      surface: new SoftwareSurface(WIDTH, HEIGHT, pixels),
      mainColor: (palette) => tiles.mainColor(palette),
      box: (at, ground) => box(pixels, at, ground),
      write: (column, row, line, palette = TEXT_PALETTES.WHITE) =>
        paintText(pixels, WIDTH, column, row, line, 'normal', palette),
    });
    if (!page.words) return { pixels, strip: new Uint16Array(0), overflow: 0 };
    box(pixels, PAGE.words, PAGE_COLORS.ground);
    // The words, every line of them, on a strip of their own.
    const { heading, description } = page.words;
    const lines = [
      ...(heading === null ? [] : wrappedLines(heading, words.columns).map((line) => [line, true] as const)),
      ...wrappedLines(description, words.columns).map((line) => [line, false] as const),
    ];
    const width = words.columns * TEXT_TILE_SIZE,
      shown = words.rows * TEXT_TILE_SIZE;
    const strip = new Uint16Array(width * Math.max(shown, lines.length * TEXT_TILE_SIZE)).fill(PAGE_COLORS.ground);
    lines.forEach(([line, yellow], i) =>
      paintText(strip, width, 0, i, line, 'normal', yellow ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.WHITE),
    );
    copy(
      pixels,
      WIDTH,
      HEIGHT,
      strip.subarray(0, width * shown),
      width,
      words.column * TEXT_TILE_SIZE,
      words.row * TEXT_TILE_SIZE,
    );
    return { pixels, strip, overflow: strip.length / width - shown };
  };
  const pageFace = (page: CardPage, dim: boolean): PageFace => {
    let painted = pages.get(page);
    if (!painted) pages.set(page, (painted = { plain: paintPage(page) }));
    if (!dim) return painted.plain;
    if (!painted.dimmed) {
      const pixels = painted.plain.pixels.slice();
      halveRgb555Pixels(pixels);
      painted.dimmed = { pixels, strip: painted.plain.strip, overflow: 0 };
    }
    return painted.dimmed;
  };
  return Object.freeze({
    /**
     * Copy `face` with its top-left corner at (`x`, `y`), clipped to `target`; a page's words risen as they are after
     * `steps` at rest in focus.
     */
    draw(target: SoftwareSurface, face: CardFace, x: number, y: number, steps = 0) {
      if (face.page) {
        const { pixels, strip, overflow } = pageFace(face.page, face.dim);
        copy(target.pixels, target.width, target.height, pixels, WIDTH, x, y);
        const risen = wordsScroll(overflow, steps),
          { words } = PAGE_TEXT,
          width = words.columns * TEXT_TILE_SIZE;
        if (risen > 0)
          copy(
            target.pixels,
            target.width,
            target.height,
            strip.subarray(risen * width, (risen + words.rows * TEXT_TILE_SIZE) * width),
            width,
            x + words.column * TEXT_TILE_SIZE,
            y + words.row * TEXT_TILE_SIZE,
          );
        return;
      }
      const key = JSON.stringify([face.name, face.line, face.dim, face.items ?? null]);
      let pixels = faces.get(key);
      if (!pixels) faces.set(key, (pixels = paint(face)));
      copy(target.pixels, target.width, target.height, pixels, WIDTH, x, y);
    },
  });
}
export type CardFaces = ReturnType<typeof createCardFaces>;

/** A page painted: its face, its words' strip and how much taller the strip is than the words' box, in pixels. */
interface PageFace {
  readonly pixels: Uint16Array;
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
