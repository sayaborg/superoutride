/**
 * The Out Run hardware's nearest line of road, as [Two roads](../../../docs/original-road-data.md#two-roads) checks a
 * road's picture against it: its road ROM's row 255, 1 pixel a unit, its centre between pixels 251 and 252.
 */
import { ROAD_LINE_CENTRE, roadLine } from '../sega-16/rom-images.js';
import type { DrawnLine, Paint } from '../shared/two-roads.js';

/** The road ROM's nearest line. */
const NEAREST = 255;
/** The road ROM's pixel values: the surface, a line's color, an edge band's, beyond the road. */
const ROM_PAINT: readonly Paint[] = ['surface', 'line', 'edge', 'outside'];

/** The nearest line of the road ROM `rom`. */
export const nearestRoadLine = (rom: Uint8Array): DrawnLine => ({
  paints: roadLine(rom, NEAREST).map((v) => ROM_PAINT[v]!),
  centre: ROAD_LINE_CENTRE,
  unitsAPixel: 1,
});
