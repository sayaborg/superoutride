/**
 * Boards lying on the road ([Original road data](../../../docs/original-road-data.md#boards-lying-on-the-road)): a
 * board's picture laid flat on the road, its rows dividing evenly the steps from the board before it in its line to it,
 * its top row the farthest, its columns across about its lateral; each run of one pen class along a row is a Strip in
 * the linear-light mean of its pixels' colors (K, 2026-11-02).
 */
import { meanColor } from '../../../src/image/image-filter.js';
import { contractUnmet } from './conversion-errors.js';

/** The pen classes a row's runs are of: the asphalt's pens 1–7 and the paint's 8–14; pen 0 is transparent. */
export const PEN_CLASSES: readonly (readonly [number, number])[] = Object.freeze([
  [1, 7],
  [8, 14],
]);

/** Boards of one line stand in one run while at most this many steps apart. */
export const BOARD_RUN = 12;

/** A board lying on the road. */
export interface LyingBoard {
  /** Where it stands and where the board before it in its line stands, steps (`before` < `at`). */
  readonly at: number;
  readonly before: number;
  /** Its middle's lateral and a pixel's width across, units. */
  readonly x: number;
  readonly pixel: number;
  readonly picture: { readonly width: number; readonly pixels: Uint8Array };
  /** Its palette's colors, pen p's at p − 1. */
  readonly rgb: readonly number[];
  readonly mirrored: boolean;
  readonly flipped: boolean;
}

/** A Strip of a lying board: from and to along the road, steps; its left and right, units; its color. */
export interface LyingStrip {
  readonly from: number;
  readonly to: number;
  readonly left: number;
  readonly right: number;
  readonly color: number;
}

/**
 * A board's Strips, its rows from the farthest (its top, or its bottom when flipped) to the nearest; rows whose runs
 * are alike are one Strip each run. `outside` counts its pixels in no pen class and not transparent.
 */
export function lyingStrips(board: LyingBoard): { strips: LyingStrip[]; outside: number } {
  const { width, pixels } = board.picture;
  const height = pixels.length / width;
  const length = (board.at - board.before) / height;
  const left = board.x - (width * board.pixel) / 2;
  let outside = 0;
  // Each row's runs as laid, left to right: their columns and color.
  const rows = Array.from({ length: height }, (_, d) => {
    const y = board.flipped ? height - 1 - d : d;
    const runs: { from: number; to: number; color: number }[] = [];
    let run: { cls: number; from: number; colors: number[] } | null = null;
    const close = (to: number) =>
      run && run.cls >= 0 && runs.push({ from: run.from, to, color: meanColor(run.colors) });
    for (let c = 0; c < width; c++) {
      const pen = pixels[y * width + (board.mirrored ? width - 1 - c : c)]!;
      const cls = pen === 0 ? -1 : PEN_CLASSES.findIndex(([a, b]) => pen >= a && pen <= b);
      if (pen !== 0 && cls < 0) outside++;
      if (!run || run.cls !== cls) {
        close(c);
        run = { cls, from: c, colors: [] };
      }
      if (cls >= 0) run.colors.push(board.rgb[pen - 1]!);
    }
    close(width);
    return runs;
  });
  const alike = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    a.length === b.length && a.every((r, k) => r.from === b[k]!.from && r.to === b[k]!.to && r.color === b[k]!.color);
  const strips: LyingStrip[] = [];
  // Displayed row d lies from at − (d + 1)·length to at − d·length; alike rows one stretch.
  for (let d = 0; d < height;) {
    let e = d + 1;
    while (e < height && alike(rows[e]!, rows[d]!)) e++;
    for (const run of rows[d]!)
      strips.push({
        from: board.at - e * length,
        to: board.at - d * length,
        left: left + run.from * board.pixel,
        right: left + run.to * board.pixel,
        color: run.color,
      });
    d = e;
  }
  return { strips: strips.sort((a, b) => a.from - b.from), outside };
}

/**
 * For boards of one line at steps `steps` (increasing), the step of the board before each: the one before it in its
 * run (`BOARD_RUN`); the first of a run, as far before it as the board after it is. A closed line (`lap` its length) runs
 * on round it. A board alone in its run stops the conversion.
 */
export function boardsBefore(steps: readonly number[], lap: number | null): number[] {
  const n = steps.length;
  const previous = (k: number) => (k > 0 ? steps[k - 1]! : lap !== null ? steps[n - 1]! - lap : -Infinity);
  const next = (k: number) => (k < n - 1 ? steps[k + 1]! : lap !== null ? steps[0]! + lap : Infinity);
  return steps.map((at, k) => {
    if (at - previous(k) <= BOARD_RUN) return previous(k);
    if (next(k) - at <= BOARD_RUN) return at - (next(k) - at);
    throw contractUnmet(`The board lying at step ${at} stands alone`);
  });
}
