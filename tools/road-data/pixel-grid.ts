/**
 * The originals' pixels on this game's texel grid ([OUTRUN road data](../../docs/outrun-road-data.md#boards)):
 * a road unit's metres, the pixels' aspect, a pixel's texels, chosen lines, a picture turned as shown, a palette's name
 * and a board's master.
 */
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { anchorPoint } from './sprite-pixels.js';

/** `pixels`, `width` wide, turned as shown: mirrored left to right, flipped upside down. */
export function turned(pixels: ArrayLike<number>, width: number, mirrored: boolean, flipped = false): number[] {
  const height = pixels.length / width;
  return Array.from({ length: pixels.length }, (_, i) => {
    const [x, y] = [i % width, Math.floor(i / width)];
    return pixels[(flipped ? height - 1 - y : y) * width + (mirrored ? width - 1 - x : x)]!;
  });
}

/**
 * Pen 10, the sprite hardware's shadow in a picture drawn with shadows allowed: it darkens what lies behind it, its
 * palette color unused.
 */
export const SHADOW_PEN = 10;

/**
 * The colored columns of a picture `width` pixels wide: from the leftmost to the rightmost column holding a pixel
 * neither transparent (0) nor the shadow's (`SHADOW_PEN`). An object's body is at most this wide.
 */
export function coloredColumns(pixels: ArrayLike<number>, width: number): number {
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i]!;
    if (v === 0 || v === SHADOW_PEN) continue;
    [lo, hi] = [Math.min(lo, i % width), Math.max(hi, i % width)];
  }
  return hi < lo ? 0 : hi - lo + 1;
}

/** A palette's name in a board. */
export const paletteName = (palette: number) => `p${String(palette).padStart(3, '0')}`;

/** Metres a road-width unit: K's 3.6 m lane over the original's lane spacing, 424/3 units (the road ROM's lines). */
export const UNIT_METRES = (3.6 * 3) / 424;

/** The original's pixels are 14 wide to 15 tall: 320 × 224 shown at 4:3. Its vertical amounts grow by this. */
export const PIXEL_ASPECT = 15 / 14;

/** The texels a pixel `metres` wide spans across at 40 texels/m, and down (`PIXEL_ASPECT` times that). */
export function texelsAPixel(metres: number) {
  const across = metres * SPRITE_SOURCE_TEXELS_PER_METER;
  return { across, down: across * PIXEL_ASPECT };
}

/**
 * A board's master: `indices` on its texel grid in each of `palettes`' colors (`colors`, the first palette its
 * default), its base point (`anchorY` written where it is given and not the bottom edge's) and what more it carries
 * (`more`, in its order).
 */
export function boardMaster(
  name: string,
  grid: { readonly width: number; readonly height: number },
  indices: readonly number[],
  anchor: { readonly x: number; readonly y?: number },
  palettes: readonly number[],
  colors: (palette: number) => readonly number[],
  more: Partial<SpriteLodDocument> = {},
): SpriteLodDocument {
  return {
    format: 'superoutride.sprite-lod',
    version: 7,
    name,
    width: grid.width,
    height: grid.height,
    anchorX: anchor.x,
    ...(anchor.y === undefined || anchor.y === grid.height - 0.5 ? {} : { anchorY: anchor.y }),
    defaultPalette: paletteName(palettes[0]!),
    palettes: Object.fromEntries(palettes.map((p) => [paletteName(p), { colors: colors(p) }])),
    levels: [{ paletteRgb555: colors(palettes[0]!), indices, mixtures: spriteIdentityMixtures() }],
    ...more,
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
 * `pixels` (`width` wide, row-major palette indices or colors, transparency among them) on the texel grid by chosen
 * lines, `across` and `down` texels a pixel: each texel the pixel of its chosen row and column (`chosenGrid`).
 */
export function chosenLines(pixels: ArrayLike<number>, width: number, across: number, down: number) {
  const { columns, rows } = chosenGrid(pixels, width, across, down);
  return {
    width: columns.length,
    height: rows.length,
    indices: rows.flatMap((y) => columns.map((x) => pixels[y * width + x]!)),
  };
}

/**
 * The source columns and rows of `pixels`' texels at `across` and `down` texels a pixel: each axis planned from the
 * picture (`chosenAxis`), transparency counted as an index or a color. A picture whose every column is its mirror's
 * stays symmetric.
 */
export function chosenGrid(pixels: ArrayLike<number>, width: number, across: number, down: number) {
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
  return {
    columns: chosenAxis(width, across, columnsDiffer, symmetric),
    rows: chosenAxis(height, down, rowsDiffer, false),
  };
}

/**
 * The shadow's binary frame (`width` pixels wide) on the texel grid of `scale` texels a pixel, anchored as `anchor`, its
 * base point `aside` source pixels across from there (the frame then stands that far the other way).
 */
export function shadowFrame(
  pixels: Uint8Array,
  width: number,
  scale: { readonly x: number; readonly y: number },
  anchor: number,
  aside: number,
) {
  const grid = chosenLines(pixels, width, scale.x, scale.y);
  const point = anchorPoint(anchor, grid.width, grid.height);
  return {
    width: grid.width,
    height: grid.height,
    anchorX: point.x - aside * scale.x,
    anchorY: point.y,
    levels: [{ indices: grid.indices }],
  };
}
