/**
 * A Z8002 instruction read from a program at an address, as Zilog's Z8000 CPU User's Reference Manual encodes the
 * nonsegmented Z8000's: its words, its mnemonic and its operands in Zilog's syntax, for the research listings
 * ([Research tools](../../../docs/development.md#research-tools)). A program's words are big-endian, its byte 0 at
 * address 0; a word no instruction begins with is a word of data (`dc.w`), and an extended (EPU) instruction is read as
 * its two words (`ext`).
 */
import { hex, type Instruction } from './z80-instructions.js';

type Size = 'b' | 'w' | 'l' | 'q';

const CONDITIONS = ['f', 'lt', 'le', 'ule', 'ov', 'mi', 'z', 'c', '', 'ge', 'gt', 'ugt', 'nov', 'pl', 'nz', 'nc'];
const CONTROL = ['', '', 'fcw', 'refresh', 'psapseg', 'psapoff', 'nspseg', 'nspoff'];
const ALU = ['add', 'sub', 'or', 'and', 'xor', 'cp'];
const ROTATES = ['rl', 'rl', 'rr', 'rr', 'rlc', 'rlc', 'rrc', 'rrc'];
const TRANSLATES = ['trib', 'trtib', 'trirb', 'trtirb', 'trdb', 'trtdb', 'trdrb', 'trtdrb'];
const BLOCKS: Record<number, [string, string] | [string]> = {
  0x0: ['cpi', 'cc'],
  0x1: ['ldi'],
  0x2: ['cpsi', 'cc'],
  0x4: ['cpir', 'cc'],
  0x6: ['cpsir', 'cc'],
  0x8: ['cpd', 'cc'],
  0x9: ['ldd'],
  0xa: ['cpsd', 'cc'],
  0xc: ['cpdr', 'cc'],
  0xe: ['cpsdr', 'cc'],
};
const IO_BLOCKS: Record<number, [string, string]> = {
  0x0: ['ini', 'inir'],
  0x1: ['sini', 'sinir'],
  0x2: ['outi', 'otir'],
  0x3: ['souti', 'sotir'],
  0x8: ['ind', 'indr'],
  0x9: ['sind', 'sindr'],
  0xa: ['outd', 'otdr'],
  0xb: ['soutd', 'sotdr'],
};

/** A register of a size by its field: r0–r15, rh0–rh7 and rl0–rl7, rr0–rr14, rq0–rq12. */
const register = (size: Size, n: number) =>
  size === 'b' ? (n < 8 ? `rh${n}` : `rl${n - 8}`) : `${{ w: 'r', l: 'rr', q: 'rq' }[size]}${n}`;
/** The flags a SETFLG, RESFLG or COMFLG names, by bits 4–7. */
const flags = (n: number) => ['c', 'z', 's', 'p'].filter((_, i) => n & (8 >> i)).join(',');
const signed16 = (v: number) => (v << 16) >> 16;

