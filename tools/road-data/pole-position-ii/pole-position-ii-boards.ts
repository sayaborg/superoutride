/**
 * POLE POSITION II's boards as course images ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-objects)):
 * each board's picture its tiles' big sprites and its poles' small ones as the second program places them, at the big
 * sprites' size, in every color it is shown in, on the texel grid by chosen lines and the sprites' rules (the hardware
 * has no shadows). The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { romDiffers } from '../shared/conversion-errors.js';
import {
  boardColors,
  TRANSPARENT_PENS,
  boardMaster,
  coloredColumns,
  namedBoardMaster,
  paletteName,
  texelsAPixel,
  turned,
} from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts, spriteTable, tableKey, type ExtractPicture } from '../shared/sprite-rules.js';
import { PIXEL_ASPECT } from '../pole-position-hardware/display.js';
import { spritePens, spritePixels } from '../pole-position-hardware/sprites.js';
import type { PolePositionII } from './pole-position-ii-rom.js';
import type { BoardPicture } from './pole-position-ii-scenery.js';
import type { LaidSprite } from './pole-position-ii-sprites.js';

/** A big sprite's pixels across, and a small one's: a pole is drawn at the big sprites' scale. */
const BIG = 32;
const SMALL = 16;

/** A board's image name: `polepos2-<its first tile's big sprite, two hex digits>`. */
export const boardName = (picture: BoardPicture) => `polepos2-${picture.tiles[0]![0]!.toString(16).padStart(2, '0')}`;

/** A board's picture of the extract: its tiles by rows, its poles beneath at their columns, pen 0 transparent. */
export function boardPixels(p: PolePositionII, picture: BoardPicture): ExtractPicture {
  const width = BIG * picture.tiles[0]!.length;
  const rows = picture.tiles.length;
  const height = BIG * rows + SMALL;
  const pixels = new Uint8Array(width * height);
  const put = (source: ArrayLike<number>, size: number, left: number, top: number) => {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const pen = source[y * size + x]!;
        if (pen) pixels[(top + y) * width + left + x] = pen;
      }
  };
  picture.tiles.forEach((row, r) =>
    row.forEach((code, k) => put(spritePixels(p.bigSprites, BIG, code), BIG, BIG * k, BIG * r)),
  );
  for (const pole of picture.poles)
    put(turned(spritePixels(p.smallSprites, SMALL, pole.code), SMALL, pole.mirrored), SMALL, pole.x, BIG * rows);
  return { width, height, pixels };
}

/**
 * A sprite color's board colors: its pens 1 to 15, a pen its color's PROM entry makes transparent (15) drawn by none of
 * its pixels; pen 0 is transparent in every color.
 */
function colorsOf(p: PolePositionII, color: number) {
  const pens = spritePens(p.spriteColors, p.colors, color);
  if (pens[0] !== null) throw romDiffers(`The sprites' color ${color} shows pen 0`);
  return boardColors(
    pens.slice(1, 16).map((pen) => pen ?? 0),
    TRANSPARENT_PENS.namco,
    pens[15] ?? 0,
  );
}

/**
 * `picture` as its `colors` show it: a pen their PROM makes transparent in all of them shows nothing; one transparent in
 * some of them alone is refused, as one image's pixels serve all its colors.
 */
function shownIn(p: PolePositionII, picture: ExtractPicture, colors: readonly number[]): ExtractPicture {
  const shows = colors.map((color) => spritePens(p.spriteColors, p.colors, color));
  const pixels = picture.pixels.map((pen) => {
    const hidden = shows.filter((pens) => pens[pen] === null).length;
    if (hidden && hidden < shows.length) throw romDiffers(`A board's pen ${pen} shows in some of its colors alone`);
    return hidden ? 0 : pen;
  });
  return { ...picture, pixels };
}

/**
 * The boards the pictures need, a source pixel `pixel` metres across and `PIXEL_ASPECT` times that down, with each
 * one's colored width in metres: one a name, carrying every color it is shown in (the lowest its default). Its base
 * point is its middle on its poles' bottom edge.
 */
export function polePositionIIBoards(p: PolePositionII, pictures: readonly BoardPicture[], pixel: number) {
  const sources = new Map<string, { picture: BoardPicture; colors: Set<number> }>();
  for (const picture of pictures) {
    const name = boardName(picture);
    if (!sources.has(name)) sources.set(name, { picture, colors: new Set() });
    sources.get(name)!.colors.add(picture.color);
  }
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  const table = spriteTable();
  return [...sources]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, { picture, colors }]) => {
      const sorted = [...colors].sort((a, b) => a - b);
      const source = shownIn(p, boardPixels(p, picture), sorted);
      const parts = pictureParts(source, undefined, table.get(tableKey(name)));
      const grid = partsOnGrid(source, parts, texels.across, texels.down);
      const anchor = { x: grid.width / 2 - 0.5, y: grid.anchorY };
      const master = boardMaster(name, grid, grid.indices, anchor, sorted, (color) => colorsOf(p, color));
      return {
        name,
        colored: coloredColumns(source.pixels, source.width) * pixel,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        image: courseImageFile(master),
      };
    });
}

