/**
 * CONTINENTAL CIRCUS's road colors ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md)): the
 * TC0150ROD's palette entries for its road, each course's, and the banks the main program gives each line by its
 * place, each found by the instructions that read it. A road pixel p of a line's bank and a part's group B is palette
 * entry 0xC00 + 0x40 × bank + 0x10 × B + 1 + ((p − 1) & 3), the road's entries from 0xC00 (MAME's description of the
 * chip for this board's road, its palette bank 3 by the byte the main program writes at 0x90001).
 */
import { instruction, long, word } from '../cpu/program-words.js';
import { xrgb555Of } from '../taito/palette.js';

/** The road's banks, a bank's groups, and a group's entries: a pixel's entry less one (`1 + ((p − 1) & 3)`). */
export const BANKS = 12;
export const GROUPS = 4;
/** A line's parts' groups as the sub program draws open road (S 0x26EE to 0x26FA): its edges' B 0, its body's B 1. */
export const GROUP = Object.freeze({ edge: 0, body: 1, darkEdge: 2, darkBody: 3 } as const);
/** A pixel's entry in its group, 0 to 3: pixel 1 the first, 2 the second, 3 the third and 0 the fourth. */
export const entryOf = (pixel: number) => (pixel + 3) & 3;

/**
 * Course `course`'s road colors (0 to 7): the palette task's (M 0x6E4A) source of the course's 16 words (its long at
 * M 0xC5A0 + 16 × the course + 12, M 0x6ED8) and, for each of 12 banks a frame, 16 words in four runs of four, each
 * written 0x10 entries on (M 0x74F6 to 0x7528), from 0xC01 by 0x40 a bank (M 0x6EE8, 0x6EEE, 0x6F46): B 0 the source's
 * words the bank's four offsets at M 0xD090 name, B 1 the bank's first four at M 0xD0F0, B 2 the source's words 0x10
 * bytes past B 0's, B 3 the bank's next four at M 0xD0F0 (M 0x6EF2 to 0x6F42). Its color of bank `bank`, group
 * `group` and road pixel `pixel`, RGB555.
 */
export function continentalCircusRoadColors(main: Uint8Array, course: number) {
  const [high, low] = instruction(main, 0x6e58, [0x41f9, null, null], "the courses' colors (lea)");
  instruction(main, 0x6ed8, [0x2268, 0x000c], "the road's colors, a course's fourth long (movea.l)");
  const [offsetsHigh, offsetsLow] = instruction(main, 0x6edc, [0x45f9, null, null], "the banks' offsets (lea)");
  const [fixedHigh, fixedLow] = instruction(main, 0x6ee2, [0x47f9, null, null], "the banks' fixed words (lea)");
  instruction(main, 0x6ee8, [0x3b7c, 0x0c01, 0xef4e], "the road's first entry (move.w)");
  instruction(main, 0x6eee, [0x7040, 0x7e0b], '12 banks of 0x40 entries (moveq)');
  instruction(main, 0x6f1a, [0x38f1, 0x1010], "B 2's words, 0x10 bytes past B 0's (move.w)");
  instruction(main, 0x6f42, [0xd4fc, 0x0008], "a bank's four offsets (adda.w #8)");
  instruction(main, 0x7528, [0x0641, 0x000d], 'a run 0x10 entries past the last (addi.w #13)');
  const source = long(main, high * 0x10000 + low + 16 * course + 12);
  const offsets = offsetsHigh * 0x10000 + offsetsLow;
  const fixed = fixedHigh * 0x10000 + fixedLow;
  const colors = Array.from({ length: BANKS }, (_, bank) => {
    const offset = (k: number) => word(main, offsets + 8 * bank + 2 * k);
    const fromSource = (extra: number) => [0, 1, 2, 3].map((k) => word(main, source + offset(k) + extra));
    const fromFixed = (first: number) => [0, 1, 2, 3].map((k) => word(main, fixed + 16 * bank + 2 * (first + k)));
    return [fromSource(0), fromFixed(0), fromSource(0x10), fromFixed(4)];
  });
  return (bank: number, group: number, pixel: number): number => xrgb555Of(colors[bank]![group]![entryOf(pixel)]!);
}

/**
 * A road place's bank: the main program's table of 512 words at M 0x4EC4, the bank its top 4 bits, by the place's
 * distance plus the picture's pinhole (M 0x4D70) over 4 (M 0x4E68 to 0x4E74): `place` in the program's positions, the
 * pinhole's.
 */
export function stripeBank(main: Uint8Array): (place: number) => number {
  instruction(main, 0x4e68, [0x3a13, 0xda6d, 0xe760, 0xe24d, 0x0245, 0x03fe], "a line's place over 4 (lsr.w, andi.w)");
  instruction(main, 0x4e74, [0x827b, 0x504e], "the place's bank (or.w, pc)");
  const table = 0x4e76 + 0x4e;
  return (place) => word(main, table + 2 * ((Math.floor(place) >> 2) & 0x1ff)) >> 12;
}