/** The Z8002 instruction at `address` (even) of `program`. */
export function decodeZ8000(program: Uint8Array, address: number): Instruction {
  const at = (a: number) => ((program[a & 0xffff] ?? 0) << 8) | (program[(a + 1) & 0xffff] ?? 0);
  const first = at(address);
  let length = 2;
  const next = () => {
    const w = at(address + length);
    length += 2;
    return w;
  };
  const done = (mnemonic: string, operands = ''): Instruction => ({ length, mnemonic, operands });
  const data = (): Instruction => ({ length: 2, mnemonic: 'dc.w', operands: '' });

  const high = first >> 8;
  const [group, op, a, b] = [high >> 6, high & 0x3f, (first >> 4) & 15, first & 15];
  const s: Size = op & 1 ? 'w' : 'b';
  const immediate = (size: Size) => {
    if (size === 'l') return `#${hex(next() * 0x10000 + next())}`;
    const w = next();
    return `#${hex(size === 'b' ? w & 0xff : w)}`;
  };
  /** The operand of field n in the instruction's addressing mode: IM or IR, DA or X, or R. */
  const operand = (n: number, size: Size) => {
    if (group === 0) return n === 0 ? immediate(size) : `@r${n}`;
    if (group === 1) {
      const at = hex(next());
      return n === 0 ? at : `${at}(r${n})`;
    }
    return register(size, n);
  };
  /** A memory operand of field n: none in IM. */
  const memory = (n: number, size: Size) => (group === 0 && n === 0 ? null : operand(n, size));
  const condition = (n: number) => CONDITIONS[n]!;
  const conditioned = (n: number, target: string) => (n === 8 ? target : `${condition(n)},${target}`);

  if (group === 3) {
    const top = high >> 4;
    if (top === 0xc) return done('ldb', `${register('b', high & 15)},#${hex(first & 0xff)}`);
    if (top === 0xd) {
      const d = ((first & 0xfff) << 20) >> 20;
      return done('calr', hex((address + 2 - 2 * d) & 0xffff));
    }
    if (top === 0xe) {
      const d = ((first & 0xff) << 24) >> 24;
      return done('jr', conditioned(high & 15, hex((address + 2 + 2 * d) & 0xffff)));
    }
    const target = hex((address + 2 - 2 * (first & 0x7f)) & 0xffff);
    return first & 0x80
      ? done('djnz', `${register('w', high & 15)},${target}`)
      : done('dbjnz', `${register('b', high & 15)},${target}`);
  }

  // Loads, stores and arithmetic alike in the three groups.
  if (op <= 0x0b) {
    const name = `${ALU[op >> 1]}${op & 1 ? '' : 'b'}`;
    return done(name, `${register(s, b)},${operand(a, s)}`);
  }
  if (op >= 0x10 && op <= 0x1b && op !== 0x11 && op !== 0x13 && op !== 0x15 && op !== 0x17) {
    const [name, dst, src]: [string, Size, Size] = (
      {
        0x10: ['cpl', 'l', 'l'],
        0x12: ['subl', 'l', 'l'],
        0x14: ['ldl', 'l', 'l'],
        0x16: ['addl', 'l', 'l'],
        0x18: ['multl', 'q', 'l'],
        0x19: ['mult', 'l', 'w'],
        0x1a: ['divl', 'q', 'l'],
        0x1b: ['div', 'l', 'w'],
      } as Record<number, [string, Size, Size]>
    )[op]!;
    return done(name, `${register(dst, b)},${operand(a, src)}`);
  }
  if (op === 0x11 || op === 0x13 || op === 0x15 || op === 0x17) {
    // The stack's register is bits 4–7; the other operand's mode is bits 0–3.
    const size: Size = op === 0x11 || op === 0x15 ? 'l' : 'w';
    const other =
      group === 0 && b === 0
        ? null
        : group === 1
          ? b === 0
            ? hex(next())
            : `${hex(next())}(r${b})`
          : group === 0
            ? `@r${b}`
            : register(size, b);
    if (other === null || a === 0) return data();
    const name = `${op <= 0x13 ? 'push' : 'pop'}${size === 'l' ? 'l' : ''}`;
    return done(name, op <= 0x13 ? `@r${a},${other}` : `${other},@r${a}`);
  }
  if (op === 0x20 || op === 0x21) return done(op & 1 ? 'ld' : 'ldb', `${register(s, b)},${operand(a, s)}`);
  if (op === 0x2c || op === 0x2d) {
    const src = memory(a, s);
    return src === null ? data() : done(op & 1 ? 'ex' : 'exb', `${register(s, b)},${src}`);
  }
  if (op >= 0x22 && op <= 0x27) {
    const name = `${['res', 'set', 'bit'][(op - 0x22) >> 1]}${op & 1 ? '' : 'b'}`;
    if (group === 0 && a === 0) return done(name, `${register(s, (next() >> 8) & 15)},${register('w', b)}`);
    return done(name, `${operand(a, s)},#${b}`);
  }
  if (op >= 0x28 && op <= 0x2b) {
    const dst = memory(a, s);
    const name = `${op < 0x2a ? 'inc' : 'dec'}${op & 1 ? '' : 'b'}`;
    return dst === null ? data() : done(name, `${dst},#${b + 1}`);
  }

  if (group === 2) return registers(first, op, a, b, s, next, done, data);

  if (op === 0x0c || op === 0x0d) {
    const dst = memory(a, s);
    if (dst === null) return data();
    const suffix = s === 'b' ? 'b' : '';
    const named = ['com', 'cp', 'neg', '', 'test', 'ld', 'tset', '', 'clr', 'push'][b];
    if (!named || (b === 9 && (s === 'b' || group !== 0))) return data();
    if (b === 9) return done('push', `@r${a},${immediate('w')}`);
    return b === 1 || b === 5 ? done(`${named}${suffix}`, `${dst},${immediate(s)}`) : done(`${named}${suffix}`, dst);
  }
  if (op === 0x1c) {
    if (b === 8) {
      const dst = memory(a, 'l');
      return dst === null ? data() : done('testl', dst);
    }
    if (b !== 1 && b !== 9) return data();
    const words = next();
    const [r, n] = [(words >> 8) & 15, (words & 15) + 1];
    const place = memory(a, 'w');
    if (place === null) return data();
    return b === 1 ? done('ldm', `r${r},${place},#${n}`) : done('ldm', `${place},r${r},#${n}`);
  }
  if (op === 0x1d || op === 0x2e || op === 0x2f) {
    const dst = memory(a, 'w');
    const [name, size]: [string, Size] = op === 0x1d ? ['ldl', 'l'] : op === 0x2e ? ['ldb', 'b'] : ['ld', 'w'];
    return dst === null ? data() : done(name, `${dst},${register(size, b)}`);
  }
  if (op === 0x1e) {
    const dst = memory(a, 'w');
    return dst === null ? data() : done('jp', conditioned(b, dst));
  }
  if (op === 0x1f) {
    const dst = memory(a, 'w');
    return dst === null || b !== 0 ? data() : done('call', dst);
  }
  if (op === 0x0e || op === 0x0f) return (next(), done('ext', hex(first)));

  return group === 0 ? short(address, op, a, b, next, done, data) : indexedGroup(first, op, a, b, next, done, data);
}

