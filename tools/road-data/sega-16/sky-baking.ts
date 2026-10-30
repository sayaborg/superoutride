/**
 * An original's background laid into one sky ([Original road data](../../../docs/original-road-data.md#sky-baking)): both
 * layers' columns chosen to the sky's width, laid over the sky's ramp in the original's rows, the rows chosen to the
 * sky's height, and drawn as a tile picture.
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
/** A turn, degrees, within [−180, 180). */
export const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

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

/** What an original gives for one sky. */
export interface SkyBands {
  readonly back: SkyLayer;
  readonly front: SkyLayer;
  /**
   * The back layer's pixel the front's pixel 0 lies over, as the original has it, a whole pixel or not: the front's
   * pixel f lies over the back's 0.75f + overlap.
   */
  readonly overlap: number;
  /**
   * The ramp: RGB555 of each row up from the horizon (0 the row just above it), the last for every row above, and the
   * color below the horizon.
   */
  readonly ramp: { readonly rows: readonly number[]; readonly below: number };
}

/**
 * Sky `name` laid from `bands` by chosen lines: each layer's columns chosen to the sky's 1504 (`chosenGrid`), the front's
 * column j over the back's j + `overlap` × 1504 / the back's width; the ramp, the back layer over it and the front over
 * that, each by its bottom row, in the original's rows; then the rows chosen each way from the horizon to 320, its
 * pixels' `aspect` × 1504 / the back's width a row; drawn as a tile picture as the skies command draws one.
 */
export function bakeSky(name: string, bands: SkyBands, aspect: number): TilePictureDocument {
  const { back, front, overlap, ramp } = bands;
  if (front.width * 3 !== back.width * 4) throw new RangeError('A front layer turns 4/3 as many pixels as its back');
  const columns = (layer: SkyLayer) => chosenGrid(layer.pixels, layer.width, SKY_WIDTH / layer.width, 1).columns;
  const [backColumns, frontColumns] = [columns(back), columns(front)];
  const shift = Math.round((overlap * SKY_WIDTH) / back.width);
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
        const b = layerPixel(back, backColumns[x]!, y);
        if (b !== TRANSPARENT) color = b;
        const f = layerPixel(front, frontColumns[(((x - shift) % SKY_WIDTH) + SKY_WIDTH) % SKY_WIDTH]!, y);
        if (f !== TRANSPARENT) color = f;
        pixels[j * SKY_WIDTH + x] = color;
      }
    }
    return pixels;
  };
  const down = (SKY_WIDTH / back.width) * aspect;
  const count = Math.round(SKY_HORIZON / down);
  const half = (top: number) => {
    const pixels = laid(top, count);
    const rows = chosenGrid(pixels, SKY_WIDTH, 1, down).rows;
    if (rows.length !== SKY_HORIZON) throw new Error(`A sky's half is ${SKY_HORIZON} rows`);
    return rows.map((r) => pixels.subarray(r * SKY_WIDTH, (r + 1) * SKY_WIDTH));
  };
  const pixels = new Uint32Array(SKY_WIDTH * SKY_HEIGHT);
  [...half(-count), ...half(0)].forEach((row, y) =>
    row.forEach((color, x) => (pixels[y * SKY_WIDTH + x] = rgb555ToRgba(color))),
  );
  return drawScreenPicture(
    name,
    { width: SKY_WIDTH, height: SKY_HEIGHT, pixels },
    { columns: SKY_WIDTH / TILE_PICTURE_TILE_SIZE, rows: SKY_TILE_ROWS, fit: 'fill' },
  );
}

/** A sky of one color, `rgb555`, everywhere, on the published sky's grid: no layer and no ramp to lay. */
export function uniformSky(name: string, rgb555: number): TilePictureDocument {
  const pixels = new Uint32Array(SKY_WIDTH * SKY_HEIGHT).fill(rgb555ToRgba(rgb555));
  return drawScreenPicture(
    name,
    { width: SKY_WIDTH, height: SKY_HEIGHT, pixels },
    { columns: SKY_WIDTH / TILE_PICTURE_TILE_SIZE, rows: SKY_TILE_ROWS, fit: 'fill' },
  );
}
