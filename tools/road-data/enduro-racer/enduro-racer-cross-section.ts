/**
 * ENDURO RACER's road across ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-course)): the edges of
 * its surface and edge bands in lateral units, as the road ROM draws them. Line L of the ROM is the road's left half,
 * its last column the road's centre; the sub CPU draws depth number d on line d + 1, on which an object's unit is
 * (d + 3) / 128 pixels (`objectZoom`: a line nearer, a unit `unitsALine`ths of a pixel more), so an edge's units are
 * `unitsALine` times the slope of its pixels against the line, fitted by least squares over the lines drawn at every
 * size.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { edgeSlope, ROAD_LINE_PIXELS, ROAD_LINES, roadLine } from '../sega-16/rom-images.js';

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
 * The road's cross-section from the road ROM: outward from the centre (a line's right end), the surface's edge (0 to
 * 1), the narrow band's (1 to 2), the middle band's (2 to 1) and the edge bands' (1 to 3), each the pixels from the
 * centre to where the outer value begins, fitted against the line over every line that shows all four (K, 2026-10-31:
 * lines 8 to 11 and 13 to 128 of today's ROM; the others lack one or draw no road), with those lines.
 */
export function roadCrossSection(rom: Uint8Array, unitsALine: number): CrossSection & { readonly lines: number[] } {
  const steps = [
    [0, 1],
    [1, 2],
    [2, 1],
    [1, 3],
  ] as const;
  const edges = steps.map(() => [] as [number, number][]);
  const lines: number[] = [];
  for (let row = 0; row < ROAD_LINES; row++) {
    const line = roadLine(rom, row);
    let x = ROAD_LINE_PIXELS - 1;
    const found = steps.map(([from, to]) => {
      while (x > 0 && !(line[x] === from && line[x - 1] === to)) x--;
      return x > 0 ? ROAD_LINE_PIXELS - x : null;
    });
    if (found.includes(null)) continue;
    lines.push(row);
    found.forEach((pixels, k) => edges[k]!.push([row, pixels!]));
  }
  if (lines.length < 2) throw romDiffers('The road ROM has no two lines showing all four edges');
  const [surface, inner, middle, outer] = edges.map((points) => edgeSlope(points) * unitsALine) as [
    number,
    number,
    number,
    number,
  ];
  return { surface, inner, middle, edges: outer, lines };
}
