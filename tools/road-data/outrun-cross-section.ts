/**
 * OUTRUN's road across ([Original road data](../../docs/original-road-data.md#cross-section)): one road's lines and
 * edges as the road ROM draws them (`two-roads` draws two together), and the lanes driven over two of them. Every amount
 * is in road units, across from the roads' middle, positive right.
 */
import { requireInput } from '../course/authoring-io.js';
import { UNIT_METRES } from './pixel-grid.js';
import type { ZipFile } from './zip.js';
import { paintAt, type Paint, type RoadPicture } from './two-roads.js';
import { OUTRUN_ROAD_ROM } from './outrun-rom.js';

/** A lane: the original's lane spacing, the road ROM's lines' (`opr-10185`), 3.6 m. */
export const LANE = 424 / 3;
/** A road's surface reaches this far from its centre, its edge bands included: its asphalt. */
export const ROAD_HALF = 250;
/** The road width at which two roads touch as one road of six equal lanes. */
export const TOUCHING = 212;
/** The road width at the game's start, units. */
export const START_WIDTH = 0x1c2;

export { UNIT_METRES };

/**
 * One road's lines and edge bands across from its centre, as the road ROM's nearest line (row 255 of `opr-10185`, 1 px
 * a unit, its centre at 252) draws them, each side alike: the inner lines 8 wide about 212/3 (pixel value 1), the outer
 * lines from 206 to 218 (1) and the edge band from 228 to 250 (2); between them the surface (0), the shoulder from 218
 * to 228 among it. The centre line, 8 wide at 0, is the surface's color on every stage and is not drawn. Each edge with
 * the paint to its right.
 */
const INNER = [212 / 3 - 4, 212 / 3 + 4] as const;
export const OUTRUN_ROAD: RoadPicture = [
  { at: -ROAD_HALF, right: 'edge' },
  { at: -228, right: 'surface' },
  { at: -218, right: 'line' },
  { at: -206, right: 'surface' },
  { at: -INNER[1], right: 'line' },
  { at: -INNER[0], right: 'surface' },
  { at: INNER[0], right: 'line' },
  { at: INNER[1], right: 'surface' },
  { at: 206, right: 'line' },
  { at: 218, right: 'surface' },
  { at: 228, right: 'edge' },
  { at: ROAD_HALF, right: 'outside' },
];

/**
 * The lanes driven at road width `w`, units: a, b, c | median | d, e, f, the outer lanes a and f always one lane. Two
 * roads apart (w ≥ 212) keep their lanes and the median 2(w − 212) between them; closer, the inner lanes c and d narrow
 * in proportion from 212 to 72, b and e taking the rest, so that at w = 72 the four lanes seen are a, b, e and f.
 */
export function drivenLanes(w: number) {
  if (w >= TOUCHING) return { a: LANE, b: LANE, c: LANE, m: 2 * (w - TOUCHING), d: LANE, e: LANE, f: LANE };
  const inner = w > 72 ? (LANE * (w - 72)) / (TOUCHING - 72) : 0;
  const rest = w + LANE / 2 - inner;
  return { a: LANE, b: rest, c: inner, m: 0, d: inner, e: rest, f: LANE };
}

/** The centre of lane b at road width `w`, units from the roads' middle (negative: left). */
export function centreLaneAt(w: number): number {
  const { b, c } = drivenLanes(w);
  return w >= TOUCHING ? -w : -(c + b / 2);
}

/** Road widths at which the lanes' rule changes. */
export const LANE_RULE_WIDTHS: readonly number[] = [72, TOUCHING];

const ROAD_ROM_SIZE = 0x8000;
/** The nearest line of the road ROM, 1 pixel a unit, and the pixel its centre falls on. */
const NEAREST = 255;
const CENTRE_PIXEL = 252;
/** The road ROM's pixel values: the surface, a line, the edge band, beyond the road (and the centre line). */
const ROM_PAINT: readonly Paint[] = ['surface', 'line', 'edge', 'outside'];

/**
 * Check one road's features against the road ROM's nearest line: each pixel's value (plane 0 its low bit, plane 1 its
 * high, the most significant bit of a byte the leftmost pixel) is what `paintAt` gives at its centre, but within a
 * pixel of a feature's edge (the ROM draws them on whole pixels) and on the centre line. Throws where they disagree.
 */
export function checkRoadRom(files: ReadonlyMap<string, ZipFile>) {
  const { name, crc } = OUTRUN_ROAD_ROM;
  const file = files.get(name);
  requireInput(file, `/rom/${name}`, `The ROM set has no ${name}`);
  requireInput(
    file.data.length === ROAD_ROM_SIZE && file.crc === crc,
    `/rom/${name}`,
    `${name} is not MAME outrun's road ROM of CRC ${crc.toString(16).padStart(8, '0')}`,
  );
  const bit = (plane: number, x: number) => (file.data[plane * 0x4000 + NEAREST * 64 + (x >> 3)]! >> (7 - (x & 7))) & 1;
  for (let x = 0; x < 512; x++) {
    const d = x + 0.5 - CENTRE_PIXEL;
    if (Math.abs(d) < 4 || OUTRUN_ROAD.some((e) => Math.abs(Math.abs(d) - Math.abs(e.at)) < 1)) continue;
    const rom = ROM_PAINT[bit(0, x) | (bit(1, x) << 1)]!;
    requireInput(
      rom === paintAt(OUTRUN_ROAD, d),
      `/rom/${name}`,
      `The road ROM draws ${rom} at ${d} units from its centre, not ${paintAt(OUTRUN_ROAD, d)}`,
    );
  }
}
