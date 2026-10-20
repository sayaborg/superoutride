/**
 * Reading a 68000 program as its CPU addresses it: bytes, big-endian words and longs, and tables of entries up to their
 * end mark.
 */

/** No table runs longer than this without its end mark: past it, the address is not a table's. */
const MOST_ENTRIES = 4096;

function at(p: Uint8Array, a: number, n: number) {
  if (!(a >= 0 && a + n <= p.length)) throw new RangeError(`Address 0x${a.toString(16)} lies outside the program`);
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
    if (out.length >= MOST_ENTRIES) throw new RangeError(`The table at 0x${address.toString(16)} has no end mark`);
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
    else if (actual !== w) throw new RangeError(`The program at 0x${address.toString(16)} is not ${what}`);
  });
  return operands;
}
