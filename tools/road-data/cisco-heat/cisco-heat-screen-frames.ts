/**
 * CISCO HEAT's screen for the grades' rule ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-heights)):
 * a road's rows as its road CPU draws them frame by frame, each row of its depth table raised by the road's height ahead
 * of the car, pitched by its angle under the car, at the row's scale; its cells and its stretch.
 */
import { instruction, word } from '../cpu/program-words.js';
import { arcRoad, type ArcRoad } from '../jaleco/road-heights.js';
import { roadTables, type RoadNumber } from '../jaleco/road-tables.js';
import { cellPositionsOf, cellsBefore, type PieceFrames } from '../shared/screen-frames.js';
import type { ScreenFrames } from '../shared/screen-measure.js';
import { piecesDigest } from '../shared/screen-pieces.js';
import { STAGES } from './cisco-heat-backgrounds.js';
import { ciscoHeatCamera, depthPinhole, SCREEN_ROWS } from './cisco-heat-camera.js';
import { CISCO_HEAT_TABLES, stageGoal } from './cisco-heat-road.js';

/** The screen row its nearest road row lies on: its last. */
const NEAREST_ROW = SCREEN_ROWS - 1;
/** A unit of its pitch's sine and cosine and of a row's scale: 16,384 a whole. */
const UNIT = 0x4000;
/** A frame each this many positions of the car: about a metre. */
const FRAME_POSITIONS = 64;

/** What its road CPUs draw a road's rows by: each row's depth ahead of the car, positions, and its scale. */
export interface CiscoHeatScreen {
  readonly depths: readonly number[];
  readonly scales: readonly number[];
  /** The first road CPU's program, which its reading camera is read from. */
  readonly road1: Uint8Array;
}

/**
 * Its rows (R1 0x19F0 to 0x1B24): 91 rows up from the nearest (the `moveq` at 0x19F6), their depths from R1 0x3234
 * (the `lea` at 0x19F0, a word a row) and each row's scale 0xB8 bytes on (the `muls.w` at 0x216A).
 */
export function readCiscoHeatScreen(road1: Uint8Array): CiscoHeatScreen {
  const [, table] = instruction(road1, 0x19f0, [0x47f9, null, null], "the rows' depths (lea.l)");
  instruction(road1, 0x19f6, [0x7e5a], 'its 91 rows (moveq)');
  instruction(road1, 0x2136, [0xc3f9, 0x000c, 0x0052], "the height by the pitch's cosine (muls.w)");
  instruction(road1, 0x2142, [0xc5f9, 0x000c, 0x0050], "the run by the pitch's sine (muls.w)");
  const [scaleAt] = instruction(road1, 0x216a, [0xc5eb, null], "the row's scale (muls.w)");
  const rows = 91;
  return Object.freeze({
    depths: Object.freeze(Array.from({ length: rows }, (_, k) => word(road1, table + 2 * k))),
    scales: Object.freeze(Array.from({ length: rows }, (_, k) => word(road1, table + scaleAt + 2 * k))),
    road1,
  });
}

/**
 * The rows of `road`'s lines with the car at position `p`, from the top of its screen (R1 0x2120 to 0x2174): the row
 * k + 1 up from the nearest at depth z, the road's point there taken from its point under the car, its height by the
 * pitch's cosine less its run by its sine (the pitch the road's angle under the car), times the row's scale, rows up
 * from that row, to whole rows as the program shifts them.
 */
export function rowsAt(screen: CiscoHeatScreen, road: ArcRoad, p: number): Float64Array {
  const pitch = road.angle(p);
  const [cos, sin] = [Math.round(Math.cos(pitch) * UNIT), Math.round(Math.sin(pitch) * UNIT)];
  const [run, height] = [road.run(p), road.height(p)];
  return Float64Array.from(screen.depths, (z, k) => {
    const [dh, dx] = [Math.round(road.height(p + z) - height), Math.round(road.run(p + z) - run)];
    const up = Math.floor((Math.floor((dh * cos - dx * sin) / UNIT) * screen.scales[k]!) / UNIT);
    return NEAREST_ROW - (k + 1) - up;
  });
}

/**
 * What a stage's road's piece is solved from, as its digest: its depths and scales, a position's metres, its end, and
 * the road's height, run and angle at every frame and row.
 */
