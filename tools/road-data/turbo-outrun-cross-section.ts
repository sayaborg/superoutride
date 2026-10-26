/**
 * TURBO OUTRUN's road across ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-courses)): one road's
 * lines and edge bands as its road ROM draws them (`two-roads` draws two together), and the lanes driven over two of
 * them. Every amount is in road units, across from the roads' middle (P), positive right.
 */
import { ROAD_LINE_PIXELS, roadLine } from './rom-images.js';
import { requireInput } from '../course/authoring-io.js';
import { lanesOverTwoRoads, paintAt, type Paint, type RoadPicture } from './two-roads.js';
import { TURBO_OUTRUN_ROAD_ROMS } from './turbo-outrun-rom.js';
import type { RomSet } from './rom-set.js';

/** A road's surface reaches this far from its centre, its edge bands included: its asphalt. */
export const ROAD_HALF = 250;

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

/** The nearest line of the road ROM, 1 pixel a unit, and the pixel edge its centre falls on. */
const NEAREST = 255;
const CENTRE = 252;
/** The road ROM's pixel values: the surface, a line's color, an edge band's, beyond the road. */
const ROM_PAINT: readonly Paint[] = ['surface', 'line', 'edge', 'outside'];

/**
 * Check one road's picture against the road ROM's nearest line: each pixel's value (`roadLine`) is what `paintAt`
 * gives at its centre, but within a unit of an edge. Throws where they disagree.
 */
export function checkTurboOutrunRoadRom(set: RomSet) {
  const rom = TURBO_OUTRUN_ROAD_ROMS[0];
  const { name } = rom;
  const data = set.data(rom);
  const line = roadLine(data, NEAREST);
  for (let x = 0; x < ROAD_LINE_PIXELS; x++) {
    const d = x + 0.5 - CENTRE;
    if (TURBO_OUTRUN_ROAD.some((e) => Math.abs(d - e.at) < 1)) continue;
    const rom = ROM_PAINT[line[x]!]!;
    const drawn = paintAt(TURBO_OUTRUN_ROAD, d);
    requireInput(
      rom === drawn,
      `/rom/${name}`,
      `The road ROM draws ${rom} at ${d} units from its centre, not ${drawn}`,
    );
  }
}
