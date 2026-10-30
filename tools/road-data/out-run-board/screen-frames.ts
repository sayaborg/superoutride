/**
 * The grades' rule's pieces' frames on the Out Run board ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen),
 * Pieces): OUTRUN's and TURBO OUTRUN's height table run alone on the level road, its screen frame by frame, its cells and
 * its stretch.
 */
import { positionMetres, type BoardClock } from './clock.js';
import { driveTable, levelWords } from './height-procedure.js';
import { rowsOf } from './hills.js';
import type { HeightTable } from './road-tables.js';
import { cellPositionsOf, cellsBefore, type PieceFrames } from '../shared/screen-frames.js';
import { GAME_CAMERA } from '../shared/screen-measure.js';
import { SCREEN_ROWS } from '../sega-16/display.js';

/**
 * A table run alone on the level road from its point, `cellsBefore` cells after the frames' first: its frames each
 * whole position, the road's rows the procedure's (`driveTable`), its lines at `distances` (`readLineDistances`), its
 * stretch to the first cell border at or past its end.
 */
export function outrunFrames(
  tables: (n: number) => HeightTable,
  number: number,
  kmh: number,
  clock: BoardClock,
  distances: Float64Array,
): PieceFrames {
  const metres = positionMetres(clock);
  const cellPositions = cellPositionsOf(metres);
  const cell = cellPositions * metres;
  const start = cellsBefore(cell) * cellPositions;
  const { level: base, bottomRow } = clock.heights;
  const { end } = driveTable(number, tables, clock, () => kmh, base);
  const a = start / cellPositions,
    b = Math.ceil((start + end) / cellPositions - 1e-9);
  const positions = Array.from({ length: b * cellPositions + 1 }, (_, p) => p);
  const { windows } = driveTable(
    number,
    tables,
    clock,
    () => kmh,
    base,
    positions.filter((p) => p >= start).map((p) => p - start),
  );
  const lines = clock.lines - 1;
  const level = rowsOf(levelWords(base), bottomRow).subarray(0, lines);
  const rows = [
    ...positions.filter((p) => p < start).map(() => level),
    ...windows.map((w) => rowsOf(w, bottomRow).subarray(0, lines)),
  ];
  return {
    frames: {
      cameras: Float64Array.from(positions, (p) => p * metres),
      rows,
      lineDistances: distances.map((d) => d * metres + GAME_CAMERA.behind),
      levelRows: level,
      screenRows: SCREEN_ROWS,
    },
    camera: GAME_CAMERA,
    cell,
    cellPositions,
    a,
    b,
  };
}
