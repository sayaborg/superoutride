/**
 * An original's background laid into one sky ([Original road data](../../../docs/original-road-data.md#sky-baking)): its
 * layers' columns chosen to the sky's width, each over its turn, laid in the original's order over the sky's ramp in its
 * rows, the rows chosen to the sky's height by the layer that faces it, and drawn as a tile picture.
 */
import { rgb555ToRgba } from '../../../src/image/rgb555.js';
import { TILE_PICTURE_TILE_SIZE, type TilePictureDocument } from '../../../src/image/tile-picture.js';
import { SKY_TILE_ROWS } from '../../../src/course/compiler/course-appearance.js';
import { drawScreenPicture } from '../../graphics/screen-pictures.js';
import { chosenGrid } from './pixel-grid.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';

/** A layer's pixel that shows nothing. */
export const TRANSPARENT = -1;

/** The published sky: 188 × 80 tiles, its horizon between rows 319 and 320. */
export const SKY_WIDTH = 1504;
export const SKY_HEIGHT = SKY_TILE_ROWS * TILE_PICTURE_TILE_SIZE;
export const SKY_HORIZON = 320;
/** The sky's period at this game's focal length, degrees: a turn of its width, 1504 pixels at 240 a radian (359.04°). */
const SKY_PERIOD = ((SKY_WIDTH / CAMERA_DEFINITION.focalLength) * 180) / Math.PI;

/**
 * A Section's sky's yaw origin, degrees: the course's, `origin`, and the road's turn from the course's start to the
 * Section's start, `turn` degrees, continued from Section to Section, so that the sky never jumps at a border; taken
 * by the sky's period only where it would leave the format's ±360°, which moves the picture by a whole width.
 */
export function sectionYawOrigin(origin: number, turn: number): number {
  let yaw = origin + turn;
  while (yaw > 360) yaw -= SKY_PERIOD;
  while (yaw < -360) yaw += SKY_PERIOD;
  return yaw;
}

/**
 * A published sky's yaw origin, degrees, where the road vanishes at the original's heading 0 at its back layer's column
 * `back` (of its `backWidth`): that column shown at this game's camera's centre.
 */
export const skyYawOrigin = (back: number, backWidth: number) =>
  ((SKY_WIDTH - ((back * SKY_WIDTH) / backWidth - CAMERA_DEFINITION.centerX)) / CAMERA_DEFINITION.focalLength) *
  (180 / Math.PI);

/**
 * A layer: RGB555 pixels row by row, `width` a row (`TRANSPARENT` where none), its bottom row `bottom` rows below the
 * horizon (0 the first row below it).
 */
export interface SkyLayer {
  readonly width: number;
  readonly pixels: Int32Array;
  readonly bottom: number;
}

/**
 * A layer as the sky lays it: its pixels a turn (`turn`), its picture's width where absent, and the facing layer's
 * pixel its pixel 0 lies over (`overlap`), as the original has it, a whole pixel or not: its pixel f lies over the
 * facing layer's f × (the facing's turn ÷ its turn) + overlap.
 */
export interface SkyBand extends SkyLayer {
  readonly turn?: number;
  readonly overlap?: number;
}

/**
 * What an original gives for one sky: its layers in the order it draws them, the first drawn first, each a turn of its
 * own pixels; the layer that faces the sky (`facing`), whose turn is the sky's and whose rows set the sky's; and the
 * facing layer's pixel at which a layer whose turn is no whole number of its pictures has its seam (`seam`).
 */
export interface SkyBands {
  readonly layers: readonly SkyBand[];
  readonly facing: number;
  readonly seam?: number;
  /**
   * The ramp: RGB555 of each row up from the horizon (0 the row just above it), the last for every row above, and the
   * color below the horizon.
   */
  readonly ramp: { readonly rows: readonly number[]; readonly below: number };
}

/**
 * Sky `name` laid from `bands` by chosen lines: each layer's columns chosen to the sky's 1504 (`chosenGrid`) over its
 * turn, a layer's column j over the facing layer's j + `overlap` × 1504 / the facing's width, a layer of a turn other
 * than its picture's laid round from the facing layer's pixel `seam`; the ramp, then each layer over it in its order,
 * each by its bottom row, in the original's rows; then the rows chosen each way from the horizon to 320, its pixels'
 * `aspect` × 1504 / the facing layer's width a row; drawn as a tile picture as the skies command draws one.
 */
