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
/** Up over across, a pixel's height over its width: the screen's (K, 2026-11-05). */
export const UP = 15 / 14;
/** The rows its screen shows: its 320 columns at 4:3, a pixel `UP` as tall as wide. */
export const SCREEN_ROWS = (320 * 3) / 4 / UP;
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

/**
 * Its own car's lateral limit, pixels either side of the road's centre at its own car's line: the road task holds the
 * car's x within ±0x3C000 (S 0x2856 to 0x287A; the right bound wider by the pit lane's word, 0 on open road, S 0x285C),
 * and moves the road's k-th line from the screen's bottom (k from 0) across by (0x86 − k) × x / 0x10000 pixels (S 0x26A8
 * to 0x26EC, 0x2770 to 0x279C: d2 starts at 0x86 × x and loses x a line), its own car's line the first beyond the 0x28
 * near lines, the first of the far lines, its nearest at the car's distance (`CAR_DISTANCE`).
 */
export function carLimit(sub: Uint8Array): number {
  const [count] = instruction(sub, 0x26a8, [null], 'the near lines (moveq)');
  if (count >> 8 !== 0x76) throw romDiffers('The near lines are not counted in d3 (moveq)');
  const near = (count & 0xff) + 1;
  const [lines] = instruction(sub, 0x26d4, [0x2f3c, 0x0000, null], "the road's lines a car's x moves (move.l)");
  instruction(sub, 0x26ec, [0x9485], 'a near line moved by x less (sub.l)');
  instruction(sub, 0x279c, [0x9485], 'a far line moved by x less (sub.l)');
  const [rightHigh, rightLow] = instruction(sub, 0x2864, [0x0687, null, null], "the car's right bound (addi.l)");
  const [leftHigh, leftLow] = instruction(sub, 0x2872, [0x0c84, null, null], "the car's left bound (cmpi.l)");
  instruction(sub, 0x285c, [0x3e2d, 0xff7a], "the pit lane's word widening the right bound (move.w)");
  const right = rightHigh * 0x10000 + rightLow;
  if (((leftHigh * 0x10000 + leftLow) | 0) !== -right) throw romDiffers("The car's bounds are not alike either side");
  return (right * (lines - near)) / 0x10000;
}
