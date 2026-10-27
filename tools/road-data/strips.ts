/**
 * The originals' strips as boards ([Original road data](../../docs/original-road-data.md#strips)), shared by OUTRUN's
 * and TURBO OUTRUN's: a looping strip's unit, its nearest size's colored columns, repeated away from the road.
 */
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { boardMaster, turned } from './pixel-grid.js';
import { anchorPoint } from './sprite-pixels.js';
import { partsOnGrid, pictureParts, type ExtractPicture, type TableEntry } from './sprite-rules.js';

/**
 * A looping strip's unit: the columns of `picture` (its edge nearest the road on the left) from its leftmost colored
 * column to its rightmost, `from` columns after its edge.
 */
export function stripUnit(picture: ExtractPicture): { readonly picture: ExtractPicture; readonly from: number } {
  const { width, height, pixels } = picture;
  let [from, to] = [width, 0];
  for (let i = 0; i < pixels.length; i++)
    if (pixels[i]) [from, to] = [Math.min(from, i % width), Math.max(to, (i % width) + 1)];
  if (to <= from) throw new RangeError('A strip picture has no colored column');
  const unit = new Uint8Array((to - from) * height);
  for (let y = 0; y < height; y++) unit.set(pixels.subarray(y * width + from, y * width + to), y * (to - from));
  return { picture: { width: to - from, height, pixels: unit }, from };
}

/**
 * A looping strip's board `name`: the unit (`stripUnit`) of its nearest size's `picture` by the sprites' rules
 * (`pictureParts`, its pen 10 a color) on the texel grid of `texels` a pixel, in the palettes' `colors`, extending away
 * from the road (right, or left mirrored) to the frame's edge. Its edge nearest the road is the board's base point
 * across, the unit's first column where the picture's stands; it lies about its original's anchor (`anchor`, its
 * middle or an edge down) where K's `entry` says so, else stands on its base.
 */
export function loopingStrip(
  name: string,
  picture: ExtractPicture,
  texels: { readonly across: number; readonly down: number },
  use: { readonly mirrored: boolean; readonly anchor: number },
  entry: TableEntry | undefined,
  palettes: readonly number[],
  colors: (palette: number) => readonly number[],
): SpriteLodDocument {
  const { picture: unit, from } = stripUnit(picture);
  const parts = pictureParts(unit, false, entry);
  const grid = partsOnGrid(unit, parts, texels.across, texels.down);
  const edge = -0.5 - from * texels.across;
  const point = {
    x: use.mirrored ? grid.width - 1 - edge : edge,
    y: parts.lies ? anchorPoint(use.anchor & 12, grid.width, grid.gridHeight).y : grid.anchorY,
  };
  return boardMaster(name, grid, turned(grid.indices, grid.width, use.mirrored), point, palettes, colors, {
    extend: use.mirrored ? 'left' : 'right',
    ...(parts.lies ? { lies: true as const } : {}),
  });
}