type Next = () => number;
type Done = (mnemonic: string, operands?: string) => Instruction;

/** The register group's own instructions (0x8C–0xBF). */
function registers(
  first: number,
  op: number,
  a: number,
  b: number,
  s: Size,
  next: Next,
  done: Done,
  data: () => Instruction,
) {
  const suffix = s === 'b' ? 'b' : '';
  switch (op) {
    case 0x0c:
    case 0x0d: {
      const named = ['com', '', 'neg', '', 'test', '', 'tset', '', 'clr'][b];
      if (named) return done(`${named}${suffix}`, register(s, a));
      if (op === 0x0c && b === 1) return done('ldctlb', `${register('b', a)},flags`);
      if (op === 0x0c && b === 9) return done('ldctlb', `flags,${register('b', a)}`);
      if (op === 0x0d && b === 7 && a === 0) return done('nop');
      if (op === 0x0d && (b === 1 || b === 3 || b === 5))
        return done(['setflg', 'resflg', 'comflg'][b >> 1]!, flags(a));
      return data();
    }
    case 0x0e:
    case 0x0f:
      return (next(), done('ext', hex(first)));
    case 0x1c:
      return b === 8 ? done('testl', register('l', a)) : data();
    case 0x1e:
      return a === 0 ? done('ret', CONDITIONS[b]) : data();
    case 0x2e:
    case 0x2f:
      return done(op === 0x2e ? 'tccb' : 'tcc', `${CONDITIONS[b] || 't'},${register(s, a)}`);
    case 0x30:
      return b === 0 ? done('dab', register('b', a)) : data();
    case 0x31: {
      const named = (
        { 0xa: ['extsb', 'w'], 0x0: ['extsl', 'q'], 0x8: ['exts', 'l'] } as Record<number, [string, Size]>
      )[b];
      return named ? done(named[0], register(named[1], a)) : data();
    }
    case 0x32:
    case 0x33:
      return shift(a, b, s, next, done, data);
    case 0x34:
    case 0x35:
    case 0x36:
    case 0x37:
      return done(`${op < 0x36 ? 'adc' : 'sbc'}${suffix}`, `${register(s, b)},${register(s, a)}`);
    case 0x38: {
      if (b & 1) return data();
      const w = next();
      return done(TRANSLATES[b >> 1]!, `@r${a},@r${(w >> 4) & 15},r${(w >> 8) & 15}`);
    }
    case 0x3a:
    case 0x3b: {
      const block = BLOCKS[b];
      if (!block) return data();
      const w = next();
      const [r, d, c] = [(w >> 8) & 15, (w >> 4) & 15, w & 15];
      if (block.length === 1) return done(`${block[0]}${c === 8 ? '' : 'r'}${suffix}`, `@r${d},@r${a},r${r}`);
      const dst = block[0].startsWith('cps') ? `@r${d}` : register(s, d);
      return done(`${block[0]}${suffix}`, `${dst},@r${a},r${r},${CONDITIONS[c] || 't'}`);
    }
    case 0x3c:
      return done('rrdb', `${register('b', b)},${register('b', a)}`);
    case 0x3d:
      return done('ldk', `${register('w', a)},#${b}`);
    case 0x3e:
      return done('rldb', `${register('b', b)},${register('b', a)}`);
    default:
      return data();
  }
}

/** The rotates and shifts (0xB2 bytes, 0xB3 words and longs). */
function shift(a: number, b: number, s: Size, next: Next, done: Done, data: () => Instruction) {
  const suffix = s === 'b' ? 'b' : '';
  if (!(b & 1)) return done(`${ROTATES[b >> 1]}${suffix}`, `${register(s, a)},#${b & 2 ? 2 : 1}`);
  const long = (b & 4) !== 0;
  if (long && s === 'b') return data();
  const size: Size = long ? 'l' : s;
  const end = long ? 'l' : suffix;
  const arithmetic = (b & 8) !== 0;
  if (b & 2)
    return done(`${arithmetic ? 'sda' : 'sdl'}${end}`, `${register(size, a)},${register('w', (next() >> 8) & 15)}`);
  const count = signed16(next());
  const name = arithmetic ? (count < 0 ? 'sra' : 'sla') : count < 0 ? 'srl' : 'sll';
  return done(`${name}${end}`, `${register(size, a)},#${Math.abs(count)}`);
}

