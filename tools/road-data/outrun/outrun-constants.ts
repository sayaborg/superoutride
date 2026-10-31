/**
 * OUTRUN's own constants and fixed rules, each with its reason
 * ([OUTRUN road data](../../../docs/outrun-road-data.md#outruns-constants)): the conversion's choices. What the ROMs hold is
 * read where it is used.
 */
import { ROAD_HALF } from '../out-run-hardware/constants.js';
import type { RoadPicture } from '../out-run-hardware/two-roads.js';

/** Where a last stage entered from a fork's left side turns its centre lane back to b for its goal, positions. */
export const GOAL_CENTRE = 1946;

/** The stages by number: their names on the original's map and their Sections' names. */
export const OUTRUN_NAMES: ReadonlyMap<number, string> = new Map([
  [0x3c, 'COCONUT BEACH'],
  [0x1e, "DEVIL'S CANYON"],
  [0x3b, 'GATEWAY'],
  [0x20, 'CLOUDY MOUNTAIN'],
  [0x2f, 'ALPS'],
  [0x2a, 'DESERT'],
  [0x2d, 'SEASIDE TOWN'],
  [0x35, 'WHEAT FIELD'],
  [0x33, 'OLD CAPITAL'],
  [0x21, 'WILDERNESS'],
  [0x32, 'LAKESIDE'],
  [0x23, 'AUTOBAHN'],
  [0x38, 'DESOLATION HILL'],
  [0x22, 'DEATH VALLEY'],
  [0x26, 'VINEYARD'],
]);

/** One of OUTRUN's roads: its course id, where it starts and the side each fork takes. */
export interface OutrunRoute {
  readonly id: string;
  /**
   * A SHORT road's start (K, 2026-10-24): on the road from beyond the map into the third row's top stage, DESERT (L), or
   * its bottom one, CLOUDY MOUNTAIN (R); none, COCONUT BEACH's GO.
   */
  readonly start?: 'L' | 'R';
  /** Each fork's side, left (L) or right (R), in order. */
  readonly forks: string;
}
/** The six LONG roads and six SHORT ones to the goals, each by its start and its forks' sides (K, 2026-10-24). */
export const OUTRUN_ROUTES: readonly OutrunRoute[] = Object.freeze([
  { id: 'outrun-a', forks: 'LLLL' },
  { id: 'outrun-b', forks: 'LRLL' },
  { id: 'outrun-c-left', forks: 'LRRL' },
  { id: 'outrun-c-right', forks: 'RLLR' },
  { id: 'outrun-d', forks: 'RLRR' },
  { id: 'outrun-e', forks: 'RRRR' },
  { id: 'outrun-short-a', start: 'L', forks: 'LL' },
  { id: 'outrun-short-b', start: 'L', forks: 'LR' },
  { id: 'outrun-short-c-left', start: 'L', forks: 'RR' },
  { id: 'outrun-short-c-right', start: 'R', forks: 'LL' },
  { id: 'outrun-short-d', start: 'R', forks: 'RL' },
  { id: 'outrun-short-e', start: 'R', forks: 'RR' },
]);
/** The map's row a SHORT road starts in, the third: its top stage is column 0, its bottom one column 2. */
export const SHORT_ROW = 2;

/**
 * One road's lines and edge bands across from its centre, as the road ROM's nearest line (row 255 of `opr-10185`, 1 px
 * a unit, its centre at 252) draws them, each side alike: the inner lines 8 wide about 212/3 (pixel value 1), the outer
 * lines from 206 to 218 (1) and the edge band from 228 to 250 (2); between them the surface (0), the shoulder from 218
 * to 228 among it. The centre line, 8 wide at 0, is the surface's color on every stage and is not drawn. Each edge with
 * the paint to its right.
 */
const INNER = [212 / 3 - 4, 212 / 3 + 4] as const;
export const OUTRUN_ROAD: RoadPicture = [
  { at: -ROAD_HALF, right: 'edge' },
  { at: -228, right: 'surface' },
  { at: -218, right: 'line' },
  { at: -206, right: 'surface' },
  { at: -INNER[1], right: 'line' },
  { at: -INNER[0], right: 'surface' },
  { at: INNER[0], right: 'line' },
  { at: INNER[1], right: 'surface' },
  { at: 206, right: 'line' },
  { at: 218, right: 'surface' },
  { at: 228, right: 'edge' },
  { at: ROAD_HALF, right: 'outside' },
];
/** The centre line's half width: the road ROM draws it, the surface's color on every stage, and the picture does not. */
export const CENTRE_LINE = 4;
/** The road's material: the ROMs hold none, so K's (2026-10-25). */
export const ROAD_MATERIAL = 'ASPHALT';
/** The ground's material beyond the road: the ROMs hold none, so K's (2026-10-25). */
export const GROUND_MATERIAL = 'SAND';
