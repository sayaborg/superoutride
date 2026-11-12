/**
 * CISCO HEAT's reading camera ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-camera)): the pinhole
 * its road CPUs' depths are drawn from, at this game's focal length and tilting with the road
 * ([Profile from the original's screen](../../../docs/original-road-data.md#profile-from-the-originals-screen)).
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { GAME_CAMERA, originalRowsARow, type ReadingCamera } from '../shared/screen-measure.js';

/** Its screen's rows. */
export const SCREEN_ROWS = 224;

/** The most a depth may lie from its pinhole's, positions: its rounding. */
const DEPTH_ROUNDING = 1;

/** The pinhole its road's rows are drawn from: the nearest row's rows below the horizon, and its depth from the eye. */
export interface DepthPinhole {
  /** The nearest row's rows below the horizon. */
  readonly rows: number;
  /** The nearest row's depth from the eye, positions: the car's, as the depths are added to its position. */
  readonly behind: number;
}

/**
 * The pinhole the first road CPU's depths are drawn from (R1 0x2A66: the `lea` of its table, 0x3232; the `moveq` at
 * 0x2A72, a depth a row for 92 rows up from the nearest): the depth of the row k rows above the nearest, z, is a
 * pinhole's, z = behind × k ÷ (rows − k), its eye `behind` positions from the nearest row's ground and that row `rows`
 * below the horizon, every depth within its rounding of it. Stops where they are not.
 */
export function depthPinhole(road1: Uint8Array): DepthPinhole {
  const [, table] = instruction(road1, 0x2a66, [0x47f9, null, null], "the rows' depths (lea.l)");
  const [moveq] = instruction(road1, 0x2a72, [null], "the rows' count (moveq)");
  if (moveq >> 8 !== 0x7e) throw romDiffers(`The rows' count at R1 0x2A72 is no moveq to d7`);
  const depths = Array.from({ length: (moveq & 0xff) + 1 }, (_, k) => word(road1, table + 2 * k));
  // Least squares in `behind` for each `rows`, `rows` by a golden-section search past the farthest row.
  const fit = (rows: number) => {
    const g = depths.map((_, k) => k / (rows - k));
    const behind = g.reduce((s, a, k) => s + a * depths[k]!, 0) / g.reduce((s, a) => s + a * a, 0);
    return { rows, behind, miss: Math.max(...g.map((a, k) => Math.abs(behind * a - depths[k]!))) };
  };
  const sumOfSquares = (rows: number) => {
    const { behind } = fit(rows);
    return depths.reduce((s, z, k) => s + (behind * (k / (rows - k)) - z) ** 2, 0);
  };
  let [lo, hi] = [depths.length - 1 + 1e-6, 2 * depths.length];
  for (let n = 0; n < 200; n++) {
    const [a, b] = [lo + (hi - lo) * 0.382, hi - (hi - lo) * 0.382];
    if (sumOfSquares(a) < sumOfSquares(b)) hi = b;
    else lo = a;
  }
  const { rows, behind, miss } = fit((lo + hi) / 2);
  if (!(miss <= DEPTH_ROUNDING)) throw romDiffers(`The rows' depths lie up to ${miss} positions from a pinhole's`);
  return { rows, behind };
}

/**
 * Its reading camera, `metres` a position: at this game's focal length, its eye as far above the road as its pinhole's
 * at that focal length (its rows × behind, rows of 224 by positions) and as far behind the car as the pinhole's, tilting
 * with the road as its road CPUs pitch theirs ([research](../../../docs/research/cisco-heat.md#its-camera)).
 */
export function ciscoHeatCamera(road1: Uint8Array, metres: number): ReadingCamera {
  const { rows, behind } = depthPinhole(road1);
  const focal = GAME_CAMERA.focal;
  return Object.freeze({
    focal,
    eye: (rows * behind * metres) / (focal * originalRowsARow(SCREEN_ROWS)),
    behind: behind * metres,
    tilts: true,
  });
}
