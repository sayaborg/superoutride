/**
 * The images the originals' ROMs make on their boards ([Rules of the originals](../../../docs/original-road-data.md#rules-of-the-originals)):
 * a 68000's program from pairs of ROMs of its even and odd bytes, the tile ROMs' bit planes and a tile's pixels, the
 * sprite ROMs' 32-bit words, and the road ROM's lines.
 */
import { interleave } from './program-words.js';
import type { Rom, RomSet } from '../shared/rom-set.js';
import { spriteWords } from './sprite-pixels.js';

/** A pair of ROMs holding a program's even and odd bytes. */
export interface ProgramPair {
  readonly even: Rom;
  readonly odd: Rom;
}

/** A program as its CPU addresses it: each pair's bytes interleaved, the pairs one after another from address 0. */
export function programImage(set: RomSet, pairs: readonly ProgramPair[]): Uint8Array {
  const out = new Uint8Array(pairs.reduce((n, { even }) => n + 2 * even.size, 0));
  let at = 0;
  for (const { even, odd } of pairs) {
    out.set(interleave(set.data(even), set.data(odd)), at);
    at += 2 * even.size;
  }
  return out;
}

/** The tile ROMs' bit planes, the lowest first, 8 bytes a tile: each plane its ROMs one after another. */
export function tilePlanes(set: RomSet, planes: readonly (Rom | readonly Rom[])[]): readonly Uint8Array[] {
  return planes.map((plane) => {
    const roms: readonly Rom[] = Array.isArray(plane) ? plane : [plane as Rom];
    const out = new Uint8Array(roms.reduce((n, rom) => n + rom.size, 0));
    let at = 0;
    for (const rom of roms) {
      out.set(set.data(rom), at);
      at += rom.size;
    }
    return out;
  });
}

/** A tile's pixel (x, y), 0 transparent: plane k's bit at it bit k, a byte a row, its bit 7 the leftmost pixel. */
export const tilePixel = (planes: readonly Uint8Array[], tile: number, x: number, y: number) =>
  planes.reduce((v, plane, k) => v | (((plane[8 * tile + y]! >> (7 - x)) & 1) << k), 0);

/** The sprite ROMs' words (`spriteWords`), set of four after set of four, a set's words as many as its ROMs' bytes. */
export function spriteWordSets(set: RomSet, sets: readonly (readonly Rom[])[]): Uint32Array {
  const words = new Uint32Array(sets.reduce((n, roms) => n + roms[0]!.size, 0));
  let at = 0;
  for (const roms of sets) {
    words.set(spriteWords(roms.map((rom) => set.data(rom))), at);
    at += roms[0]!.size;
  }
  return words;
}

/** The road ROM's lines: 256 lines of 512 pixels, two bit planes of 64 bytes a line, the second 0x4000 after the first. */
export const ROAD_LINE_PIXELS = 512;
const PLANE_BYTES = 0x4000;
/** The road ROM's lines: a plane's bytes, a line's pixels a bit each. */
export const ROAD_LINES = PLANE_BYTES / (ROAD_LINE_PIXELS / 8);

/** The pixel values of road ROM line `line`: plane 0 the low bit, plane 1 the high, a byte's bit 7 the leftmost. */
export function roadLine(rom: Uint8Array, line: number): number[] {
  return Array.from({ length: ROAD_LINE_PIXELS }, (_, x) => {
    const bit = (plane: number) =>
      (rom[plane * PLANE_BYTES + line * (ROAD_LINE_PIXELS / 8) + (x >> 3)]! >> (7 - (x & 7))) & 1;
    return bit(0) | (bit(1) << 1);
  });
}

/**
 * An edge's pixels a line across the road ROM's lines: the least squares slope of its `points` [line, pixels from the
 * centre], as a road's cross-section is fitted from the lines that draw it.
 */
export function edgeSlope(points: readonly (readonly [number, number])[]): number {
  const n = points.length;
  const [mx, my] = [points.reduce((s, [x]) => s + x, 0) / n, points.reduce((s, [, y]) => s + y, 0) / n];
  const sxy = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return sxy / sxx;
}
