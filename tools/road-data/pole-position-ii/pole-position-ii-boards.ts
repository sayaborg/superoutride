/**
 * POLE POSITION II's boards as course images ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-objects)):
 * each board's picture its tiles' big sprites and its poles' small ones as the second program places them, at the big
 * sprites' size, in every color it is shown in, on the texel grid by chosen lines and the sprites' rules (the hardware
 * has no shadows). The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { boardColors, boardMaster, coloredColumns, texelsAPixel, turned } from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts, spriteTable, tableKey, type ExtractPicture } from '../shared/sprite-rules.js';
import { PIXEL_ASPECT } from '../pole-position-hardware/display.js';
import { spritePens, spritePixels } from '../pole-position-hardware/sprites.js';
import type { PolePositionII } from './pole-position-ii-rom.js';
import type { BoardPicture } from './pole-position-ii-scenery.js';

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

/** A sprite color's board colors: its pens 1 to 15, pen 0 its only transparent pen. */
function colorsOf(p: PolePositionII, color: number) {
  const pens = spritePens(p.spriteColors, p.colors, color);
  if (pens[0] !== null || pens.slice(1).some((pen) => pen === null))
    throw romDiffers(`The sprites' color ${color} is transparent other than at pen 0`);
  return boardColors(pens.slice(1, 15) as number[], pens[15]!);
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
      const source = boardPixels(p, picture);
      const parts = pictureParts(source, undefined, table.get(tableKey(name)));
      const grid = partsOnGrid(source, parts, texels.across, texels.down);
      const anchor = { x: grid.width / 2 - 0.5, y: grid.anchorY };
      const sorted = [...colors].sort((a, b) => a - b);
      const master = boardMaster(name, grid, grid.indices, anchor, sorted, (color) => colorsOf(p, color));
      return {
        name,
        colored: coloredColumns(source.pixels, source.width) * pixel,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        image: courseImageFile(master),
      };
    });
}
