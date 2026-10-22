/**
 * The originals' pixels on this game's texel grid ([Original road data](../../docs/original-road-data.md#boards)):
 * a road unit's metres, the pixels' aspect, a board's grid, chosen lines, mirroring and a palette's name.
 */
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';

/** `pixels`, `width` wide, mirrored left to right. */
export const mirror = <T>(pixels: readonly T[], width: number) =>
  pixels.map((_, i) => pixels[i - (i % width) + width - 1 - (i % width)]!);

/** A palette's name in a board. */
export const paletteName = (palette: number) => `p${String(palette).padStart(3, '0')}`;

/** Metres a road-width unit: K's 3.6 m lane over the original's lane spacing, 424/3 units (the road ROM's lines). */
export const UNIT_METRES = (3.6 * 3) / 424;

/** The original's pixels are 14 wide to 15 tall: 320 × 224 shown at 4:3. Its vertical amounts grow by this. */
export const PIXEL_ASPECT = 15 / 14;

/** The texels a pixel of `units` road units spans across at 40 texels/m, and down (`PIXEL_ASPECT` times that). */
export function texelsAPixel(units: number) {
  const across = units * UNIT_METRES * SPRITE_SOURCE_TEXELS_PER_METER;
  return { across, down: across * PIXEL_ASPECT };
}

/**
 * The texel grid a size of `width` × `height` pixels, each `units` road units, takes at 40 texels/m: across
 * `units × UNIT_METRES` metres a pixel, down `PIXEL_ASPECT` times that.
 */
export function boardGrid(width: number, height: number, units: number) {
  const { across } = texelsAPixel(units);
  return {
    width: Math.max(1, Math.round(width * across)),
    height: Math.max(1, Math.round(height * across * PIXEL_ASPECT)),
  };
}

/**
 * The lines a picture's axis of `n` lines keeps at `r` texels a line ([chosen lines](../../docs/original-road-data.md#chosen-lines)):
 * N = max(1, round(n·r)) source lines in order, made by dropping K = n − N lines or by repeating each ⌊N/n⌋ times and
 * K = N − ⌊N/n⌋·n of them once more. One of the K is chosen from each of K equal windows in order: the line differing
 * (`differs`) in fewest pixels from the nearer of its neighbours, those still kept when shrinking; then the one
 * nearest the window's middle; then the lowest. `mirrored`, N moves by one to make K even if it must, the first half's
 * K/2 lines are chosen and mirrored onto the second, and an odd middle line is neither dropped nor repeated once more.
 */
function chosenAxis(n: number, r: number, differs: (a: number, b: number) => number, mirrored: boolean): number[] {
  const extra = (count: number) => (count < n ? n - count : count % n);
  let count = Math.max(1, Math.round(n * r));
  if (mirrored && extra(count) % 2) count = count > 1 && n * r - count + 1 < count + 1 - n * r ? count - 1 : count + 1;
  const shrink = count < n;
  const K = extra(count);
  const dropped = new Set<number>();
  const score = (i: number) => {
    let left = i - 1;
    while (shrink && dropped.has(left)) left--;
    return Math.min(left >= 0 ? differs(i, left) : Infinity, i + 1 < n ? differs(i, i + 1) : Infinity);
  };
  const choose = (from: number, to: number) => {
    const middle = (from + to - 1) / 2;
    let best = from;
    for (let i = from + 1; i < to; i++) {
      const [d, e] = [score(i), score(best)];
      if (d < e || (d === e && Math.abs(i - middle) < Math.abs(best - middle))) best = i;
    }
    dropped.add(best);
    return best;
  };
  const half = mirrored ? Math.floor(n / 2) : n;
  const k = mirrored ? K / 2 : K;
  const left = Array.from({ length: k }, (_, j) =>
    choose(Math.floor((j * half) / k), Math.floor(((j + 1) * half) / k)),
  );
  const chosen = new Set(mirrored ? [...left, ...left.map((i) => n - 1 - i)] : left);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const times = shrink ? (chosen.has(i) ? 0 : 1) : Math.floor(count / n) + (chosen.has(i) ? 1 : 0);
    for (let t = 0; t < times; t++) out.push(i);
  }
  return out;
}

/**
 * `pixels` (`width` wide, row-major palette indices, 0 transparent) on the texel grid by chosen lines, `across` and
 * `down` texels a pixel: each axis planned from the picture (`chosenAxis`), transparency counted as an index, and each
 * texel the pixel of its chosen row and column. A picture whose every column is its mirror's stays symmetric.
 */
export function chosenLines(pixels: Uint8Array, width: number, across: number, down: number) {
  const height = pixels.length / width;
  const at = (x: number, y: number) => pixels[y * width + x]!;
  const columnsDiffer = (a: number, b: number) => {
    let d = 0;
    for (let y = 0; y < height; y++) if (at(a, y) !== at(b, y)) d++;
    return d;
  };
  const rowsDiffer = (a: number, b: number) => {
    let d = 0;
    for (let x = 0; x < width; x++) if (at(x, a) !== at(x, b)) d++;
    return d;
  };
  let symmetric = true;
  for (let x = 0; x < width && symmetric; x++) symmetric = columnsDiffer(x, width - 1 - x) === 0;
  const columns = chosenAxis(width, across, columnsDiffer, symmetric);
  const rows = chosenAxis(height, down, rowsDiffer, false);
  return {
    width: columns.length,
    height: rows.length,
    indices: rows.flatMap((y) => columns.map((x) => at(x, y))),
  };
}
