/**
 * CISCO HEAT's screen for the grades' rule ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-heights)):
 * a road's rows as its road CPU draws them frame by frame, each row of its depth table raised by the road's height ahead
 * of the car, pitched by its angle under the car, at the row's scale; its cells and its stretch.
 */
import { instruction, word } from '../cpu/program-words.js';
import { arcRoad, type ArcRoad } from '../jaleco/road-heights.js';
import { roadTables, type RoadNumber } from '../jaleco/road-tables.js';
import { cellPositionsOf, cellsBefore, type PieceFrames } from '../shared/screen-frames.js';
import { FAR, type ScreenFrames } from '../shared/screen-measure.js';
import { HILL_ROWS } from '../shared/shared-constants.js';
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
/** The least run of the car, metres, over which its screen shows no hill, at whose ends a stage's road is cut: its sight. */
const LEVEL_RUN = FAR;

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
 * What a part of a stage's road's piece is solved from, as its digest: its depths and scales, a position's metres, the
 * car's stretch over it, and the road's height, run and angle every frame from it as far as its rows see.
 */
export function ciscoHeatInputs(
  screen: CiscoHeatScreen,
  road: ArcRoad,
  from: number,
  to: number,
  metres: number,
): string {
  const values: string[] = [];
  for (let p = from; p <= to + Math.max(...screen.depths); p += FRAME_POSITIONS)
    values.push([road.height(p), road.run(p), road.angle(p)].map((v) => v.toFixed(6)).join(' '));
  return piecesDigest({ depths: screen.depths, scales: screen.scales, metres, from, to, road: values });
}

/** Its rows' lines on its screen with the car at `p`, near to far: their rows and their rows' indices. */
function shownAt(screen: CiscoHeatScreen, road: ArcRoad, p: number) {
  const rows = rowsAt(screen, road, p);
  const lines = rows.reduce<number[]>((on, r, k) => (r >= 0 && r < SCREEN_ROWS ? [...on, k] : on), []);
  return { rows: Float64Array.from(lines, (k) => rows[k]!), lines };
}

/** Whether its screen shows a hill with the car at `p`: a line seen more than `HILL_ROWS` from its level road's row. */
const showsHill = (screen: CiscoHeatScreen, road: ArcRoad, p: number) => {
  const { rows, lines } = shownAt(screen, road, p);
  return lines.some((k, n) => Math.abs(rows[n]! - (NEAREST_ROW - (k + 1))) > HILL_ROWS);
};

/**
 * A part of a stage's road as a piece, the car from `from` to `to` positions: its frames each `FRAME_POSITIONS` of the
 * car, the read road beginning `cellsBefore` cells before the part, level there, its stretch the part.
 */
export function ciscoHeatRoadFrames(
  screen: CiscoHeatScreen,
  road: ArcRoad,
  from: number,
  to: number,
  metres: number,
): PieceFrames {
  const cellPositions = cellPositionsOf(metres);
  const cell = cellPositions * metres;
  const before = cellsBefore(cell) * cellPositions;
  const camera = ciscoHeatCamera(screen.road1, metres);
  const { behind } = depthPinhole(screen.road1);
  const distances = screen.depths.map((z) => (z + behind) * metres);
  // Its level road: each row where its program draws it with the road level.
  const level = screen.depths.map((_, k) => NEAREST_ROW - (k + 1));
  const cars = Array.from(
    { length: Math.floor((to - from) / FRAME_POSITIONS) + 1 },
    (_, k) => from + k * FRAME_POSITIONS,
  );
  const shown = cars.map((p) => shownAt(screen, road, p));
  const frames: ScreenFrames = {
    cameras: Float64Array.from(cars, (p) => (before + p - from) * metres - camera.behind),
    rows: shown.map((f) => f.rows),
    lineDistances: shown.map((f) => Float64Array.from(f.lines, (k) => distances[k]!)),
    levelRows: shown.map((f) => Float64Array.from(f.lines, (k) => level[k]!)),
    screenRows: SCREEN_ROWS,
  };
  return {
    frames,
    camera,
    cell,
    cellPositions,
    a: before / cellPositions,
    b: Math.ceil((before + to - from) / cellPositions),
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

/** A part of a stage's road as its piece reads it: its name, the car's stretch over it and its road's 3D road. */
export interface CiscoHeatStageRoad {
  readonly piece: string;
  readonly stage: number;
  readonly road: RoadNumber;
  readonly from: number;
  readonly to: number;
  readonly arcs: ArcRoad;
}

/**
 * A stage's road's parts to `end`: cut at both ends of each run of frames, at least `LEVEL_RUN` metres of the car, whose
 * screen shows no hill (`showsHill`), where the road ahead looks level as far as its rows see, so that the run is a
 * level part of its own and each part's grade is 0 at its ends.
 */
export function stageParts(screen: CiscoHeatScreen, road: ArcRoad, end: number, metres: number): number[] {
  const cuts: number[] = [];
  let level: number | null = null;
  for (let p = 0; p <= end; p += FRAME_POSITIONS) {
    const hill = showsHill(screen, road, p);
    if (!hill && level === null) level = p;
    if ((hill || p + FRAME_POSITIONS > end) && level !== null) {
      const last = hill ? p - FRAME_POSITIONS : p;
      if ((last - level) * metres >= LEVEL_RUN)
        cuts.push(...[level, last].filter((c) => c > FRAME_POSITIONS && c < end - FRAME_POSITIONS));
      level = null;
    }
  }
  return [0, ...cuts, end];
}

/**
 * Each stage's two roads' parts as their pieces read them, `STAGE n road r part k`: each road to its stage's end
 * (`stageEnd`), cut into parts (`stageParts`), its 3D road (`arcRoad`) from its road CPU's tables (`cpus`, the first's
 * and the second's) as far as its farthest row sees.
 */
export function ciscoHeatStageRoads(
  main: Uint8Array,
  cpus: readonly [Uint8Array, Uint8Array],
  metres: number,
): CiscoHeatStageRoad[] {
  const screen = readCiscoHeatScreen(cpus[0]);
  const sight = Math.max(...screen.depths);
  return Array.from({ length: STAGES }, (_, stage) => {
    const end = stageEnd(main, cpus, stage);
    return ([1, 2] as const).flatMap((road) => {
      const { profile } = roadTables(cpus[road - 1]!, CISCO_HEAT_TABLES, road, stage, end + sight);
      const arcs = arcRoad(CISCO_HEAT_TABLES, profile, end + sight);
      const cuts = stageParts(screen, arcs, end, metres);
      return cuts.slice(0, -1).map((from, k) => ({
        piece: `STAGE ${stage + 1} road ${road} part ${k + 1}`,
        stage,
        road,
        from,
        to: cuts[k + 1]!,
        arcs,
      }));
    });
  }).flat();
}
