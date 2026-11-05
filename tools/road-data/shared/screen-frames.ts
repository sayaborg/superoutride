/**
 * The grades' rule's pieces' frames ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen),
 * Pieces), as every original's are laid: a piece's frames and the camera reading them, its cells and its stretch. Each
 * original's hardware lays its own (OUTRUN's and TURBO OUTRUN's `out-run-hardware/screen-frames`, ENDURO RACER's
 * `enduro-racer-screen-frames`).
 */
import { FAR, type ReadingCamera, type ScreenFrames } from './screen-measure.js';
import { CELL_METRES } from './shared-constants.js';

/** A piece's frames, the camera reading them, its cells, its stretch's cells [a, b) and its borders. */
export interface PieceFrames {
  readonly frames: ScreenFrames;
  readonly camera: ReadingCamera;
  /** A cell's metres and positions. */
  readonly cell: number;
  readonly cellPositions: number;
  readonly a: number;
  readonly b: number;
  /** A piece repeated along the read road this many times, its stretch its whole (ENDURO RACER's cycle). */
  readonly repeats?: number;
  /** Whether it is a lap (its stretch its whole, repeated from its start): its grade at its start free, its end's the same. */
  readonly closed?: boolean;
}

export const cellPositionsOf = (metres: number) => Math.round(CELL_METRES / metres);

/**
 * A road that closes: its cell the whole number of its positions nearest `CELL_METRES` that divides its lap of `lap`
 * positions, so that its cells repeat by the lap (of two as near, the shorter).
 */
export function closedCellPositions(metres: number, lap: number): number {
  let best = 0;
  for (let d = 1; d <= lap; d++)
    if (lap % d === 0 && (!best || Math.abs(d * metres - CELL_METRES) < Math.abs(best * metres - CELL_METRES)))
      best = d;
  return best;
}

/** The fewest cells before a stretch that reach `FAR`: before them no stretch lies within the camera's sight. */
export const cellsBefore = (cell: number) => Math.ceil(FAR / cell);
