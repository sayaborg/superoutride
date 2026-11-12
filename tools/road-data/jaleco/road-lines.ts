/**
 * The road ROMs' lines of JALECO's driving board ([BIG RUN road data](../../../docs/big-run-road-data.md#its-road-across)):
 * a line across, its pens' runs, and their paints as a road picture across.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import type { Paint, RoadPicture } from '../shared/two-roads.js';
import { CLEAR_PEN } from './ms1-tiles.js';

/** A road ROM line: 1,024 pixels at 4 bits, the left pixel of a byte its high nibble, its centre at pixel edge 512. */
export const LINE_PIXELS = 1024;
const LINE_BYTES = LINE_PIXELS / 2;
const CENTRE = LINE_PIXELS / 2;
/** The road ROMs' lines. */
export const LINES = 2048;

/** A run of one pen across a line: units right of the line's centre, a pixel a unit at its nearest row. */
export interface PenRun {
  readonly from: number;
  readonly to: number;
  /** Its pen, or null where it is clear (pen 15). */
  readonly pen: number | null;
}

/** Road ROM line `line` across: its pens' runs, left to right. */
export function lineRuns(rom: Uint8Array, line: number): PenRun[] {
  const pen = (x: number) => {
    const byte = rom[line * LINE_BYTES + (x >> 1)];
    if (byte === undefined) throw romDiffers(`The road ROMs hold no line ${line}`);
    return x & 1 ? byte & 15 : byte >> 4;
  };
  const runs: PenRun[] = [];
  for (let x = 0; x < LINE_PIXELS; x++) {
    const p = pen(x);
    const last = runs.at(-1);
    const value = p === CLEAR_PEN ? null : p;
    if (last && last.pen === value) runs[runs.length - 1] = { ...last, to: x + 1 - CENTRE };
    else runs.push({ from: x - CENTRE, to: x + 1 - CENTRE, pen: value });
  }
  return runs;
}

export type RunPaint = Paint | 'clear';

/** A run of a row's picture with its paint. */
export interface PaintedRun extends PenRun {
  readonly paint: RunPaint;
}

/** A line's surface's pen, BIG RUN's: the pen of the run at its centre. */
export const centreSurface = (runs: readonly PenRun[]): number | null => runs.find((r) => r.from <= 0 && r.to > 0)!.pen;

/**
 * A line's surface's pen, CISCO HEAT's: the pen its runs cover most of the line with between its two end runs, the run
 * at its centre a lane line; the centre's, a line of one or two runs.
 */
export function widestSurface(runs: readonly PenRun[]): number | null {
  const width = new Map<number, number>();
  for (const r of runs.slice(1, -1)) if (r.pen !== null) width.set(r.pen, (width.get(r.pen) ?? 0) + r.to - r.from);
  let [pen, most] = [centreSurface(runs), 0];
  for (const [p, w] of width) if (w > most) [pen, most] = [p, w];
  return pen;
}

/**
 * A line's runs with their paints: its surface's pen (`surface`, the run at its centre's by default) is its surface's
 * runs; the runs between the outermost of them are lines; from those out to the runs that reach the line's ends,
 * edges; those two runs the ground, or clear. A line of one run is all surface.
 */
export function paintedRuns(
  runs: readonly PenRun[],
  surfaceOf: (runs: readonly PenRun[]) => number | null = centreSurface,
): PaintedRun[] {
  const surface = surfaceOf(runs);
  const first = runs.findIndex((r) => r.pen === surface);
  const last = runs.length - 1 - [...runs].reverse().findIndex((r) => r.pen === surface);
  return runs.map((r, k) => ({
    ...r,
    paint:
      r.pen === null
        ? 'clear'
        : runs.length > 1 && (k === 0 || k === runs.length - 1)
          ? 'outside'
          : k >= first && k <= last
            ? r.pen === surface
              ? 'surface'
              : 'line'
            : 'edge',
  }));
}

/** A line's road picture across from its centre (`RoadPicture`): its painted runs' edges, the ground's and clear's outside. */
export const roadPictureOf = (runs: readonly PaintedRun[]): RoadPicture =>
  runs.slice(1).map((r) => ({ at: r.from, right: r.paint === 'clear' ? 'outside' : r.paint }));
