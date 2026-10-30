/**
 * SUPER HANG-ON's road across ([SUPER HANG-ON road data](../../../docs/super-hang-on-road-data.md)): the edges of its
 * centre line, lines and edge bands in road units, as the road ROM draws them. The ROM's lines draw one road at a size
 * proportional to the line: a feature's edge on line r lies at u × r / 224 pixels from the road's centre, u its units
 * (an object's x is drawn at x × r / 224 pixels, `drawScales`' `line`), so u is 224 times the slope of the edge's
 * pixels against the line, fitted by least squares over every line on which each edge is drawn.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { edgeSlope, ROAD_LINE_PIXELS, ROAD_LINES, roadLine } from '../sega-16/rom-images.js';
import { ROAD_CENTRE } from './super-hang-on-constants.js';

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
}

/**
 * The road's cross-section from the road ROM: on each line, outward from the centre on either side, the centre line's
 * edge (a 3 among the middle columns to 0), the line's (0 to 1, 1 to 0) and the edge band's (0 to 2, 2 to 3), each the
 * column where the outer value begins; each edge in units, its side's fit over the lines on which every edge is drawn
 * on both sides, an object's x drawn at x × row / `rowUnits` pixels.
 */
export function roadCrossSection(rom: Uint8Array, rowUnits: number): CrossSection {
  const steps = [
    [3, 0],
    [0, 1],
    [1, 0],
    [0, 2],
    [2, 3],
  ] as const;
  // A line's edges on one side, outward from the centre, each step's first column; none where one is not drawn.
  const lineEdges = (line: readonly number[], side: 1 | -1) => {
    let x = side > 0 ? Math.ceil(ROAD_CENTRE) : Math.floor(ROAD_CENTRE);
    const found: number[] = [];
    for (const [from, to] of steps) {
      while (x >= 0 && x < ROAD_LINE_PIXELS && !(line[x] === to && line[x - side] === from)) x += side;
      if (x < 0 || x >= ROAD_LINE_PIXELS) return null;
      // The edge between two columns: a right edge where its column begins, a left one where the column within ends.
      found.push(side > 0 ? x - ROAD_CENTRE : ROAD_CENTRE - (x + 1));
    }
    return found;
  };
  const lines = Array.from({ length: ROAD_LINES }, (_, row) => {
    const line = roadLine(rom, row);
    return { row, right: lineEdges(line, 1), left: lineEdges(line, -1) };
  }).filter((l) => l.right && l.left);
  if (lines.length < 2) throw romDiffers('The road ROM draws every edge on fewer than two lines');
  const fit = (side: 'right' | 'left') =>
    steps.map((_, k) => edgeSlope(lines.map((l) => [l.row, l[side]![k]!] as const)) * rowUnits);
  const [right, left] = [fit('right'), fit('left')];
  const mean = (k: number) => (right[k]! + left[k]!) / 2;
  return {
    centre: mean(0),
    linesIn: mean(1),
    linesOut: mean(2),
    edgesIn: mean(3),
    edgesOut: mean(4),
  };
}