export function ciscoHeatInputs(screen: CiscoHeatScreen, road: ArcRoad, end: number, metres: number): string {
  const values: string[] = [];
  for (let p = 0; p <= end + Math.max(...screen.depths); p += FRAME_POSITIONS)
    values.push([road.height(p), road.run(p), road.angle(p)].map((v) => v.toFixed(6)).join(' '));
  return piecesDigest({ depths: screen.depths, scales: screen.scales, metres, end, road: values });
}

/**
 * A stage's road as a piece, to `end` positions: its frames each `FRAME_POSITIONS` of the car from 0, the read road
 * beginning `cellsBefore` cells before its start, level there, its stretch from its start to `end`.
 */
export function ciscoHeatRoadFrames(screen: CiscoHeatScreen, road: ArcRoad, end: number, metres: number): PieceFrames {
  const cellPositions = cellPositionsOf(metres);
  const cell = cellPositions * metres;
  const before = cellsBefore(cell) * cellPositions;
  const camera = ciscoHeatCamera(screen.road1, metres);
  const { behind } = depthPinhole(screen.road1);
  const distances = screen.depths.map((z) => (z + behind) * metres);
  // Its level road: each row where its program draws it with the road level.
  const level = screen.depths.map((_, k) => NEAREST_ROW - (k + 1));
  const cars = Array.from({ length: Math.floor(end / FRAME_POSITIONS) + 1 }, (_, k) => k * FRAME_POSITIONS);
  // Each frame's lines on its screen, near to far.
  const shown = cars.map((p) => {
    const rows = rowsAt(screen, road, p);
    return rows.reduce<number[]>((on, r, k) => (r >= 0 && r < SCREEN_ROWS ? [...on, k] : on), []);
  });
  const frames: ScreenFrames = {
    cameras: Float64Array.from(cars, (p) => (before + p) * metres - camera.behind),
    rows: cars.map((p, f) => {
      const rows = rowsAt(screen, road, p);
      return Float64Array.from(shown[f]!, (k) => rows[k]!);
    }),
    lineDistances: shown.map((ks) => Float64Array.from(ks, (k) => distances[k]!)),
    levelRows: shown.map((ks) => Float64Array.from(ks, (k) => level[k]!)),
    screenRows: SCREEN_ROWS,
  };
  return {
    frames,
    camera,
    cell,
    cellPositions,
    a: before / cellPositions,
    b: Math.ceil((before + end) / cellPositions),
  };
}

/** How far a stage's road runs past its goal at most, positions: the camera's distance behind the car, as the finish needs. */
export const RUN_OUT = 2000;

/**
 * A stage's end, as BIG RUN's: its goal, and on to the first record of either road past it (`cpus`, its road CPUs'
 * programs), at most `RUN_OUT` positions.
 */
export function stageEnd(main: Uint8Array, cpus: readonly [Uint8Array, Uint8Array], stage: number): number {
  const goal = stageGoal(main, stage);
  const after = ([1, 2] as const).flatMap((road) => {
    const t = roadTables(cpus[road - 1]!, CISCO_HEAT_TABLES, road, stage, goal + RUN_OUT);
    return [...t.plan, ...t.profile].map((r) => r.start).filter((s) => s > goal);
  });
  return Math.min(goal + RUN_OUT, ...after);
}

/** A stage's road as its piece reads it: its name, its end and its 3D road. */
export interface CiscoHeatStageRoad {
  readonly piece: string;
  readonly stage: number;
  readonly road: RoadNumber;
  readonly end: number;
  readonly arcs: ArcRoad;
}

/**
 * Each stage's two roads as their pieces read them, `STAGE n road r`: each to its end (`stageEnd`), its 3D road
 * (`arcRoad`) from its road CPU's tables (`cpus`, the first's and the second's) as far as its farthest row sees.
 */
export function ciscoHeatStageRoads(main: Uint8Array, cpus: readonly [Uint8Array, Uint8Array]): CiscoHeatStageRoad[] {
  const screen = readCiscoHeatScreen(cpus[0]);
  const sight = Math.max(...screen.depths);
  return Array.from({ length: STAGES }, (_, stage) => {
    const end = stageEnd(main, cpus, stage);
    return ([1, 2] as const).map((road) => {
      const { profile } = roadTables(cpus[road - 1]!, CISCO_HEAT_TABLES, road, stage, end + sight);
      return {
        piece: `STAGE ${stage + 1} road ${road}`,
        stage,
        road,
        end,
        arcs: arcRoad(CISCO_HEAT_TABLES, profile, end + sight),
      };
    });
  }).flat();
}
