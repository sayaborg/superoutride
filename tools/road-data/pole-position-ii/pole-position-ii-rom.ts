/**
 * POLE POSITION II's ROMs ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-rom-set)):
 * where they come from, which make the two Z8002s' programs, and the PROMs of its colors.
 */
import { interleave } from '../cpu/program-words.js';
import type { RomSet, RomSource } from '../shared/rom-set.js';

/** Where POLE POSITION II's ROMs come from: MAME's `polepos2` ([Development](../../../docs/development.md#road-data-commands)). */
export const POLE_POSITION_II_ROMS: RomSource = Object.freeze({
  original: 'pole-position-ii',
  sets: Object.freeze(['polepos2']),
});

/** The Z8002s' programs: each a pair of ROMs of its words' even (high) and odd (low) bytes, one after another. */
export const POLE_POSITION_II_PROGRAM_ROMS = Object.freeze({
  first: [
    {
      even: { name: 'pp4_2.8l', size: 0x2000, crc: 0x51b9a669 },
      odd: { name: 'pp4_1.8m', size: 0x2000, crc: 0x3f6ac294 },
    },
  ],
  second: [
    {
      even: { name: 'pp4_6.4l', size: 0x2000, crc: 0x38d04e0f },
      odd: { name: 'pp4_5.4m', size: 0x2000, crc: 0xc3053cae },
    },
    {
      even: { name: 'pp4_8.3l', size: 0x1000, crc: 0xef25a2ee },
      odd: { name: 'pp4_7.3m', size: 0x1000, crc: 0xad1c8994 },
    },
  ],
} as const);
/** The color PROMs: the palette's red, green and blue, the background's and the road's palettes. */
export const POLE_POSITION_II_COLOR_PROMS = Object.freeze({
  red: { name: 'pp4-7.8l', size: 0x100, crc: 0x16d69c31 },
  background: { name: 'pp4-11.4d', size: 0x100, crc: 0x7880c5af },
  green: { name: 'pp4-8.9l', size: 0x100, crc: 0x07340311 },
  blue: { name: 'pp4-9.10l', size: 0x100, crc: 0x1efc84d7 },
  road: { name: 'pp4-12.3c', size: 0x400, crc: 0x8b270902 },
} as const);

/** Every ROM the conversion reads, in its order. */
export const POLE_POSITION_II_READ_ROMS = Object.freeze([
  ...[...POLE_POSITION_II_PROGRAM_ROMS.first, ...POLE_POSITION_II_PROGRAM_ROMS.second].flatMap((p) => [p.even, p.odd]),
  ...Object.values(POLE_POSITION_II_COLOR_PROMS),
]);

/** A program from its pairs of ROMs, from address 0. */
const program = (
  set: RomSet,
  pairs: readonly { readonly even: Parameters<RomSet['data']>[0]; readonly odd: Parameters<RomSet['data']>[0] }[],
) => {
  const halves = pairs.map((p) => interleave(set.data(p.even), set.data(p.odd)));
  const out = new Uint8Array(halves.reduce((n, h) => n + h.length, 0));
  halves.reduce((at, h) => (out.set(h, at), at + h.length), 0);
  return out;
};

/** The two Z8002s' programs and the color PROMs, from the ROM set. */
export function assemblePolePositionII(set: RomSet) {
  const proms = POLE_POSITION_II_COLOR_PROMS;
  return {
    first: program(set, POLE_POSITION_II_PROGRAM_ROMS.first),
    second: program(set, POLE_POSITION_II_PROGRAM_ROMS.second),
    colors: { red: set.data(proms.red), green: set.data(proms.green), blue: set.data(proms.blue) },
    background: set.data(proms.background),
    road: set.data(proms.road),
  };
}
export type PolePositionII = ReturnType<typeof assemblePolePositionII>;
