/**
 * SUPER HANG-ON's road across ([SUPER HANG-ON road data](../../docs/super-hang-on-road-data.md)): the edges of its
 * centre line, lines and edge bands in road units, as the road ROM draws them. The ROM's lines draw one road at a size
 * proportional to the line: a feature's edge on line r lies at u × r / 224 pixels from the road's centre, u its units
 * (an object's x is drawn at x × r / 224 pixels, the `divs.w #$E0` at 0x7262), so u is 224 times the slope of the
 * edge's pixels against the line, fitted by least squares over the lines drawn at every size.
 */
import { ROAD_LINE_PIXELS, roadLine } from './rom-images.js';

/** The road ROM's lines fitted, and its lines' pixels. */
const FITTED = { from: 60, to: 189 } as const;
/** The road's centre: the middle of its middle eight columns, 248 to 255, where a 3 draws the centre line. */
const CENTRE = 252.5;
/** An object's x is drawn at x × line / 224 pixels. */
const UNITS_A_LINE = 224;

/** The road's features across: each edge's units from its centre, the left's and right's mean. */
export interface CrossSection {
  /** The centre line's half width. */
  readonly centre: number;
  /** The lines' inner and outer edges. */
  readonly linesIn: number;
  readonly linesOut: number;
  /** The edge bands' inner and outer edges; the shoulder between the lines and the bands has the surface's colors. */
  readonly edgesIn: number;
  readonly edgesOut: number;
  /** How far the ROM's right side lies from its left: the right's inner line edge less the left's. */
  readonly skew: number;
}

/** The least squares slope of `points` [x, y]. */
function slope(points: readonly (readonly [number, number])[]): number {
  const n = points.length;
  const [mx, my] = [points.reduce((s, [x]) => s + x, 0) / n, points.reduce((s, [, y]) => s + y, 0) / n];
  const sxy = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return sxy / sxx;
}

/**
 * The road's cross-section from the road ROM: on each line from 60 to 189, outward from the centre on either side, the
 * centre line's edge (a 3 among the middle columns to 0), the line's (0 to 1, 1 to 0) and the edge band's (0 to 2, 2 to
 * 3), each the column where the outer value begins; each edge in units, its side's fit.
 */
export function roadCrossSection(rom: Uint8Array): CrossSection {
  const steps = [
    [3, 0],
    [0, 1],
    [1, 0],
    [0, 2],
    [2, 3],
  ] as const;
  const fits = ([1, -1] as const).map((side) => {
    const edges = steps.map(() => [] as [number, number][]);
    for (let row = FITTED.from; row <= FITTED.to; row++) {
      const line = roadLine(rom, row);
      // Outward from the centre on this side, each step's first column.
      let x = side > 0 ? Math.ceil(CENTRE) : Math.floor(CENTRE);
      steps.forEach(([from, to], k) => {
        while (x >= 0 && x < ROAD_LINE_PIXELS && !(line[x] === to && line[x - side] === from)) x += side;
        if (x < 0 || x >= ROAD_LINE_PIXELS)
          throw new RangeError(`Road ROM line ${row} has no edge from ${from} to ${to}`);
        // The edge between two columns: a right edge where its column begins, a left one where the column within ends.
        edges[k]!.push([row, side > 0 ? x - CENTRE : CENTRE - (x + 1)]);
      });
    }
    return edges.map((points) => slope(points) * UNITS_A_LINE);
  });
  const [right, left] = fits as [number[], number[]];
  const mean = (k: number) => (right[k]! + left[k]!) / 2;
  return {
    centre: mean(0),
    linesIn: mean(1),
    linesOut: mean(2),
    edgesIn: mean(3),
    edgesOut: mean(4),
    skew: right[1]! - left[1]!,
  };
}