/** Group 0's short and I/O instructions (0x30–0x3F): relative and based loads, LDPS, the I/O instructions. */
function short(address: number, op: number, a: number, b: number, next: Next, done: Done, data: () => Instruction) {
  const relative = () => hex((address + 4 + signed16(next())) & 0xffff);
  const based = () => `r${a}(#${hex(next())})`;
  const place = () => (a === 0 ? relative() : based());
  const r = (size: Size) => register(size, b);
  switch (op) {
    case 0x30:
      return done(a ? 'ldb' : 'ldrb', `${r('b')},${place()}`);
    case 0x31:
      return done(a ? 'ld' : 'ldr', `${r('w')},${place()}`);
    case 0x32:
      return done(a ? 'ldb' : 'ldrb', `${place()},${r('b')}`);
    case 0x33:
      return done(a ? 'ld' : 'ldr', `${place()},${r('w')}`);
    case 0x34:
      return done(a ? 'lda' : 'ldar', `${r('w')},${place()}`);
    case 0x35:
      return done(a ? 'ldl' : 'ldrl', `${r('l')},${place()}`);
    case 0x37:
      return done(a ? 'ldl' : 'ldrl', `${place()},${r('l')}`);
    case 0x39:
      return a && b === 0 ? done('ldps', `@r${a}`) : data();
    case 0x3a:
    case 0x3b: {
      const suffix = op === 0x3a ? 'b' : '';
      const size: Size = op === 0x3a ? 'b' : 'w';
      if (b >= 4 && b <= 7) {
        const port = `#${hex(next())}`;
        const name = `${b & 1 ? 's' : ''}${b < 6 ? 'in' : 'out'}${suffix}`;
        return done(name, b < 6 ? `${register(size, a)},${port}` : `${port},${register(size, a)}`);
      }
      const block = IO_BLOCKS[b];
      if (!block) return data();
      const w = next();
      const [count, d, c] = [(w >> 8) & 15, (w >> 4) & 15, w & 15];
      return done(`${block[c === 8 ? 0 : 1]}${suffix}`, `@r${d},@r${a},r${count}`);
    }
    case 0x3c:
      return done('inb', `${register('b', b)},@r${a}`);
    case 0x3d:
      return done('in', `${register('w', b)},@r${a}`);
    case 0x3e:
      return done('outb', `@r${a},${register('b', b)}`);
    case 0x3f:
      return done('out', `@r${a},${register('w', b)}`);
    default:
      return data();
  }
}

/** Group 1's own instructions (0x70–0x7F): based-indexed loads, LDA, LDPS, HALT, IRET, the multi-micro, DI, EI, LDCTL, SC. */
function indexedGroup(
  first: number,
  op: number,
  a: number,
  b: number,
  next: Next,
  done: Done,
  data: () => Instruction,
) {
  const based = () => `r${a}(r${(next() >> 8) & 15})`;
  switch (op) {
    case 0x30:
      return done('ldb', `${register('b', b)},${based()}`);
    case 0x31:
      return done('ld', `${register('w', b)},${based()}`);
    case 0x32:
      return done('ldb', `${based()},${register('b', b)}`);
    case 0x33:
      return done('ld', `${based()},${register('w', b)}`);
    case 0x34:
      return done('lda', `${register('w', b)},${based()}`);
    case 0x35:
      return done('ldl', `${register('l', b)},${based()}`);
    case 0x36: {
      const at = hex(next());
      return done('lda', `${register('w', b)},${a ? `${at}(r${a})` : at}`);
    }
    case 0x37:
      return done('ldl', `${based()},${register('l', b)}`);
    case 0x39: {
      if (b !== 0) return data();
      const at = hex(next());
      return done('ldps', a ? `${at}(r${a})` : at);
    }
    case 0x3a:
      return first === 0x7a00 ? done('halt') : data();
    case 0x3b:
      if (first === 0x7b00) return done('iret');
      if (b === 0xd) return done('mreq', `r${a}`);
      return a === 0 && b >= 8 && b <= 0xa ? done(['mset', 'mres', 'mbit'][b - 8]!) : data();
    case 0x3c: {
      if (a !== 0 || b & 8) return data();
      const lines = [b & 2 ? '' : 'vi', b & 1 ? '' : 'nvi'].filter(Boolean).join(',');
      return done(b & 4 ? 'ei' : 'di', lines);
    }
    case 0x3d: {
      const control = CONTROL[b & 7];
      if (!control) return data();
      return b & 8 ? done('ldctl', `${control},r${a}`) : done('ldctl', `r${a},${control}`);
    }
    case 0x3f:
      return done('sc', `#${hex(first & 0xff)}`);
    default:
      return data();
  }
}
