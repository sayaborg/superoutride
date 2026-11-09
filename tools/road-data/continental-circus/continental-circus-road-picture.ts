/**
 * CONTINENTAL CIRCUS's road picture ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md)): its
 * road A at its own car's line, its body's lines and its edges' bands, and its scale across, its own car as wide there
 * as a Formula One car could be in 1987, each found by the instructions that read it.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { edgePens, LINE_PIXELS, roadLines } from '../taito/tc0150rod.js';

/** A Formula One car's widest in 1987, metres: its own car's width at its depth (K, 2026-11-05). */
export const CAR_WIDTH = 2.15;
/**
 * Its own car's colored columns seen from behind at the start, drawn at zoom 0x7F, a pixel a pixel: the sub program's
 * race record for a car not turning (S 0x4A78, its first, sprite 0x2E), columns 11 to 104 (research).
 */
export const CAR_COLUMNS = 94;
/** The distance of its own car's line from the picture's pinhole, positions: the car 0x42B ahead of it (S 0x2C08). */
export const CAR_DISTANCE = 0x42b;
/** The road's half width, lateral units: a line's half width in pixels times its distance (the tables at M 0x53A6, 0xD1F0). */
const HALF_WIDTH_UNITS = 0x40000;

/** A band across the road, metres from its centre (`from` < `to`), in a pen of its line. */
export interface RoadBand {
  readonly from: number;
  readonly to: number;
  readonly pen: number;
}

/** The pen runs of a line from pixel `from` by `step`, while `holds` holds: each run's pen and its pixels. */
function runs(line: Uint8Array, from: number, step: 1 | -1, holds: (x: number) => boolean) {
  const out: { pen: number; from: number; count: number }[] = [];
  for (let x = from; x >= 0 && x < LINE_PIXELS && holds(x); x += step) {
    const last = out.at(-1);
    if (last && last.pen === line[x]) last.count++;
    else out.push({ pen: line[x]!, from: x, count: 1 });
  }
  return out;
}

/**
 * The road at its own car's line (`CAR_DISTANCE`): the main program's tables give each line its distance and its half
 * width w in pixels, its road ROM tile the same w (M 0x4E06, 0x4E0A, 0x4E40, 0x4E96); its tile's body line between its
 * edges, its lines the pens other than the body's about its middle, and its edges' bands outward from them (`edgePens`).
 * A pixel there is `CAR_WIDTH` over `CAR_COLUMNS` metres, the car drawn at the road's own scale at its line (zoom 0x7F,
 * the things' scale by S 0x7316 there).
 */
export function continentalCircusRoadPicture(main: Uint8Array, road: Uint8Array) {
  const widths = 0x4e06 + 2 + instruction(main, 0x4e06, [0x43fa, null], "the lines' half widths (lea, pc)")[0];
  const [high, low] = instruction(main, 0x4e0a, [0x47f9, null, null], "the lines' distances (lea)");
  instruction(main, 0x4e40, [0x3211, 0x3001, 0x3801, 0xe24c], "a line's half width (move.w)");
  instruction(main, 0x4e74, [0x827b, 0x504e], "the half width as the road tile, its bank or'd (or.w)");
  const distances = high * 0x10000 + low;
  let line = 0;
  while (word(main, distances + 2 * line) !== CAR_DISTANCE)
    if (++line > 0x100) throw romDiffers("No line of the road picture lies at its own car's distance");
  const half = word(main, widths + 2 * line);
  if (Math.abs(half * CAR_DISTANCE - HALF_WIDTH_UNITS) > CAR_DISTANCE)
    throw romDiffers("The road's half width at its own car's line is not 0x40000 units over its distance");
  const pixelMetres = CAR_WIDTH / CAR_COLUMNS;
  const { edge, body } = roadLines(road, half);
  const middle = LINE_PIXELS / 2;
  // Its body's lines: runs of a pen other than the body's (the one at its middle) within its half width.
  const bodyPen = body[middle]!;
  const lines = runs(body, middle - half, 1, (x) => x < middle + half)
    .filter((r) => r.pen !== bodyPen && r.from > middle - half && r.from + r.count < middle + half)
    .map((r) => ({ from: (r.from - middle) * pixelMetres, to: (r.from + r.count - middle) * pixelMetres, pen: r.pen }));
  // Its edges' bands outward from its half width, each run of one pen.
  const bands = (side: 1 | -1): RoadBand[] => {
    const pens = edgePens(edge, side);
    const out: RoadBand[] = [];
    let at = half;
    pens.forEach((pen, k) => {
      if (k > 0 && pens[k - 1] === pen) {
        const last = out.at(-1)!;
        out[out.length - 1] =
          side > 0 ? { ...last, to: (at + 1) * pixelMetres } : { ...last, from: -(at + 1) * pixelMetres };
      } else
        out.push(
          side > 0
            ? { from: at * pixelMetres, to: (at + 1) * pixelMetres, pen }
            : { from: -(at + 1) * pixelMetres, to: -at * pixelMetres, pen },
        );
      at++;
    });
    return out;
  };
  return { line, half, pixelMetres, halfMetres: half * pixelMetres, bodyPen, lines, left: bands(-1), right: bands(1) };
}