/** An object's sprites composed: each over those before it, its pens where its color shows them, and each pixel's sprite. */
export interface Composed {
  readonly width: number;
  readonly height: number;
  /** Its column 0's left edge, pixels right of the object's column, and its row 0's top edge, pixels above its road line. */
  readonly left: number;
  readonly top: number;
  /** Each pixel's pen, 0 where none shows (pen 0 is transparent in every color), and the sprite that drew it (−1 none). */
  readonly pens: Uint8Array;
  readonly owner: Int16Array;
}

/**
 * An object's sprites as the sprite circuit draws them, in order, each over those before it, at the size where a big
 * sprite is 1:1 (a small one half), one whose code word sets its rows (`codeRows`) stretched to them from its top: a
 * sprite's code's bit 7 mirrors it, and a pen its color's PROM entry makes transparent (15) shows nothing.
 */
export function composeSprites(p: PolePositionII, sprites: readonly LaidSprite[]): Composed {
  const size = (s: LaidSprite) => (s.big ? BIG : SMALL);
  const rows = (s: LaidSprite) => s.rows ?? size(s);
  const left = Math.min(...sprites.map((s) => s.x));
  const right = Math.max(...sprites.map((s) => s.x + size(s)));
  const top = Math.max(...sprites.map((s) => s.y));
  const bottom = Math.min(...sprites.map((s) => s.y - rows(s)));
  const [width, height] = [right - left, top - bottom];
  const pens = new Uint8Array(width * height);
  const owner = new Int16Array(width * height).fill(-1);
  sprites.forEach((s, k) => {
    const n = size(s);
    const shows = spritePens(p.spriteColors, p.colors, s.color);
    const source = turned(
      spritePixels(s.big ? p.bigSprites : p.smallSprites, n, s.code & 0x7f),
      n,
      (s.code & 0x80) !== 0,
    );
    // Drawn in its rows from its top, out row y showing its row ⌊y × n / rows⌋: the hardware's stretch is not read.
    for (let y = 0; y < rows(s); y++)
      for (let x = 0; x < n; x++) {
        const pen = source[Math.floor((y * n) / rows(s)) * n + x]!;
        if (shows[pen] === null) continue;
        const at = (top - s.y + y) * width + s.x - left + x;
        [pens[at], owner[at]] = [pen, k];
      }
  });
  return { width, height, left, top, pens, owner };
}

/** A part of an object: its pixels, cropped to their colored columns and rows, and where its bottom left corner lies. */
export interface ObjectPart {
  readonly picture: ExtractPicture;
  /** Its left edge, pixels right of the object's column, and its bottom edge, pixels above its road line. */
  readonly left: number;
  readonly bottom: number;
}

/** The pixels of `composed` that `keep` keeps (by pixel), cropped to their colored columns and rows; none where none. */
export function objectPart(composed: Composed, keep: (at: number) => boolean): ObjectPart | undefined {
  const { width, height, pens } = composed;
  let [x0, x1, y0, y1] = [width, -1, height, -1];
  for (let at = 0; at < pens.length; at++)
    if (pens[at] && keep(at)) {
      const [x, y] = [at % width, Math.floor(at / width)];
      [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
    }
  if (x1 < 0) return undefined;
  const [w, h] = [x1 - x0 + 1, y1 - y0 + 1];
  const pixels = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const at = (y0 + y) * width + x0 + x;
      if (keep(at)) pixels[y * w + x] = pens[at]!;
    }
  return { picture: { width: w, height: h, pixels }, left: composed.left + x0, bottom: composed.top - y1 - 1 };
}

/** Color `color`'s palette: its name and its pens' colors (`colorsOf`). */
export const colorPalette = (p: PolePositionII, color: number) => ({
  name: paletteName(color),
  colors: colorsOf(p, color),
});

/**
 * An object part's image `name` in `palettes` (each a name and its indices' colors, the first its default), a source
 * pixel `pixel` metres across and `PIXEL_ASPECT` times that down, by
 * chosen lines and the sprites' rules (no shadow): its base point its bottom edge's middle, or, `anchor` given, the
 * column `anchor` pixels from its left; `lies`, it lies about its middle row (Lying boards). Mirrored, its grid
 * reflected. With its colored width and its width, metres.
 */
export function objectImage(
  name: string,
  part: ObjectPart,
  palettes: readonly { readonly name: string; readonly colors: readonly number[] }[],
  pixel: number,
  options: { readonly lies?: boolean; readonly anchor?: number; readonly mirrored?: boolean } = {},
) {
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  const source = part.picture;
  const grid = partsOnGrid(
    source,
    pictureParts(source, undefined, spriteTable().get(tableKey(name))),
    texels.across,
    texels.down,
  );
  const x = options.anchor === undefined ? grid.width / 2 - 0.5 : (options.anchor * grid.width) / source.width - 0.5;
  const anchor = options.lies ? { x, y: grid.height / 2 - 0.5 } : { x, y: grid.anchorY };
  const indices = turned(grid.indices, grid.width, options.mirrored === true);
  const master = namedBoardMaster(name, grid, indices, anchor, palettes, options.lies ? { lies: true } : {});
  return {
    name,
    colored: coloredColumns(source.pixels, source.width) * pixel,
    width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
    grid: { width: grid.width, height: grid.height },
    image: courseImageFile(master),
  };
}
