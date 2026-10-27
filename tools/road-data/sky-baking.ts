/**
 * An original's background baked into one sky ([Original road data](../../docs/original-road-data.md#sky-baking)): the
 * front layer's columns thinned to the back layer's width, both layers laid over the sky's ramp in the original's pixels,
 * the whole averaged in linear light to the published sky's size and drawn as a tile picture.
 */
import { linearToRgb555, rgb555LinearChannel } from '../../src/image/image-filter.js';
import { rgb555ToRgba } from '../../src/image/rgb555.js';
import { TILE_PICTURE_TILE_SIZE, type TilePictureDocument } from '../../src/image/tile-picture.js';
import { SKY_TILE_ROWS } from '../../src/course/compiler/course-appearance.js';
import { drawScreenPicture } from '../graphics/screen-pictures.js';
import { PIXEL_ASPECT } from './pixel-grid.js';

/** A layer's pixel that shows nothing. */
export const TRANSPARENT = -1;

/** The back layer's width and the front's, pixels: the front turns 4/3 as many pixels a turn. */
export const BACK_WIDTH = 1536;
export const FRONT_WIDTH = 2048;
/** The published sky: 94 × 40 tiles, its horizon between rows 319 and 320. */
export const SKY_WIDTH = 1504;
export const SKY_HEIGHT = SKY_TILE_ROWS * TILE_PICTURE_TILE_SIZE;
export const SKY_HORIZON = 320;
/** The front layer's columns removed so far stay within this many of one in four. */
const SLACK = 8;

/**
 * A layer: RGB555 pixels row by row, `width` a row (`TRANSPARENT` where none), its bottom row `bottom` rows below the
 * horizon (0 the first row below it).
 */
export interface SkyLayer {
  readonly width: number;
  readonly pixels: Int32Array;
  readonly bottom: number;
}

/** What an original gives for one sky. */
export interface SkyBands {
  readonly back: SkyLayer;
  readonly front: SkyLayer;
  /** The back layer's pixel the front's pixel 0 lies over: the front's pixel f lies over the back's 0.75f + overlap. */
  readonly overlap: number;
  /**
   * The ramp: RGB555 of each row up from the horizon (0 the row just above it), the last for every row above, and the
   * color below the horizon.
   */
  readonly ramp: { readonly rows: readonly number[]; readonly below: number };
}

const linear = (rgb555: number): readonly [number, number, number] => [
  rgb555LinearChannel((rgb555 >> 10) & 31),
  rgb555LinearChannel((rgb555 >> 5) & 31),
  rgb555LinearChannel(rgb555 & 31),
];

/**
 * The difference of two pixels: the mean of their channels' differences in linear light, 1 between transparency and
 * any color.
 */
export function pixelDifference(a: number, b: number): number {
  if (a === TRANSPARENT || b === TRANSPARENT) return a === b ? 0 : 1;
  const [p, q] = [linear(a), linear(b)];
  return (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])) / 3;
}

/**
 * The front layer's `BACK_WIDTH` columns kept, in order: of the ways to remove `FRONT_WIDTH − BACK_WIDTH`, the one by
 * dynamic programming whose columns made neighbours differ least in all (the sum of their pixels' differences), the
 * columns removed before each column within `SLACK` of a quarter of it. Of equal sums, the first found.
 */
export function keptColumns(front: SkyLayer): number[] {
  const { width, pixels } = front;
  const height = pixels.length / width;
  if (width !== FRONT_WIDTH) throw new RangeError(`A front layer is ${FRONT_WIDTH} pixels wide`);
  const remove = FRONT_WIDTH - BACK_WIDTH;
  // r columns removed before column i keep within SLACK of i / 4; at the end exactly `remove`.
  const fits = (i: number, r: number) => Math.abs(r - (i * remove) / width) <= SLACK;
  const gap = Math.ceil((2 * SLACK * width) / (width - remove)) + 1;
  const difference = (a: number, b: number) => {
    let d = 0;
    for (let y = 0; y < height; y++) d += pixelDifference(pixels[y * width + a]!, pixels[y * width + b]!);
    return d;
  };
  // State: column c kept with r removed before it; its cost and the kept column before it.
  const states = new Map<number, { cost: number; from: number }>();
  const key = (c: number, r: number) => c * (remove + 1) + r;
  for (let c = 0; c <= gap && c <= remove; c++) {
    let ok = true;
    for (let i = 0; i <= c; i++) ok &&= fits(i, i);
    if (ok) states.set(key(c, c), { cost: 0, from: -1 });
  }
  for (let c = 0; c < width; c++)
    for (let r = Math.max(0, Math.ceil((c * remove) / width - SLACK)); r <= Math.min(remove, c); r++) {
      const state = states.get(key(c, r));
      // Column c kept, r stay removed before c + 1 whatever follows.
      if (!state || !fits(c + 1, r)) continue;
      for (let g = 0; g <= gap && c + 1 + g < width && r + g <= remove; g++) {
        if (!fits(c + 1 + g, r + g)) {
          if (r + g - ((c + 1 + g) * remove) / width > SLACK) break;
          continue;
        }
        const next = key(c + 1 + g, r + g);
        const cost = state.cost + difference(c, c + 1 + g);
        const known = states.get(next);
        if (!known || cost < known.cost) states.set(next, { cost, from: key(c, r) });
      }
    }
  let best = -1,
    bestCost = Infinity;
  for (let c = width - 1; c >= width - 1 - gap && c >= 0; c--) {
    const r = remove - (width - 1 - c);
    let ok = r >= 0;
    for (let i = c + 1; i <= width && ok; i++) ok = fits(i, r + i - c - 1);
    const state = ok ? states.get(key(c, r)) : undefined;
    if (state && state.cost < bestCost) [best, bestCost] = [key(c, r), state.cost];
  }
  if (best < 0) throw new Error('No way removes the front layer’s columns within the slack');
  const kept: number[] = [];
  for (let k = best; k >= 0; k = states.get(k)!.from) kept.push(Math.floor(k / (remove + 1)));
  return kept.reverse();
}

