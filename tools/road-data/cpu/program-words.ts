/**
 * Reading a 68000 program as its CPU addresses it: its halves interleaved from the ROMs of their even and odd bytes,
 * bytes, big-endian words and longs, and tables of entries up to their end mark.
 */
import { romDiffers } from '../shared/conversion-errors.js';

/** No table runs longer than this without its end mark: past it, the address is not a table's. */
const MOST_ENTRIES = 4096;

function at(p: Uint8Array, a: number, n: number) {
  if (!(a >= 0 && a + n <= p.length)) throw romDiffers(`Address 0x${a.toString(16)} lies outside the program`);
  return p.subarray(a, a + n);
}
export const u8 = (p: Uint8Array, a: number) => at(p, a, 1)[0]!;
export const s8 = (p: Uint8Array, a: number) => (u8(p, a) << 24) >> 24;
export const word = (p: Uint8Array, a: number) => {
  const [hi, lo] = at(p, a, 2);
  return (hi! << 8) | lo!;
};
export const sword = (p: Uint8Array, a: number) => (word(p, a) << 16) >> 16;
export const long = (p: Uint8Array, a: number) => word(p, a) * 0x10000 + word(p, a + 2);

/** Entries of `size` bytes from `address` until `end` says one is the end mark. */
export function entries<T>(address: number, size: number, end: (a: number) => boolean, read: (a: number) => T): T[] {
  const out: T[] = [];
  for (let a = address; !end(a); a += size) {
    if (out.length >= MOST_ENTRIES) throw romDiffers(`The table at 0x${address.toString(16)} has no end mark`);
    out.push(read(a));
  }
  return out;
}

/**
 * The words of an instruction at `address`, checked: `expected` lists its words, null where one is the operand read.
 * Returns the operand words in order; a mismatch means the program is not the one this reading knows.
 */
export function instruction(p: Uint8Array, address: number, expected: readonly (number | null)[], what: string) {
  const operands: number[] = [];
  expected.forEach((w, i) => {
    const actual = word(p, address + 2 * i);
    if (w === null) operands.push(actual);
    else if (actual !== w) throw romDiffers(`The program at 0x${address.toString(16)} is not ${what}`);
  });
  return operands;
}

/**
 * The count of a 68000 shift of a data register by an immediate, `op` checked against `base` (0xE040 `asr.w`,
 * 0xE048 `lsr.w`, 0xE140 `asl.w`, 0xE148 `lsl.w`, 0xE080 `asr.l`, 0xE180 `asl.l`, any register): its bits 9–11, 0
 * meaning 8.
 */
export function shiftCount(op: number, base: number, what: string) {
  if ((op & 0xf1f8) !== base) throw romDiffers(`The program's ${what} is not the shift read`);
  return (op >> 9) & 7 || 8;
}

/** One program's half from the ROM of its even bytes and the ROM of its odd bytes. */
export function interleave(even: Uint8Array, odd: Uint8Array): Uint8Array {
  if (even.length !== odd.length) throw romDiffers('Paired ROMs differ in size');
  const out = new Uint8Array(2 * even.length);
  for (let i = 0; i < even.length; i++) {
    out[2 * i] = even[i]!;
    out[2 * i + 1] = odd[i]!;
  }
  return out;
}
