/**
 * ENDURO RACER's road across ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-course)): the edges of
 * its surface and edge bands in lateral units, as the road ROM draws them. Line L of the ROM is the road's left half,
 * its last column the road's centre; the sub CPU draws depth number d on line d + 1, on which an object's unit is
 * (d + 3) / 128 pixels, so an edge's units are 128 times the slope of its pixels against the line, fitted by least
 * squares over the lines drawn at every size.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { edgeSlope, ROAD_LINE_PIXELS, roadLine } from '../sega-16/rom-images.js';
import { FITTED_LINES } from './enduro-racer-constants.js';

/** An edge's units per pixel a line: a line nearer is a depth number more, its unit 1/128 pixel more. */
const UNITS_A_LINE = 128;

/** The road's features across, units from its centre: the surface's edge and the edge bands' inner bands' edges. */
export interface CrossSection {
  /** The surface's half width: where the edge bands begin. */
  readonly surface: number;
  /** The narrow inner band's outer edge, the middle band's outer edge. */
  readonly inner: number;
  readonly middle: number;
  /** The edge bands' outer edge: where the ground begins. */
  readonly edges: number;
}

/**
 * The road's cross-section from the road ROM: on each line from 20 to 128, outward from the centre (the line's right
 * end), the surface's edge (0 to 1), the narrow band's (1 to 2), the middle band's (2 to 1) and the edge bands' (1 to
 * 3), each the pixels from the centre to where the outer value begins, fitted against the line.
 */
export function roadCrossSection(rom: Uint8Array): CrossSection {
  const steps = [
    [0, 1],
    [1, 2],
    [2, 1],
    [1, 3],
  ] as const;
  const edges = steps.map(() => [] as [number, number][]);
  for (let row = FITTED_LINES.from; row <= FITTED_LINES.to; row++) {
    const line = roadLine(rom, row);
    let x = ROAD_LINE_PIXELS - 1;
    steps.forEach(([from, to], k) => {
      while (x > 0 && !(line[x] === from && line[x - 1] === to)) x--;
      if (x <= 0) throw romDiffers(`Road ROM line ${row} has no edge from ${from} to ${to}`);
      edges[k]!.push([row, ROAD_LINE_PIXELS - x]);
    });
  }
  const [surface, inner, middle, outer] = edges.map((points) => edgeSlope(points) * UNITS_A_LINE) as [
    number,
    number,
    number,
    number,
  ];
  return { surface, inner, middle, edges: outer };
}