/** The source pixels each target pixel covers along one axis from `start`, `scale` target pixels a source pixel. */
function areaWeights(target: number, scale: number, start: number): (readonly [index: number, weight: number])[][] {
  return Array.from({ length: target }, (_, i) => {
    const [from, to] = [start + i / scale, start + (i + 1) / scale];
    const weights: [number, number][] = [];
    for (let s = Math.floor(from); s < Math.ceil(to); s++) {
      const covered = Math.min(to, s + 1) - Math.max(from, s);
      if (covered > 1e-12) weights.push([s, covered * scale]);
    }
    return weights;
  });
}

/**
 * Sky `name` baked from `bands`: the front layer's kept columns (`keptColumns`) laid one a back pixel from the back's
 * pixel `overlap`; then, in the original's pixels, the ramp, the back layer over it and the front over that, each by its
 * bottom row; then each of the sky's 1504 × 640 pixels the linear-light mean of the area it covers, 1504/1536 a pixel
 * across and 15/14 of that down, the horizon at row 320; drawn as a tile picture as the skies command draws one.
 */
export function bakeSky(name: string, bands: SkyBands): TilePictureDocument {
  const { back, front, overlap, ramp } = bands;
  if (back.width !== BACK_WIDTH) throw new RangeError(`A back layer is ${BACK_WIDTH} pixels wide`);
  const kept = keptColumns(front);
  const sx = SKY_WIDTH / BACK_WIDTH,
    sy = sx * PIXEL_ASPECT;
  const top = Math.floor(-SKY_HORIZON / sy);
  const rows = Math.ceil((SKY_HEIGHT - SKY_HORIZON) / sy) - top;
  // The original's pixels from row `top` (rows counted down from the first below the horizon), in linear light.
  const layerPixel = (layer: SkyLayer, x: number, y: number) => {
    const height = layer.pixels.length / layer.width;
    const row = height - 1 - (layer.bottom - y);
    return row >= 0 && row < height ? layer.pixels[row * layer.width + x]! : TRANSPARENT;
  };
  const source = new Float64Array(BACK_WIDTH * rows * 3);
  for (let j = 0; j < rows; j++) {
    const y = top + j;
    const sky = y < 0 ? ramp.rows[Math.min(ramp.rows.length - 1, -y - 1)]! : ramp.below;
    for (let x = 0; x < BACK_WIDTH; x++) {
      let color = sky;
      const b = layerPixel(back, x, y);
      if (b !== TRANSPARENT) color = b;
      const f = layerPixel(front, kept[(((x - overlap) % BACK_WIDTH) + BACK_WIDTH) % BACK_WIDTH]!, y);
      if (f !== TRANSPARENT) color = f;
      source.set(linear(color), (j * BACK_WIDTH + x) * 3);
    }
  }
  const columns = areaWeights(SKY_WIDTH, sx, 0),
    lines = areaWeights(SKY_HEIGHT, sy, -SKY_HORIZON / sy - top);
  const pixels = new Uint32Array(SKY_WIDTH * SKY_HEIGHT);
  for (let y = 0; y < SKY_HEIGHT; y++)
    for (let x = 0; x < SKY_WIDTH; x++) {
      const mean = [0, 0, 0];
      for (const [j, wy] of lines[y]!)
        for (const [i, wx] of columns[x]!)
          for (let c = 0; c < 3; c++) mean[c]! += source[(j * BACK_WIDTH + i) * 3 + c]! * wx * wy;
      pixels[y * SKY_WIDTH + x] = rgb555ToRgba(linearToRgb555(mean[0]!, mean[1]!, mean[2]!));
    }
  return drawScreenPicture(
    name,
    { width: SKY_WIDTH, height: SKY_HEIGHT, pixels },
    { columns: SKY_WIDTH / TILE_PICTURE_TILE_SIZE, rows: SKY_TILE_ROWS, fit: 'fill' },
  );
}
