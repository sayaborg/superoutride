/**
 * TURBO OUTRUN's road across ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md#turbo-outruns-courses)): one road's
 * lines and edge bands as its road ROM draws them (`two-roads` draws two together), and the lanes driven over two of
 * them. Every amount is in road units, across from the roads' middle (P), positive right.
 */
import { checkRoadPicture, lanesOverTwoRoads, ROAD_HALF, type RoadPicture } from '../out-run-hardware/two-roads.js';
import { TURBO_OUTRUN_ROAD_ROMS } from './turbo-outrun-rom.js';
import type { RomSet } from '../shared/rom-set.js';

/**
 * One road's lines and edge bands across from its centre, as the road ROM's nearest line (row 255, 1 px a unit, its
 * centre between pixels 251 and 252) draws them, each side alike: the lane lines from 66 to 79 (pixel value 1), the edge
 * band's inner part from 214 to 223 (2), its middle to 246 in the lines' color (1) and its outer part to 250 (2); the
 * surface (0) between, with neither a centre line nor outer lines. Each edge with the paint to its right.
 */
export const TURBO_OUTRUN_ROAD: RoadPicture = [
  { at: -ROAD_HALF, right: 'edge' },
  { at: -246, right: 'line' },
  { at: -223, right: 'edge' },
  { at: -214, right: 'surface' },
  { at: -79, right: 'line' },
  { at: -66, right: 'surface' },
  { at: 66, right: 'line' },
  { at: 79, right: 'surface' },
  { at: 214, right: 'edge' },
  { at: 223, right: 'line' },
  { at: 246, right: 'edge' },
  { at: ROAD_HALF, right: 'outside' },
];

/**
 * The lanes driven over two roads (`lanesOverTwoRoads`): the lane lines' middle 72.5, the outer lanes 141.5 units
 * (3.604 m) to the edge band at 214, b and e 145 (3.693 m), the median from 250, where the ground shows, its rule's
 * widths 72.5, 250 and 286. The width 218, most of the course's, is six lanes with the inner edge bands' 8-unit line
 * between c and d.
 */
const LANES = lanesOverTwoRoads(TURBO_OUTRUN_ROAD);
export const { lanes: drivenLanes, centreLaneAt, breaks: LANE_RULE_WIDTHS, inside: CENTRE_INSIDE } = LANES;

/** Check the road's picture against the road ROM's nearest line (`checkRoadPicture`). */
export const checkTurboOutrunRoadRom = (set: RomSet) =>
  checkRoadPicture(set.data(TURBO_OUTRUN_ROAD_ROMS[0]), TURBO_OUTRUN_ROAD_ROMS[0].name, TURBO_OUTRUN_ROAD);
