/**
 * The grades' rule's pieces' frames ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen),
 * Pieces), as every original's are laid: a piece's frames and the camera reading them, its cells and its stretch. Each
 * original's board lays its own (OUTRUN's and TURBO OUTRUN's `out-run-board/screen-frames`, ENDURO RACER's
 * `enduro-racer-screen-frames`).
 */
import { FAR, type ReadingCamera, type ScreenFrames } from './screen-measure.js';

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
}

/** A cell: the whole number of the original's positions nearest this many metres (OUTRUN's 5, ENDURO RACER's 8). */
const CELL_METRES = 10;
export const cellPositionsOf = (metres: number) => Math.round(CELL_METRES / metres);

/** The fewest cells before a stretch that reach `FAR`: before them no stretch lies within the camera's sight. */
export const cellsBefore = (cell: number) => Math.ceil(FAR / cell);