export function bakeSky(name: string, bands: SkyBands, aspect: number): TilePictureDocument {
  const { layers, ramp } = bands;
  const facing = layers[bands.facing]!;
  const columns = (pixels: Int32Array, width: number) => chosenGrid(pixels, width, SKY_WIDTH / width, 1).columns;
  const wrap = (x: number) => ((x % SKY_WIDTH) + SKY_WIDTH) % SKY_WIDTH;
  // Each layer's picture column at each of the sky's columns.
  const placed = layers.map((layer, k): ((x: number) => number) => {
    const chosen = columns(layer.pixels, layer.width);
    if (k === bands.facing) return (x) => chosen[x]!;
    const overlap = layer.overlap ?? 0;
    if (layer.turn === undefined || layer.turn === layer.width) {
      const shift = Math.round((overlap * SKY_WIDTH) / facing.width);
      return (x) => chosen[wrap(x - shift)]!;
    }
    // Laid round from the facing layer's pixel `seam`: its turn's pixels from its own pixel there, chosen to the sky.
    const seam = bands.seam ?? 0;
    const length = Math.round(layer.turn);
    const start = ((seam - overlap) * layer.turn) / facing.width;
    const height = layer.pixels.length / layer.width;
    const round = new Int32Array(length * height);
    const source = (k: number) => ((Math.floor(start + k) % layer.width) + layer.width) % layer.width;
    for (let y = 0; y < height; y++)
      for (let k = 0; k < length; k++) round[y * length + k] = layer.pixels[y * layer.width + source(k)]!;
    const roundColumns = columns(round, length);
    const from = Math.round((seam * SKY_WIDTH) / facing.width);
    return (x) => source(roundColumns[wrap(x - from)]!);
  });
  const layerPixel = (layer: SkyLayer, x: number, y: number) => {
    const height = layer.pixels.length / layer.width;
    const row = height - 1 - (layer.bottom - y);
    return row >= 0 && row < height ? layer.pixels[row * layer.width + x]! : TRANSPARENT;
  };
  // The original's rows from `top` (counted down from the first below the horizon), `count` of them, laid.
  const laid = (top: number, count: number) => {
    const pixels = new Int32Array(SKY_WIDTH * count);
    for (let j = 0; j < count; j++) {
      const y = top + j;
      const sky = y < 0 ? ramp.rows[Math.min(ramp.rows.length - 1, -y - 1)]! : ramp.below;
      for (let x = 0; x < SKY_WIDTH; x++) {
        let color = sky;
        layers.forEach((layer, k) => {
          const p = layerPixel(layer, placed[k]!(x), y);
          if (p !== TRANSPARENT) color = p;
        });
        pixels[j * SKY_WIDTH + x] = color;
      }
    }
    return pixels;
  };
  const down = (SKY_WIDTH / facing.width) * aspect;
  // The original's rows each way, as many as the nearest whole number gives 320 of, one more where they give fewer, the
  // 320 nearest the horizon kept.
  const reach = (count: number) => chosenGrid(new Int32Array(SKY_WIDTH * count), SKY_WIDTH, 1, down).rows.length;
  const nearest = Math.round(SKY_HORIZON / down);
  const count = reach(nearest) >= SKY_HORIZON ? nearest : nearest + 1;
  const half = (top: number, nearHorizon: 'end' | 'start') => {
    const pixels = laid(top, count);
    const all = chosenGrid(pixels, SKY_WIDTH, 1, down).rows;
    if (all.length < SKY_HORIZON) throw new Error(`A sky's half is ${SKY_HORIZON} rows`);
    const rows = nearHorizon === 'end' ? all.slice(all.length - SKY_HORIZON) : all.slice(0, SKY_HORIZON);
    return rows.map((r) => pixels.subarray(r * SKY_WIDTH, (r + 1) * SKY_WIDTH));
  };
  const pixels = new Uint32Array(SKY_WIDTH * SKY_HEIGHT);
  [...half(-count, 'end'), ...half(0, 'start')].forEach((row, y) =>
    row.forEach((color, x) => (pixels[y * SKY_WIDTH + x] = rgb555ToRgba(color))),
  );
  return drawScreenPicture(
    name,
    { width: SKY_WIDTH, height: SKY_HEIGHT, pixels },
    { columns: SKY_WIDTH / TILE_PICTURE_TILE_SIZE, rows: SKY_TILE_ROWS, fit: 'fill' },
  );
}
