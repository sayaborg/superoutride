import { halveRgb555 } from '../image/rgb555.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { SoftwareSurface } from './software-surface.js';

/**
 * A row of pictures of one size on the one plane a late-1980s board can scale, `pitch` plane pixels from one's left
 * edge to the next's (a picture and a clear gap), wrapping at both ends when `wrap`. A picture `dim` is drawn with its
 * palettes at half brightness.
 */
export interface PlaneRow {
  readonly pictures: readonly TilePicture[];
  readonly pitch: number;
  readonly wrap: boolean;
  dim(index: number): boolean;
}

/**
 * Where the picture in focus stands on the frame at `scale`: its top-left corner at `at` when the scale is `rest`, the
 * whole frame at 1, the plane scaled about the one fixed point that keeps both. Its left edge's screen x.
 */
export const fixedPoint = (at: number, rest: number) => at / (1 - rest);

/**
 * Draw `row` at `scale` with the picture `focus` in focus, shifted `shift` whole pixels to the right
 * ([Browser](../../docs/browser.md#card-rows)): the plane is scaled about the fixed point `centre` (in frame pixels,
 * the focus picture's top-left corner at the plane's origin at scale 1), each frame pixel taking the plane's point
 * nearest its centre; the gaps and the ends beyond an unwrapped row leave the target. No color is mixed.
 */
export function drawPlaneRow(
  target: SoftwareSurface,
  row: PlaneRow,
  focus: number,
  scale: number,
  centre: { readonly x: number; readonly y: number },
  shift: number,
): void {
  const count = row.pictures.length;
  if (count === 0) return;
  const { width, height } = row.pictures[0]!;
  for (let y = 0; y < target.height; y++) {
    const v = Math.floor(centre.y + (y + 0.5 - centre.y) / scale);
    if (v < 0 || v >= height) continue;
    for (let x = 0; x < target.width; x++) {
      const u = centre.x + (x - shift + 0.5 - centre.x) / scale;
      const k = Math.floor(u / row.pitch),
        local = Math.floor(u - k * row.pitch);
      if (local >= width) continue;
      let index = focus + k;
      if (row.wrap) index = ((index % count) + count) % count;
      else if (index < 0 || index >= count) continue;
      const color = row.pictures[index]!.colorAt(local, v);
      if (color < 0) continue;
      target.pixels[y * target.width + x] = row.dim(index) ? halveRgb555(color) : color;
    }
  }
}
