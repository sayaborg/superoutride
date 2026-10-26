/**
 * TURBO OUTRUN's road across ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-courses)): one road's
 * lines and edge bands as its road ROM draws them (`two-roads` draws two together), and the lanes driven over two of
 * them. Every amount is in road units, across from the roads' middle (P), positive right.
 */
import { ROAD_LINE_PIXELS, roadLine } from './rom-images.js';
import { requireInput } from '../course/authoring-io.js';
import { paintAt, type Paint, type RoadPicture } from './two-roads.js';
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

/** The outer lanes a and f, to the edge band from the lane line's middle: 141.5 units (3.604 m). */
export const OUTER_LANE = 214 - 72.5;
/** Lanes b and e, between the lane lines' middles: 145 units (3.693 m). */
export const INNER_LANE = 2 * 72.5;
/** A road's centre lies this far inside its outer lane's outer edge. */
export const CENTRE_INSIDE = 214;

/**
 * The lanes driven at road width `w` (road 0's centre at −w, road 1's at +w), units: a, b, c | median | d, e, f, each
 * road's outer lane always 141.5 and the roads' outer edges at ∓(w + 214), so b's centre is road 0's wherever both its
 * lane lines show.
 * - w ≤ 72.5: c = d = 0, b = e = w + 72.5 (b and e share the lane between the roads' outer lines);
 * - 72.5 ≤ w ≤ 250: b = e = 145, c = d = w − 72.5, no median (c and d meet at P);
 * - 250 ≤ w ≤ 286: c = d = 427.5 − w, the median 4(w − 250), from where the ground shows between the roads;
 * - w ≥ 286: c = d = 141.5, the median 2(w − 214), the edge bands and the ground between.
 * The width 218, most of the course's, is six lanes with the inner edge bands' 8-unit line between c and d.
 */
export function drivenLanes(w: number) {
  if (w <= 72.5) return { a: OUTER_LANE, b: w + 72.5, c: 0, m: 0, d: 0, e: w + 72.5, f: OUTER_LANE };
  const outer = { a: OUTER_LANE, b: INNER_LANE, e: INNER_LANE, f: OUTER_LANE };
  if (w <= ROAD_HALF) return { ...outer, c: w - 72.5, m: 0, d: w - 72.5 };
  if (w <= 286) return { ...outer, c: 427.5 - w, m: 4 * (w - ROAD_HALF), d: 427.5 - w };
  return { ...outer, c: OUTER_LANE, m: 2 * (w - CENTRE_INSIDE), d: OUTER_LANE };
}

/** The centre of lane b at road width `w`, units from P (negative: left). */
export const centreLaneAt = (w: number) => (w >= 72.5 ? -w : -(w + 72.5) / 2);

/** Road widths at which the lanes' rule changes. */
export const LANE_RULE_WIDTHS: readonly number[] = [72.5, ROAD_HALF, 286];

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
