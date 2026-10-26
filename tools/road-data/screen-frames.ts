/**
 * The grades' rule's pieces and their frames ([Original road data](../../docs/original-road-data.md#profile-from-the-originals-screen),
 * Pieces): OUTRUN's and TURBO OUTRUN's height table run alone on the level road, ENDURO RACER's normal path's cycle and
 * each hill's cycles; each its original's screen frame by frame, its cells and its stretch.
 */
import { positionMetres, type BoardClock } from './board-clock.js';
import { STAGE_POSITIONS } from './enduro-racer-road.js';
import {
  CYCLE,
  hillWords,
  inStage3,
  LEVEL_WORDS,
  levelReach,
  LINE_DISTANCES,
  lineRows as enduroRows,
  normalWords,
  READING_CAMERA,
  screensAlong,
  STAGE_3,
  type EnduroRacerScreen,
} from './enduro-racer-screen.js';
import { LEVEL_HORIZON, lineDistance, lineRows, SLOPE_LIMIT, tableRuns, windowsAlong } from './hills.js';
import type { HeightTable } from './road-tables.js';
import { FAR, GAME_CAMERA, ORIGINAL_ROWS_A_ROW, type ReadingCamera, type ScreenFrames } from './screen-measure.js';

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
const cellsBefore = (cell: number) => Math.ceil(FAR / cell);

/** The table's start on its own level road: its piece's frames begin `cellsBefore` cells before it. */
export function outrunFrames(table: HeightTable, number: number, kmh: number, clock: BoardClock): PieceFrames {
  const metres = positionMetres(clock);
  const cellPositions = cellPositionsOf(metres);
  const cell = cellPositions * metres;
  const before = cellsBefore(cell) * cellPositions;
  const start = before;
  const tables = new Map([[number, table]]);
  const points = [{ kind: 0, position: start, value: number, speed: 0 }];
  const [run] = tableRuns(points, tables, () => kmh, clock);
  const a = before / cellPositions,
    b = Math.ceil(run!.end / cellPositions - 1e-9);
  const positions = Array.from({ length: b * cellPositions + 1 }, (_, p) => p);
  const lines = clock.lines - 1;
  const rows = windowsAlong(points, tables, positions, () => kmh, clock).map((w) =>
    lineRows(clock.lines, w.base, w.increments, w.f, SLOPE_LIMIT).subarray(0, lines),
  );
  return {
    frames: {
      cameras: Float64Array.from(positions, (p) => p * metres),
      rows,
      lineDistances: Float64Array.from(
        { length: lines },
        (_, k) => lineDistance(k, clock.lines) * metres + GAME_CAMERA.behind,
      ),
      levelRows: lineRows(clock.lines, LEVEL_HORIZON, [], 0).subarray(0, lines),
    },
    camera: GAME_CAMERA,
    cell,
    cellPositions,
    a,
    b,
  };
}

/** ENDURO RACER's cell and position, metres. */
function enduroRacerCells(metres: number) {
  const cellPositions = cellPositionsOf(metres);
  const cell = cellPositions * metres;
  return { cellPositions, cell, before: cellsBefore(cell) * cellPositions };
}

/** ENDURO RACER's level camera at this game's focal length: its eye where its level road puts it, `READING_CAMERA` behind. */
function enduroRacerCamera(screen: EnduroRacerScreen, metres: number): ReadingCamera {
  const focal = GAME_CAMERA.focal;
  const eye = (levelReach(screen) * metres) / (focal * ORIGINAL_ROWS_A_ROW);
  return { focal, eye, behind: READING_CAMERA * metres, tilts: false };
}

function enduroRacerScreenFrames(
  screen: EnduroRacerScreen,
  words: readonly (Int16Array | null)[],
  metres: number,
  weights?: Float64Array,
): ScreenFrames {
  return {
    cameras: Float64Array.from(words, (_, p) => p * metres),
    rows: screensAlong(words, screen.top, screen.bottom),
    lineDistances: LINE_DISTANCES.map((d) => d * metres + READING_CAMERA * metres),
    levelRows: enduroRows(LEVEL_WORDS, screen.top, screen.bottom),
    ...(weights ? { weights } : {}),
  };
}

/** The cycles the normal path's piece is read over: the middle one's frames weighed, the road repeating by the cycle. */
const CYCLES_READ = 3;

/** ENDURO RACER's normal path's cycle: three cycles alike, the middle one's frames counted, then the level road. */
export function enduroRacerCycleFrames(screen: EnduroRacerScreen, metres: number): PieceFrames {
  const { cellPositions, cell, before } = enduroRacerCells(metres);
  const read = CYCLES_READ * CYCLE;
  const words = Array.from({ length: read + before }, (_, p) => (p < read ? normalWords(screen.slopes, p) : null));
  const weights = Float64Array.from(words, (_, p) => (p >= CYCLE && p < 2 * CYCLE ? 1 : 0));
  const cells = CYCLE / cellPositions;
  return {
    frames: enduroRacerScreenFrames(screen, words, metres, weights),
    camera: enduroRacerCamera(screen, metres),
    cell,
    cellPositions,
    a: 0,
    b: cells,
    repeats: CYCLES_READ,
  };
}

/**
 * An ENDURO RACER hill's cycles: from the last cycle start at or before its start to the first at or after its end (the
 * position after its phase 4), or to stage 3's start where that comes first; its words while it runs, the normal path's
 * elsewhere within, level outside; its frames from `cellsBefore` cells before.
 */
export function enduroRacerHillFrames(screen: EnduroRacerScreen, hill: number, metres: number): PieceFrames {
  const { cellPositions, cell, before } = enduroRacerCells(metres);
  const entry = screen.hills[hill - 1]!;
  const { words: own, end } = hillWords(entry);
  const c0 = Math.floor(entry.start / CYCLE) * CYCLE;
  const stage3 = STAGE_3 * STAGE_POSITIONS;
  const c1 = Math.min(Math.ceil(end / CYCLE) * CYCLE, entry.start < stage3 ? stage3 : Infinity);
  const words = Array.from({ length: c1 + 1 - (c0 - before) }, (_, i) => {
    const p = c0 - before + i;
    if (p < c0 || p >= c1) return null;
    if (inStage3(p)) return Int16Array.from(screen.stage3);
    if (p >= entry.start && p < end) return own[p - entry.start]!;
    return normalWords(screen.slopes, p);
  });
  return {
    frames: enduroRacerScreenFrames(screen, words, metres),
    camera: enduroRacerCamera(screen, metres),
    cell,
    cellPositions,
    a: before / cellPositions,
    b: (before + c1 - c0) / cellPositions,
  };
}
