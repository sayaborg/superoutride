/**
 * OUTRUN's road across ([OUTRUN road data](../../../docs/outrun-road-data.md#cross-section)): one road's lines and
 * edges as the road ROM draws them (`two-roads` draws two together and lays the lanes driven over two of them). Every amount
 * is in road units, across from the roads' middle, positive right.
 */
import { instruction } from '../sega-16/program-words.js';
import type { RomSet } from '../shared/rom-set.js';
import { checkRoadPicture, lanesOverTwoRoads } from '../out-run-hardware/two-roads.js';
import { OUTRUN_ROAD_ROM } from './outrun-rom.js';
import { OUTRUN_ROAD, CENTRE_LINE } from './outrun-constants.js';

/** The road width at the game's start, units: `move.w #$1C2, $260314` at 0x8402 and 0xB4E4, checked alike. */
export function readStartWidth(main: Uint8Array): number {
  const [width] = instruction(main, 0x8402, [0x33fc, null, 0x0026, 0x0314], "the start's width (move.w #$1C2)");
  instruction(main, 0xb4e4, [0x33fc, width!, 0x0026, 0x0314], "the start's width again (move.w #$1C2)");
  return width!;
}

/**
 * The lanes driven over two roads (`lanesOverTwoRoads`): the lane lines' middle 212/3, every lane 424/3 units (3.6 m)
 * where the roads keep their lanes, the outer lanes to the outer lines' middle at 212, the median from 250, where the
 * ground shows, its rule's widths 212/3, 250 and 288.
 */
const LANES = lanesOverTwoRoads(OUTRUN_ROAD);
export const { lanes: drivenLanes, centreLaneAt, breaks: LANE_RULE_WIDTHS, inside: CENTRE_INSIDE } = LANES;
/** A lane: the original's lane spacing, the road ROM's lines' (`opr-10185`), 424/3 units (3.6 m). */
export const LANE = LANES.outer;

/** Check the road's picture against the road ROM's nearest line (`checkRoadPicture`), but on the centre line. */
export const checkRoadRom = (set: RomSet) =>
  checkRoadPicture(set.data(OUTRUN_ROAD_ROM), OUTRUN_ROAD_ROM.name, OUTRUN_ROAD, CENTRE_LINE);
