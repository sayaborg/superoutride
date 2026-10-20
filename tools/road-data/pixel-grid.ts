/**
 * The originals' pixels on this game's texel grid ([Original road data](../../docs/original-road-data.md#outline-boards)):
 * a road unit's metres, the pixels' aspect, a board's grid, area-majority sampling and a palette's name.
 */
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';

/** A palette's name in a board. */
export const paletteName = (palette: number) => `p${String(palette).padStart(3, '0')}`;

/** Metres a road-width unit: K's 3.6 m lane over the original's lane spacing, 424/3 units (the road ROM's lines). */
export const UNIT_METRES = (3.6 * 3) / 424;

/** The original's pixels are 14 wide to 15 tall: 320 × 224 shown at 4:3. Its vertical amounts grow by this. */
export const PIXEL_ASPECT = 15 / 14;

/**
 * The texel grid a size of `width` × `height` pixels, each `units` road units, takes at 40 texels/m: across
 * `units × UNIT_METRES` metres a pixel, down `PIXEL_ASPECT` times that.
 */
export function boardGrid(width: number, height: number, units: number) {
  const across = units * UNIT_METRES * SPRITE_SOURCE_TEXELS_PER_METER;
  return {
    width: Math.max(1, Math.round(width * across)),
    height: Math.max(1, Math.round(height * across * PIXEL_ASPECT)),
  };
}

/**
 * `pixels` (`width` wide, row-major palette indices, 0 transparent) on a grid of `w` × `h` texels: each texel takes the
 * index whose pixels cover most of its area, transparency counted as an index; of two as large, the index of the pixel
 * nearest its centre.
 */
export function areaMajority(pixels: Uint8Array, width: number, w: number, h: number): number[] {
  const height = pixels.length / width;
  const sx = width / w,
    sy = height / h;
  const out = new Array<number>(w * h);
  const area = new Map<number, number>();
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      const [x0, x1, y0, y1] = [tx * sx, (tx + 1) * sx, ty * sy, (ty + 1) * sy];
      area.clear();
      for (let y = Math.floor(y0); y < Math.min(height, Math.ceil(y1)); y++)
        for (let x = Math.floor(x0); x < Math.min(width, Math.ceil(x1)); x++) {
          const a = (Math.min(x1, x + 1) - Math.max(x0, x)) * (Math.min(y1, y + 1) - Math.max(y0, y));
          const v = pixels[y * width + x]!;
          area.set(v, (area.get(v) ?? 0) + a);
        }
      const most = Math.max(...area.values());
      const tied = [...area].filter(([, a]) => most - a < 1e-9).map(([v]) => v);
      if (tied.length === 1) out[ty * w + tx] = tied[0]!;
      else {
        // The tied index of the pixel nearest the texel's centre.
        const cx = (x0 + x1) / 2,
          cy = (y0 + y1) / 2;
        const x = Math.min(width - 1, Math.floor(cx)),
          y = Math.min(height - 1, Math.floor(cy));
        const centre = pixels[y * width + x]!;
        out[ty * w + tx] = tied.includes(centre) ? centre : Math.min(...tied);
      }
    }
  return out;
}
