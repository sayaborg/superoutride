/**
 * OUTRUN's road across ([OUTRUN road data](../../docs/outrun-road-data.md#cross-section)): one road's lines and
 * edges as the road ROM draws them (`two-roads` draws two together and lays the lanes driven over two of them). Every amount
 * is in road units, across from the roads' middle, positive right.
 */
import { UNIT_METRES } from './pixel-grid.js';
import type { RomSet } from './rom-set.js';
import { checkRoadPicture, lanesOverTwoRoads, type RoadPicture } from './two-roads.js';
import { OUTRUN_ROAD_ROM } from './outrun-rom.js';

/** A road's surface reaches this far from its centre, its edge bands included: its asphalt. */
export const ROAD_HALF = 250;
/** The road width at which two roads touch as one road of six equal lanes. */
export const TOUCHING = 212;
/** The road width at the game's start, units. */
export const START_WIDTH = 0x1c2;

export { UNIT_METRES };

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

/**
 * The lanes driven over two roads (`lanesOverTwoRoads`): the lane lines' middle 212/3, every lane 424/3 units (3.6 m)
 * where the roads keep their lanes, the outer lanes to the outer lines' middle at 212, the median from 250, where the
 * ground shows, its rule's widths 212/3, 250 and 288.
 */
const LANES = lanesOverTwoRoads(OUTRUN_ROAD);
export const { lanes: drivenLanes, centreLaneAt, breaks: LANE_RULE_WIDTHS, inside: CENTRE_INSIDE } = LANES;
/** A lane: the original's lane spacing, the road ROM's lines' (`opr-10185`), 424/3 units (3.6 m). */
export const LANE = LANES.outer;

/** The centre line's half width: the road ROM draws it, the surface's color on every stage, and the picture does not. */
const CENTRE_LINE = 4;

/** Check the road's picture against the road ROM's nearest line (`checkRoadPicture`), but on the centre line. */
export const checkRoadRom = (set: RomSet) =>
  checkRoadPicture(set.data(OUTRUN_ROAD_ROM), OUTRUN_ROAD_ROM.name, OUTRUN_ROAD, CENTRE_LINE);
