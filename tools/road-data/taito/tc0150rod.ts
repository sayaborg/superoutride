/**
 * The Z system's road generator, the TC0150ROD, as CHASE H.Q. and CONTINENTAL CIRCUS draw on it ([Original road
 * data](../../../docs/original-road-data.md#an-originals-modules), its hardware as MAME's driver at 9c0b6db1 describes
 * it): a tile of its road ROM is two lines of 1024 pixels at 2 bits, its edge line and its body line. A ROM word holds 8
 * pixels, its low byte their pens' low bits and its high byte their high bits, the first pixel the byte's top bit; the
 * ROM's words are little-endian. The edge line holds the two edges touching, the left one drawn outward from its
 * pixel 511 down and the right from its pixel 512 up, pen 0 beyond them the ground; the body line's middle is at the
 * road's centre.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import type { PaintLevels } from '../shared/two-roads.js';

/** A road line's pixels, a tile's bytes, and the edge line's middle: the left edge's first pixel outward, the right's next. */
export const LINE_PIXELS = 1024;
const TILE_BYTES = 0x200;
const EDGE_MIDDLE = 512;

/** Tile `tile`'s two lines of pens. */
export function roadLines(rom: Uint8Array, tile: number): { readonly edge: Uint8Array; readonly body: Uint8Array } {
  const at = tile * TILE_BYTES;
  if (!(Number.isInteger(tile) && tile >= 0 && at + TILE_BYTES <= rom.length))
    throw romDiffers(`The road ROM holds no tile ${tile}`);
  const pens = new Uint8Array(2 * LINE_PIXELS);
  for (let w = 0; w < (2 * LINE_PIXELS) / 8; w++) {
    const [low, high] = [rom[at + 2 * w]!, rom[at + 2 * w + 1]!];
    for (let k = 0; k < 8; k++) pens[8 * w + k] = (((high >> (7 - k)) & 1) << 1) | ((low >> (7 - k)) & 1);
  }
  return { edge: pens.subarray(0, LINE_PIXELS), body: pens.subarray(LINE_PIXELS) };
}

/** An edge's pens outward from the road's edge (`side` negative the left) up to the ground's pen 0. */
export function edgePens(edge: Uint8Array, side: number): number[] {
  const out: number[] = [];
  for (
    let x = side < 0 ? EDGE_MIDDLE - 1 : EDGE_MIDDLE;
    x >= 0 && x < LINE_PIXELS && edge[x] !== 0;
    x += side < 0 ? -1 : 1
  )
    out.push(edge[x]!);
  return out;
}

/** A road line word's priority bit (bit 13 of its words 0 to 2), which raises road A's part or lowers road B's. */
export const PRIORITY_BIT = 0x2000;

/**
 * The TC0150ROD's order of its two roads where they overlap, as MAME's driver describes it (not surely, by its own
 * account) where no word of a line sets its priority bit: road A's edges, its body with the lines its body line holds,
 * road B's edges, its body with its lines, each over the one before; at a tie road A's.
 */
export const TC0150ROD_LEVELS: readonly PaintLevels[] = Object.freeze([
  Object.freeze({ edge: 1, surface: 2, line: 2 }),
  Object.freeze({ edge: 3, surface: 4, line: 4 }),
]);
