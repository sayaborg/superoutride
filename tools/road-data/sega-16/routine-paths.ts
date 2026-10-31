/**
 * The instructions a 68000 routine can run, read statically from its program: each instruction's length by its
 * encoding, and the paths from the routine's entry through its branches.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { word } from './program-words.js';

/** No routine reaches more instructions than this: past it, the address is not a routine's. */
const MOST_INSTRUCTIONS = 4096;

/** The extension words of an effective address (mode, register) whose operand is `size` bytes. */
function extension(mode: number, reg: number, size: 1 | 2 | 4) {
  if (mode < 5) return 0;
  if (mode < 7) return 2;
  return [2, 4, 2, 2, size === 4 ? 4 : 2][reg] ?? Infinity;
}
/** The operand size of bits 6–7 (byte, word, long). */
const sized = (bits: number) => ([1, 2, 4] as const)[bits];

/** The bytes the 68000 instruction at `address` takes, by its first word's encoding. */
export function instructionLength(p: Uint8Array, address: number): number {
  const op = word(p, address);
  const mode = (op >> 3) & 7,
    reg = op & 7;
  const ea = (size: 1 | 2 | 4) => extension(mode, reg, size);
  const size = sized((op >> 6) & 3);
  let length = Infinity;
  switch (op >> 12) {
    case 0x0:
      if (op & 0x0100) length = mode === 1 ? 4 : 2 + ea(1);
      else if ((op & 0x0f00) === 0x0800) length = 4 + ea(1);
      else if (size !== undefined) length = (op & 0x3f) === 0x3c ? 4 : 2 + (size === 4 ? 4 : 2) + ea(size);
      break;
    case 0x1:
    case 0x2:
    case 0x3: {
      const moved = ([0, 1, 4, 2] as const)[op >> 12] as 1 | 2 | 4;
      length = 2 + ea(moved) + extension((op >> 6) & 7, (op >> 9) & 7, moved);
      break;
    }
    case 0x4:
      if ([0x4e75, 0x4e73, 0x4e71, 0x4e77, 0x4e76].includes(op) || (op & 0xfff0) === 0x4e40) length = 2;
      else if ((op & 0xfff8) === 0x4e50) length = 4;
      else if ((op & 0xfff8) === 0x4e58 || (op & 0xfff0) === 0x4e60 || (op & 0xfff8) === 0x4840) length = 2;
      else if ((op & 0xfeb8) === 0x4880) length = 2;
      else if ((op & 0xfb80) === 0x4880) length = 4 + ea(2);
      else if ((op & 0xff80) === 0x4e80 || (op & 0xf1c0) === 0x41c0 || (op & 0xffc0) === 0x4840) length = 2 + ea(4);
      else if ((op & 0xf9c0) === 0x40c0 || (op & 0xf1c0) === 0x4180) length = 2 + ea(2);
      else if (size !== undefined) length = 2 + ea(size);
      else if ((op & 0xffc0) === 0x4ac0) length = 2 + ea(1);
      break;
    case 0x5:
      length = (op & 0xf0f8) === 0x50c8 ? 4 : 2 + ea(size ?? 1);
      break;
    case 0x6:
      length = (op & 0xff) === 0 ? 4 : 2;
      break;
    case 0x7:
      length = 2;
      break;
    case 0x8:
    case 0x9:
    case 0xb:
    case 0xc:
    case 0xd: {
      const opmode = (op >> 6) & 7;
      // Divides and multiplies take a word; the address operations a word or a long.
      if (opmode === 3 || opmode === 7) length = 2 + ea(op >> 12 === 0x8 || op >> 12 === 0xc || opmode === 3 ? 2 : 4);
      else if ((op & 0x0130) === 0x0100 && op >> 12 !== 0xb) length = 2;
      else length = 2 + ea(sized(opmode & 3)!);
      break;
    }
    case 0xe:
      length = size === undefined ? 2 + ea(2) : 2;
      break;
  }
  if (!Number.isFinite(length)) throw romDiffers(`The program at 0x${address.toString(16)} is no instruction read`);
  return length;
}

/**
 * The instructions routine `entry` can run, by address: from its entry through every branch either way, a `bra` to
 * its target alone, to each `rts` or `jmp`; a call (`bsr`, `jsr`) returns to the next.
 */
export function routineInstructions(p: Uint8Array, entry: number): ReadonlySet<number> {
  const known = walked.get(p) ?? walked.set(p, new Map()).get(p)!;
  const done = known.get(entry);
  if (done) return done;
  const reached = new Set<number>();
  const next = [entry];
  for (let a = next.pop(); a !== undefined; a = next.pop()) {
    if (reached.has(a)) continue;
    if (reached.size >= MOST_INSTRUCTIONS) throw romDiffers(`The routine at 0x${entry.toString(16)} does not end`);
    reached.add(a);
    const op = word(p, a);
    const length = instructionLength(p, a);
    if (op === 0x4e75 || (op & 0xffc0) === 0x4ec0) continue;
    if (op >> 12 === 6 && ((op >> 8) & 15) !== 1) {
      const displacement = op & 0xff ? (op << 24) >> 24 : (word(p, a + 2) << 16) >> 16;
      next.push(a + 2 + displacement);
      if (((op >> 8) & 15) === 0) continue;
    } else if ((op & 0xf0f8) === 0x50c8) next.push(a + 2 + ((word(p, a + 2) << 16) >> 16));
    next.push(a + length);
  }
  known.set(entry, reached);
  return reached;
}
/** Each program's routines walked, by entry: a program is read-only, so its routines' instructions stay. */
const walked = new WeakMap<Uint8Array, Map<number, ReadonlySet<number>>>();

/** Whether routine `entry` can run an instruction whose words are `words` (null any word). */
export function routineRuns(p: Uint8Array, entry: number, words: readonly (number | null)[]) {
  return [...routineInstructions(p, entry)].some((a) => words.every((w, i) => w === null || word(p, a + 2 * i) === w));
}
