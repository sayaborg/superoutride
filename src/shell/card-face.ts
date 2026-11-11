import { halveRgb555Pixels } from '../image/rgb555.js';
import { ornatePalette, TEXT_FONTS, TEXT_PALETTES, TEXT_TILE_SIZE, type TextTiles } from '../image/text-tiles.js';
import type { SoftwareSurface } from '../view/software-surface.js';

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

/**
 * What a card shows until the cards are designed (K, 2026-11-09): its name and one line, and whether it is dimmed; or a
 * list card's name and its entries, each a label and a value, one of them selected (K, 2026-11-11).
 */
export interface CardFace {
  readonly name: string;
  readonly line: string;
  readonly dim: boolean;
  readonly items?: readonly { readonly label: string; readonly value: string; readonly selected: boolean }[];
}

/**
 * A list card's layout: the name centred on its top rows, then an entry a row from `first`, the label from
 * `label`, the value centred between the marks at `marks`, which stand either side of the selected entry's value.
 */
export const LIST = Object.freeze({ nameRow: 1, first: 5, label: 1, marks: [18, 26] as const });

/** `name` in lines of at most `NAME_COLUMNS` characters: one, else two broken at the last space that fits, else cut. */
export function cardNameLines(name: string): readonly string[] {
  if (name.length <= NAME_COLUMNS) return [name];
  const space = name.lastIndexOf(' ', NAME_COLUMNS);
  return space > 0
    ? [name.slice(0, space), name.slice(space + 1)]
    : [name.slice(0, NAME_COLUMNS), name.slice(NAME_COLUMNS)];
}

/**
 * The card faces, each painted once into its own 224×168 pixels from the text tiles: a bright 1-pixel edge over a dark
 * ground, the name in the large ornate font's SUNSET style and the line in the normal font's WHITE, both centred; a
 * dimmed card is painted at half brightness, as by palettes at half brightness. `draw` copies a face to any position,
 * clipped to the target.
 */
export function createCardFaces(tiles: TextTiles) {
  const faces = new Map<string, Uint16Array>();
  const write = (
    pixels: Uint16Array,
    column: number,
    row: number,
    line: string,
    font: 'normal' | 'ornateLarge',
    palette = font === 'normal' ? TEXT_PALETTES.WHITE : ornatePalette('ornateLarge', 'SUNSET'),
  ) => {
    for (let r = 0; r < TEXT_FONTS[font].rows; r++)
      tiles
        .encode(line, font, r)
        .forEach((pattern, i) =>
          tiles.paint(pixels, ((row + r) * WIDTH + column + i) * TEXT_TILE_SIZE, WIDTH, pattern, palette + r),
        );
  };
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
  return Object.freeze({
    /** Copy `face` with its top-left corner at (`x`, `y`), clipped to `target`. */
    draw(target: SoftwareSurface, face: CardFace, x: number, y: number) {
      const key = JSON.stringify([face.name, face.line, face.dim, face.items ?? null]);
      let pixels = faces.get(key);
      if (!pixels) faces.set(key, (pixels = paint(face)));
      const left = Math.max(0, -x),
        right = Math.min(WIDTH, target.width - x),
        top = Math.max(0, -y),
        bottom = Math.min(HEIGHT, target.height - y);
      if (left >= right) return;
      for (let row = top; row < bottom; row++)
        target.pixels.set(
          pixels.subarray(row * WIDTH + left, row * WIDTH + right),
          (y + row) * target.width + x + left,
        );
    },
  });
}
export type CardFaces = ReturnType<typeof createCardFaces>;
