/**
 * TOP SPEED's road picture ([Original road data](../../../docs/original-road-data.md#an-originals-modules), [TOP SPEED
 * road data](../../../docs/top-speed-road-data.md#its-road-picture)): its road at its nearest line, each side a tile
 * layer's picture of one half of the road from P outward, its lines, its edge's two bands and the ground beyond, each
 * found by the instructions that read it.
 */
import { instruction, long, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { tilePen } from '../taito/tc0100scn.js';
import { LANE_METRES } from './top-speed-road.js';

/** The pictures' pens: the lines, the edge's inner and outer bands, the surface and the ground; 0 is clear. */
export const PENS = Object.freeze({ line: 1, inner: 2, outer: 3, surface: 4, ground: 5 });
/** A tile's pixels, and a picture's row's tiles. */
const TILE = 8;
const ROW_TILES = 256;
/** The lanes of the right half's picture in steady driving. */
const PICTURE_LANES = 3;
/** The road's first line's row on the screen (MAME's description, the raster table's entry 0xAE) and its rows. */
const ROAD_TOP = 160;
const SCREEN_ROWS = 240;

/**
 * The road at its nearest line: the right half's picture in steady driving (M 0x4190), a list of a pointer a tile row
 * (M 0x4350 reads a row's tile codes forward), at the screen's last line, its 80th from the road's first; a lane's
 * pixels there the main program's edge offsets', 0x128 units a lane (M 0x7FC0) times the line's number over 0xA0
 * (M 0x7F28 to 0x7F30).
 */
function nearestLine(main: Uint8Array, gfx: Uint8Array) {
  const [high, low] = instruction(main, 0x4190, [0x47f9, null, null], "the right half's picture (lea)");
  const list = high * 0x10000 + low;
  const [units] = instruction(main, 0x7fc0, [0x303c, null], "a lane's edge units (move.w)");
  const [divisor] = instruction(main, 0x7f30, [0x343c, null], "a line's edge offsets' divisor (move.w)");
  const line = SCREEN_ROWS - ROAD_TOP - 1;
  const row = long(main, list + 4 * (line >> 3));
  const pixels = Array.from({ length: ROW_TILES * TILE }, (_, x) =>
    tilePen(gfx, word(main, row + 2 * (x >> 3)) & 0x3fff, x & 7, line & 7),
  );
  return { pixels, lanePixels: (units * (line + 1)) / divisor };
}

/** A band of the picture, metres right of P. */
export interface PictureBand {
  readonly left: number;
  readonly right: number;
}

/**
 * The road's picture at its nearest line, one side of three lanes, metres outward from P: its lines (pen 1), its edge's
 * inner and outer bands (pens 2 and 3), and its edge's width beyond its lanes, to where the ground begins; P where its
 * lane lines' middles lie a lane apart from it.
 */
export function topSpeedRoadPicture(main: Uint8Array, gfx: Uint8Array) {
  const { pixels, lanePixels } = nearestLine(main, gfx);
  const runs: { from: number; to: number; pen: number }[] = [];
  for (let x = 0; x < pixels.length;) {
    let end = x;
    while (end < pixels.length && pixels[end] === pixels[x]) end++;
    runs.push({ from: x, to: end, pen: pixels[x]! });
    x = end;
  }
  const lines = runs.filter((r) => r.pen === PENS.line);
  // The lane lines a lane and two from P, its last line before its edge.
  const lanes = lines.slice(-(PICTURE_LANES - 1));
  const middles = lanes.map((r) => (r.from + r.to) / 2);
  const p = middles[0]! - lanePixels;
  if (lanes.length !== PICTURE_LANES - 1 || middles.some((m, k) => Math.abs(m - p - (k + 1) * lanePixels) > 0.5))
    throw romDiffers("The road picture's lane lines are not a lane apart");
  const metres = (x: number) => ((x - p) / lanePixels) * LANE_METRES;
  const band = (pen: number): PictureBand => {
    const r = runs.filter((x) => x.pen === pen);
    if (r.length !== 1) throw romDiffers(`The road picture holds ${r.length} bands of pen ${pen}`);
    return { left: metres(r[0]!.from), right: metres(r[0]!.to) };
  };
  const [inner, outer] = [band(PENS.inner), band(PENS.outer)];
  const after = runs[runs.findIndex((r) => r.pen === PENS.outer) + 1];
  if (after?.pen !== PENS.ground || inner.right !== outer.left)
    throw romDiffers("The road picture's edge is not its inner band, its outer band and the ground");
  return {
    lines: lines.map((r): PictureBand => ({ left: metres(r.from), right: metres(r.to) })),
    inner,
    outer,
    /** The edge's width beyond the lanes, to the ground. */
    edgeMetres: outer.right - PICTURE_LANES * LANE_METRES,
  };
}

/**
 * The road's colors, palette words: its surface's by a color set and a record's field (the table at M 0xBA710, 4 bytes
 * a set from set 1 and a word by the field's bit 2, M 0x479C to 0x47B8), and its edge's, the outer band's pen of the
 * lines' palette line, 0x101, as the program loads the road's lines from 0x100 at its start (M 0x57E, 0x584).
 */
export function topSpeedRoadColors(main: Uint8Array) {
  const [high, low] = instruction(main, 0x479c, [0x41f9, null, null], "the surface's colors (lea)");
  instruction(main, 0x47a8, [0x5346, 0x6402, 0x4246, 0xe54e], 'a color set, 4 bytes from set 1 (lsl.w #2)');
  instruction(main, 0x47b2, [0x0240, 0x1000, 0xeb58], "the field's bit 2 (andi.w #$1000, rol.w #5)");
  const [startHigh, startLow] = instruction(main, 0x57e, [0x41f9, null, null], "the road's lines' colors (lea)");
  instruction(main, 0x584, [0x43f9, 0x0050, 0x2000], "the road's first line, 0x100 (lea)");
  const surfaces = high * 0x10000 + low;
  const lines = startHigh * 0x10000 + startLow;
  const PENS_A_LINE = 16;
  return {
    surface: (set: number, scene: number) => word(main, surfaces + 4 * Math.max(0, set - 1) + (scene & 4 ? 2 : 0)),
    edge: word(main, lines + 2 * (PENS_A_LINE + PENS.outer)),
  };
}
