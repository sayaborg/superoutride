/**
 * The grades' rule's pieces' frames for ENDURO RACER ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen),
 * Pieces): its normal path's cycle and each hill's cycles, its screen frame by frame, its cells and its stretch, and what
 * its pieces are solved from.
 */
import { STAGE_POSITIONS } from './enduro-racer-road.js';
import {
  CYCLE,
  hillWords,
  inStage3,
  LEVEL_WORDS,
  lineRows as enduroRows,
  normalWords,
  screensAlong,
  STAGE_3,
  type EnduroRacerScreen,
} from './enduro-racer-screen.js';
import { cellPositionsOf, cellsBefore, type PieceFrames } from '../shared/screen-frames.js';
import { piecesDigest } from '../shared/screen-pieces.js';
import { GAME_CAMERA, originalRowsARow, type ReadingCamera, type ScreenFrames } from '../shared/screen-measure.js';
import { SCREEN_ROWS } from '../sega-16/display.js';

/** What ENDURO RACER's pieces are solved from, as a SHA-256: its screen's tables and its metres a position. */
export const enduroRacerInputs = (screen: EnduroRacerScreen, positionMetres: number) =>
  piecesDigest({ screen, positionMetres });

/** ENDURO RACER's cell and position, metres. */
function enduroRacerCells(metres: number) {
  const cellPositions = cellPositionsOf(metres);
  const cell = cellPositions * metres;
  return { cellPositions, cell, before: cellsBefore(cell) * cellPositions };
}

/** ENDURO RACER's level camera at this game's focal length: its eye where its level road puts it, `behind` the bike. */
function enduroRacerCamera(screen: EnduroRacerScreen, metres: number): ReadingCamera {
  const focal = GAME_CAMERA.focal;
  const eye = (screen.reach * metres) / (focal * originalRowsARow(SCREEN_ROWS));
  return { focal, eye, behind: screen.behind * metres, tilts: false };
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
    lineDistances: Float64Array.from(screen.lineDistances, (d) => (d + screen.behind) * metres),
    levelRows: enduroRows(LEVEL_WORDS, screen.top, screen.bottom),
    screenRows: SCREEN_ROWS,
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
