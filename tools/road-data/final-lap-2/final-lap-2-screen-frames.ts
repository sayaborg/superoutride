/**
 * FINAL LAP 2's screen for the grades' rule ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#its-heights)):
 * the slave's road lines laid by a course's slope table, frame by frame round its lap, its cells and its stretch.
 */
import { instruction } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { closedCellPositions, type PieceFrames } from '../shared/screen-frames.js';
import { piecesDigest } from '../shared/screen-pieces.js';
import { GAME_CAMERA, originalRowsARow, type ReadingCamera } from '../shared/screen-measure.js';
import { SCREEN_ROWS } from '../namco-system-2/display.js';
import { ROAD_LINE_OFFSET } from '../namco-system-2/road.js';
import type { FinalLap2 } from './final-lap-2-rom.js';
import { INTERVAL_UNITS, INTERVALS, LAP_UNITS } from './final-lap-2-road.js';

/** The slave's road lines' projection, as its 0x1608 lays them. */
export interface Projection {
  /** The nearest line's depth, and the depth past which no line lies. */
  readonly first: number;
  readonly last: number;
  /** A line's distance ahead of the position: `numerator` over its depth, less `offset`, units. */
  readonly numerator: number;
  readonly offset: number;
  /** A line's depth falls by `step` over `middle` plus its slope halved. */
  readonly step: number;
  readonly middle: number;
  /** The screen row line 0 would lie on: line n lies on row `row0` − n. */
  readonly row0: number;
}

/**
 * The projection from the programs: the slave's 0x1608 sets a depth of 0x6470 and, while it is above 0x1F4 (its
 * 0x16D4), lays a line at 0x87C2C0 over it less 0x15A units ahead (its 0x1666), then lowers it by 0x4900 over 0x80 plus
 * half the slope at the line's interval (its 0x168E to 0x16AA); its lines' list ends at 0x101780 (its 0x1616), and its
 * 0x21A8 copies line n to the road's line memory's word (0x37E − 2n − 0x112) / 2, which the C45 shows on screen row that
 * less `ROAD_LINE_OFFSET`.
 */
export function readProjection(p: FinalLap2): Projection {
  const [end] = instruction(p.slave, 0x1616, [0x43f9, 0x0010, null], "the road lines' list");
  const [high, low] = instruction(p.slave, 0x1622, [0x267c, null, null], 'the road lines');
  const [first] = instruction(p.slave, 0x1650, [0x343c, null], "the nearest line's depth");
  const [offset] = instruction(p.slave, 0x1666, [0x200b, 0x80c2, 0x0440, null, 0x3300], "a line's distance");
  instruction(p.slave, 0x168e, [0x48c0, 0xd083, 0xe488, 0xec48, 0x1234, 0x0000], "a line's slope");
  const [middle, stepHigh, stepLow] = instruction(
    p.slave,
    0x169a,
    [0x4881, 0xe241, 0x0641, null, 0x2e3c, null, null, 0x8fc1, 0x9447],
    "a line's depth's step",
  );
  const [last] = instruction(p.slave, 0x16d4, [0x0c42, null, 0x6e8c], 'the farthest line');
  const [less] = instruction(p.slave, 0x21a8, [0x0240, 0x03fe, 0x3200, 0x0441, null], "the road's line memory");
  return {
    first: first!,
    last: last!,
    numerator: (high! << 16) | low!,
    offset: offset!,
    step: (stepHigh! << 16) | stepLow!,
    middle: middle!,
    row0: (((end! - 2) & 0x3fe) - less!) / 2 - ROAD_LINE_OFFSET,
  };
}

/** The lines the slave lays at position `position` (units, at least 0), by a course's `slopes`: each one's distance. */
export function screenLines(projection: Projection, slopes: readonly number[], position: number): number[] {
  const { first, last, numerator, offset, step, middle } = projection;
  const distances: number[] = [];
  for (let depth = first; ;) {
    const distance = Math.floor(numerator / depth) - offset;
    if (distance > 0xffff) throw romDiffers("A road line's distance overflows its word");
    distances.push(distance);
    const slope = slopes[((distance + position) >>> 8) & (INTERVALS - 1)]!;
    depth -= Math.trunc(step / ((slope >> 1) + middle));
    if (!(depth > last)) return distances;
  }
}

/** What a lap's piece is solved from, as a SHA-256: the projection, the course's slope table and a unit's metres. */
export const finalLap2Inputs = (projection: Projection, slopes: readonly number[], metres: number) =>
  piecesDigest({ projection, slopes, metres });

/** A frame a slope table's interval, the position's unit at which its lines' slopes change. */
const FRAME_UNITS = INTERVAL_UNITS;
/** The laps read: the middle one's frames counted, the road repeating by the lap. */
const LAPS_READ = 3;

/**
 * A course's lap as a piece: its frames each `FRAME_UNITS` of the position round its second lap of three alike, each its
 * visible lines (rows 0 to `SCREEN_ROWS`) at their distances from its pinhole, `offset` units behind the position;
 * against the level road, the screen its lap's mean slope would lay, its row at each line's distance; its cells the
 * lap's divisor nearest `CELL_METRES` (`closedCellPositions`); closed. Its lines' depths fall evenly on a level road, so
 * it draws through a level camera, the road passing its level road's height at the position: it is read through a level
 * camera at this game's focal length, its eye where its level road puts it above the road at the position, at its
 * pinhole.
 */
export function finalLap2LapFrames(projection: Projection, slopes: readonly number[], metres: number): PieceFrames {
  const { first, numerator, offset, step, middle, row0 } = projection;
  const cellPositions = closedCellPositions(metres, LAP_UNITS);
  const mean = slopes.reduce((s, v) => s + v, 0) / slopes.length;
  const levelStep = step / (middle + mean / 2);
  const level = (d: number) => row0 - (first - numerator / (d + offset)) / levelStep;
  const focal = GAME_CAMERA.focal;
  const camera: ReadingCamera = {
    focal,
    eye: ((numerator / levelStep) * metres) / (focal * originalRowsARow(SCREEN_ROWS)),
    behind: offset * metres,
    tilts: false,
  };
  const frames = Array.from({ length: LAP_UNITS / FRAME_UNITS }, (_, k) => {
    const position = LAP_UNITS + k * FRAME_UNITS;
    const lines = screenLines(projection, slopes, position)
      .map((distance, n) => ({ distance, row: row0 - n }))
      .filter((l) => l.row >= 0 && l.row < SCREEN_ROWS);
    return {
      camera: position * metres - camera.behind,
      rows: Float64Array.from(lines, (l) => l.row),
      distances: Float64Array.from(lines, (l) => (l.distance + offset) * metres),
      level: Float64Array.from(lines, (l) => level(l.distance)),
    };
  });
  return {
    frames: {
      cameras: Float64Array.from(frames, (f) => f.camera),
      rows: frames.map((f) => f.rows),
      lineDistances: frames.map((f) => f.distances),
      levelRows: frames.map((f) => f.level),
      screenRows: SCREEN_ROWS,
    },
    camera,
    cell: cellPositions * metres,
    cellPositions,
    a: 0,
    b: LAP_UNITS / cellPositions,
    repeats: LAPS_READ,
    closed: true,
  };
}
