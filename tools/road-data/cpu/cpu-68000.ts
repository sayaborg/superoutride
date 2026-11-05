/**
 * A 68000 running a routine of a program as its CPU does, for the research commands that check a model against the
 * original's own code ([Development](../../../docs/development.md#road-data-commands)): the program read-only from address
 * 0, a work RAM and the regions beside it the routine reads and writes (a shared RAM, a chip's RAM), and the
 * instructions the routines it runs use, with their condition codes, X among them: moves and register lists, adds,
 * subtracts, compares, decimal adds and subtracts, multiplies, divides, logic, bits, shifts and rotations, branches,
 * calls, jumps through tables, frames, traps and returns ([Running an original's code](../../../docs/original-road-data.md#rules-of-the-originals)).
 * Any other instruction, an odd word access or a write outside the RAM and its regions is an error: the routine is not
 * one this CPU runs.
 */
import { romDiffers } from '../shared/conversion-errors.js';

const BYTE = 1,
  WORD = 2,
  LONG = 4;
type Size = typeof BYTE | typeof WORD | typeof LONG;
const MASK = { 1: 0xff, 2: 0xffff, 4: 0xffffffff } as const;
const SIGN = { 1: 0x80, 2: 0x8000, 4: 0x80000000 } as const;

/** No routine runs longer than this many instructions: past it, it does not return. */
const MOST_INSTRUCTIONS = 10_000_000;
/** The return address a called routine's `rts` reaches: the call is then done. */
const RETURNED = 0xfffffe;

/** An effective address: a data or address register, a memory address, or an immediate value. */
type Place =
  | { readonly kind: 'd' | 'a'; readonly reg: number }
  | { readonly kind: 'm'; readonly address: number }
  | { readonly kind: 'i'; readonly value: number };

/** A region the routine reads and writes beside the work RAM, from `start`. */
export interface Region {
  readonly start: number;
  readonly bytes: Uint8Array;
}

/** How a routine is called: its base register A5 and frame A6, its stack's top, and the routines it calls that return at once. */
export interface CallOptions {
  /** A5, the program's base register; the RAM's start unless given. */
  readonly a5?: number;
  /** A6, the frame of the routine's caller, where the routine reads its caller's locals. */
  readonly a6?: number;
  /** The stack's top; the RAM's top unless given. */
  readonly stack?: number;
  /** Routines a call or jump to returns from at once, as if run: sound or other hardware the routine does not need. */
  readonly skip?: ReadonlySet<number>;
}

/** A value's `size` bytes, unsigned; and signed. */
const masked = (v: number, size: Size) => (size === LONG ? v >>> 0 : v & MASK[size]);
const signed = (v: number, size: Size) =>
  size === LONG ? v | 0 : v & SIGN[size] ? (v & MASK[size]) - 2 * SIGN[size] : v & MASK[size];

export class Cpu68000 {
  readonly d = new Uint32Array(8);
  readonly a = new Uint32Array(8);
  private pc = 0;
  private x = false;
  private n = false;
  private z = false;
  private v = false;
  private c = false;
  private trapped = false;
  private skip: ReadonlySet<number> = new Set();

  /** The CPU over `program` (read-only from 0), `ram` (from `ramStart`) and `regions` beside it. */
  constructor(
    private readonly program: Uint8Array,
    readonly ram: Uint8Array,
    private readonly ramStart: number,
    private readonly regions: readonly Region[] = [],
  ) {}

  /**
   * Runs the routine at `address` until it returns, or until a trap (a program waits for its next frame by one), A5 and
   * the stack as `options` give them, A5 the RAM's start and the stack its top unless given.
   */
  call(address: number, options: CallOptions = {}) {
    this.a[5] = options.a5 ?? this.ramStart;
    if (options.a6 !== undefined) this.a[6] = options.a6;
    this.a[7] = (options.stack ?? this.ramStart + this.ram.length) - 4;
    this.skip = options.skip ?? new Set();
    this.write(this.a[7]!, LONG, RETURNED);
    this.pc = address;
    this.trapped = false;
    for (let count = 0; this.pc !== RETURNED && !this.trapped; count++) {
      if (count >= MOST_INSTRUCTIONS) throw romDiffers(`The routine at 0x${address.toString(16)} does not return`);
      this.step();
    }
  }

  /** The condition codes as the 68000's status register's low byte holds them: X, N, Z, V and C. */
  get ccr() {
    return (+this.x << 4) | (+this.n << 3) | (+this.z << 2) | (+this.v << 1) | +this.c;
  }
  set ccr(value: number) {
    this.x = (value & 0x10) !== 0;
    this.n = (value & 8) !== 0;
    this.z = (value & 4) !== 0;
    this.v = (value & 2) !== 0;
    this.c = (value & 1) !== 0;
  }

  /** A RAM word or long, unsigned, at its offset; and one written. */
  ramRead(offset: number, size: Size) {
    return this.read(this.ramStart + offset, size);
  }
  ramWrite(offset: number, size: Size, value: number) {
    this.write(this.ramStart + offset, size, value);
  }

  /** The writable memory holding `size` bytes at `address`, and the offset there; none outside them. */
  private writable(address: number, size: Size): [Uint8Array, number] | null {
    if (address >= this.ramStart && address + size <= this.ramStart + this.ram.length)
      return [this.ram, address - this.ramStart];
    for (const r of this.regions)
      if (address >= r.start && address + size <= r.start + r.bytes.length) return [r.bytes, address - r.start];
    return null;
  }

  private read(address: number, size: Size): number {
    address &= 0xffffff;
    if (size !== BYTE && address & 1)
      throw romDiffers(`An odd ${size === WORD ? 'word' : 'long'} read at 0x${address.toString(16)}`);
    const [memory, at] =
      this.writable(address, size) ??
      (address + size <= this.program.length
        ? [this.program, address]
        : (() => {
            throw romDiffers(`A read outside the program and the RAM at 0x${address.toString(16)}`);
          })());
    let value = 0;
    for (let i = 0; i < size; i++) value = value * 256 + memory[at + i]!;
    return value;
  }

  private write(address: number, size: Size, value: number) {
    address &= 0xffffff;
    if (size !== BYTE && address & 1) throw romDiffers(`An odd write at 0x${address.toString(16)}`);
    const place = this.writable(address, size);
    if (!place) throw romDiffers(`A write outside the RAM at 0x${address.toString(16)}`);
    const [memory, at] = place;
    for (let i = size - 1; i >= 0; i--) {
      memory[at + i] = value & 0xff;
      value = Math.floor(value / 256);
    }
  }

  private fetch(): number {
    const w = this.read(this.pc, WORD);
    this.pc += 2;
    return w;
  }

  private push(value: number) {
    this.a[7] = this.a[7]! - 4;
    this.write(this.a[7]!, LONG, value);
  }

  private pop(): number {
    const value = this.read(this.a[7]!, LONG);
    this.a[7] = this.a[7]! + 4;
    return value;
  }

  /** A call to `target`: pushed and taken, or, a routine to skip, as if it returned at once. */
  private callTo(target: number) {
    if (this.skip.has(target & 0xffffff)) return;
    this.push(this.pc);
    this.pc = target;
  }

  /** An effective address `mode`/`reg` of `size`, its extension words fetched; `-(An)` and `(An)+` stepped. */
  private place(mode: number, reg: number, size: Size): Place {
    const step = size === BYTE && reg === 7 ? 2 : size;
    const index = (base: number) => {
      const ext = this.fetch();
      const r = (ext >> 12) & 7;
      const x = ext & 0x8000 ? this.a[r]! : this.d[r]!;
      return base + (ext & 0x800 ? x | 0 : signed(x, WORD)) + signed(ext, BYTE);
    };
    switch (mode) {
      case 0:
        return { kind: 'd', reg };
      case 1:
        return { kind: 'a', reg };
      case 2:
        return { kind: 'm', address: this.a[reg]! };
      case 3: {
        const address = this.a[reg]!;
        this.a[reg] = address + step;
        return { kind: 'm', address };
      }
      case 4:
        this.a[reg] = this.a[reg]! - step;
        return { kind: 'm', address: this.a[reg]! };
      case 5:
        return { kind: 'm', address: this.a[reg]! + signed(this.fetch(), WORD) };
      case 6:
        return { kind: 'm', address: index(this.a[reg]!) };
    }
    switch (reg) {
      case 0:
        return { kind: 'm', address: signed(this.fetch(), WORD) };
      case 1:
        return { kind: 'm', address: this.fetch() * 0x10000 + this.fetch() };
      case 2: {
        const base = this.pc;
        return { kind: 'm', address: base + signed(this.fetch(), WORD) };
      }
      case 3:
        return { kind: 'm', address: index(this.pc) };
      case 4: {
        const value = size === LONG ? this.fetch() * 0x10000 + this.fetch() : this.fetch() & MASK[size];
        return { kind: 'i', value };
      }
    }
    throw this.unknown();
  }

  /** A memory place's address, for the instructions that take one alone (jumps, calls, lea, pea, register lists). */
  private address(mode: number, reg: number): number {
    const p = this.place(mode, reg, LONG);
    if (p.kind !== 'm') throw this.unknown();
    return p.address;
  }

  private get(p: Place, size: Size): number {
    switch (p.kind) {
      case 'd':
        return masked(this.d[p.reg]!, size);
      case 'a':
        return masked(this.a[p.reg]!, size);
      case 'm':
        return this.read(p.address, size);
      case 'i':
        return masked(p.value, size);
    }
  }

  private set(p: Place, size: Size, value: number) {
    value = masked(value, size);
    if (p.kind === 'd') this.d[p.reg] = size === LONG ? value : (this.d[p.reg]! & ~MASK[size]) | value;
    else if (p.kind === 'a') this.a[p.reg] = size === LONG ? value : signed(value, size);
    else if (p.kind === 'm') this.write(p.address, size, value);
    else throw this.unknown();
  }

  /** N and Z of a result, V and C cleared, X kept (moves, logic, multiplies). */
  private logic(value: number, size: Size) {
    this.n = (value & SIGN[size]) !== 0;
    this.z = masked(value, size) === 0;
    this.v = this.c = false;
  }

  /** `a + b` (or `a − b`) and its flags, X as C where it `extends` (adds and subtracts, not compares). */
  private arithmetic(a: number, b: number, size: Size, subtract: boolean, extend = true): number {
    const m = MASK[size],
      s = SIGN[size];
    const full = subtract ? masked(a, size) - masked(b, size) : masked(a, size) + masked(b, size);
    const r = masked(full, size);
    this.n = (r & s) !== 0;
    this.z = r === 0;
    this.c = subtract ? full < 0 : full > m;
    this.v = subtract ? ((a ^ b) & (a ^ r) & s) !== 0 : (~(a ^ b) & (a ^ r) & s) !== 0;
    if (extend) this.x = this.c;
    return r;
  }

  /**
   * `a + b + X`, or `a − b − X`, in binary-coded decimal, a byte: C and X its carry or borrow, Z cleared where it is not
   * 0, N and V kept.
   */
  private decimal(a: number, b: number, subtract = false): number {
    let r: number;
    if (subtract) {
      let low = (a & 0x0f) - (b & 0x0f) - +this.x;
      let high = (a >> 4) - (b >> 4);
      if (low < 0) [low, high] = [low + 10, high - 1];
      this.c = high < 0;
      if (this.c) high += 10;
      r = ((high << 4) | low) & 0xff;
    } else {
      let low = (a & 0x0f) + (b & 0x0f) + +this.x;
      if (low > 9) low += 6;
      r = (a & 0xf0) + (b & 0xf0) + low;
      this.c = r > 0x99;
      if (this.c) r += 0x60;
      r &= 0xff;
    }
    this.x = this.c;
    if (r !== 0) this.z = false;
    return r;
  }

  /** abcd and sbcd: between data registers, or from -(Ay) to -(Ax). */
  private decimalOp(mode: number, reg: number, high: number, subtract: boolean) {
    if (mode === 1) {
      const fromValue = this.get(this.place(4, reg, BYTE), BYTE);
      const to = this.place(4, high, BYTE);
      this.set(to, BYTE, this.decimal(this.get(to, BYTE), fromValue, subtract));
    } else this.set({ kind: 'd', reg: high }, BYTE, this.decimal(this.d[high]! & 0xff, this.d[reg]! & 0xff, subtract));
  }

  private condition(code: number): boolean {
    const { n, z, v, c } = this;
    switch (code) {
      case 0:
        return true;
      case 1:
        return false;
      case 2:
        return !c && !z;
      case 3:
        return c || z;
      case 4:
        return !c;
      case 5:
        return c;
      case 6:
        return !z;
      case 7:
        return z;
      case 8:
        return !v;
      case 9:
        return v;
      case 10:
        return !n;
      case 11:
        return n;
      case 12:
        return n === v;
      case 13:
        return n !== v;
      case 14:
        return !z && n === v;
      default:
        return z || n !== v;
    }
  }

  private unknown() {
    return romDiffers(`An instruction this CPU does not run at 0x${(this.pc - 2).toString(16)}`);
  }

  /** Register `index` of a register list: D0 to D7, then A0 to A7. */
  private listed(index: number) {
    return index < 8 ? this.d[index]! : this.a[index - 8]!;
  }
  private setListed(index: number, value: number) {
    if (index < 8) this.d[index] = value >>> 0;
    else this.a[index - 8] = value >>> 0;
  }

  /** `movem`: the registers a list names written to memory, or read from it, words read signed to longs. */
  private moveMultiple(op: number, mode: number, reg: number) {
    const toRegisters = (op & 0x400) !== 0;
    const size: Size = op & 0x40 ? LONG : WORD;
    const list = this.fetch();
    if (mode === 4) {
      // -(An): the list read from A7 down to D0, bit 0 A7.
      if (toRegisters) throw this.unknown();
      let at = this.a[reg]!;
      for (let index = 15; index >= 0; index--) {
        if (!(list & (1 << (15 - index)))) continue;
        at -= size;
        this.write(at, size, masked(this.listed(index), size));
      }
      this.a[reg] = at;
      return;
    }
    let at = mode === 3 ? this.a[reg]! : this.address(mode, reg);
    if (mode === 3 && !toRegisters) throw this.unknown();
    for (let index = 0; index < 16; index++) {
      if (!(list & (1 << index))) continue;
      if (toRegisters) this.setListed(index, size === WORD ? signed(this.read(at, WORD), WORD) : this.read(at, LONG));
      else this.write(at, size, masked(this.listed(index), size));
      at += size;
    }
    if (mode === 3) this.a[reg] = at;
  }

  /** `btst`, `bchg`, `bclr` and `bset`: Z the bit's complement, then the bit kept, changed, cleared or set. */
  private bit(kind: number, number: number, mode: number, reg: number) {
    const size: Size = mode === 0 ? LONG : BYTE;
    const p = this.place(mode, reg, size);
    const value = this.get(p, size);
    const mask = 2 ** (number % (size === LONG ? 32 : 8));
    const on = Math.floor(value / mask) % 2 === 1;
    this.z = !on;
    if (kind === 0) return;
    const off = on ? value - mask : value;
    this.set(p, size, kind === 1 ? (on ? off : value + mask) : kind === 2 ? off : off + mask);
  }

  /** The immediate group: logic, subtract, add and compare with an immediate, to an address or to the CCR. */
  private immediate(op: number, mode: number, reg: number) {
    const kind = (op >> 9) & 7;
    if ((op & 0xff) === 0x3c) {
      // ori, andi and eori to the CCR.
      const imm = this.fetch() & 0x1f;
      if (kind === 0) this.ccr = this.ccr | imm;
      else if (kind === 1) this.ccr = this.ccr & imm;
      else if (kind === 5) this.ccr = this.ccr ^ imm;
      else throw this.unknown();
      return;
    }
    const sizeBits = (op >> 6) & 3;
    if (sizeBits === 3) throw this.unknown();
    const size = ([BYTE, WORD, LONG] as const)[sizeBits]!;
    const imm = this.get(this.place(7, 4, size), size);
    const p = this.place(mode, reg, size);
    const value = this.get(p, size);
    switch (kind) {
      case 0:
      case 1:
      case 5: {
        const r = kind === 0 ? value | imm : kind === 1 ? value & imm : value ^ imm;
        this.set(p, size, r);
        this.logic(masked(r, size), size);
        return;
      }
      case 2:
      case 3:
        this.set(p, size, this.arithmetic(value, imm, size, kind === 2));
        return;
      case 6:
        this.arithmetic(value, imm, size, true, false);
        return;
    }
    throw this.unknown();
  }

  /** `and` and `or` between a data register and a place, either way. */
  private andOr(op: number, mode: number, reg: number, high: number, and: boolean) {
    const opmode = (op >> 6) & 7;
    const size = ([BYTE, WORD, LONG] as const)[opmode & 3]!;
    const p = this.place(mode, reg, size);
    const dn: Place = { kind: 'd', reg: high };
    const [to, from] = opmode & 4 ? [p, dn] : [dn, p];
    const a = this.get(to, size),
      b = this.get(from, size);
    const r = and ? a & b : a | b;
    this.set(to, size, r);
    this.logic(masked(r, size), size);
  }

  /** The shifts and rotations of a data register: arithmetic, logical, rotating through X or rotating, by a count or a register's. */
  private shift(op: number, reg: number, high: number, size: Size) {
    const type = (op >> 3) & 3;
    const count = op & 0x20 ? this.d[high]! & 63 : high || 8;
    const left = (op & 0x100) !== 0;
    const m = MASK[size],
      s = SIGN[size];
    let v = this.d[reg]! & m;
    v >>>= 0;
    let overflow = false;
    let carry = false;
    let extend = this.x;
    for (let i = 0; i < count; i++) {
      if (left) {
        carry = (v & s) !== 0;
        const next = ((v * 2) & m) >>> 0;
        if (type === 0 && (next & s) !== (v & s)) overflow = true;
        v = type === 3 ? (next | +carry) >>> 0 : type === 2 ? (next | +extend) >>> 0 : next;
      } else {
        carry = (v & 1) !== 0;
        const fill = type === 0 ? v & s : (type === 3 && carry) || (type === 2 && extend) ? s : 0;
        v = ((v >>> 1) | fill) >>> 0;
      }
      extend = carry;
    }
    this.set({ kind: 'd', reg }, size, v);
    this.n = (v & s) !== 0;
    this.z = (v & m) === 0;
    this.v = overflow;
    this.c = type === 2 && count === 0 ? this.x : count > 0 && carry;
    if (type !== 3 && count > 0) this.x = carry;
  }

  private step() {
    const at = this.pc;
    const op = this.fetch();
    const mode = (op >> 3) & 7,
      reg = op & 7,
      high = (op >> 9) & 7;
    const sizeOf = (bits: number): Size => {
      if (bits === 3) throw this.unknown();
      return ([BYTE, WORD, LONG] as const)[bits]!;
    };
    switch (op >> 12) {
      case 0x0: {
        if ((op & 0x138) === 0x108) throw this.unknown(); // movep
        if (op & 0x100) return this.bit((op >> 6) & 3, this.d[high]!, mode, reg);
        if ((op & 0xff00) === 0x0800) return this.bit((op >> 6) & 3, this.fetch() & 0xff, mode, reg);
        return this.immediate(op, mode, reg);
      }
      case 0x1:
      case 0x2:
      case 0x3: {
        const size = ({ 1: BYTE, 2: LONG, 3: WORD } as const)[(op >> 12) as 1 | 2 | 3];
        const value = this.get(this.place(mode, reg, size), size);
        const destMode = (op >> 6) & 7;
        if (destMode === 1) {
          this.a[high] = size === LONG ? value : signed(value, size);
          return;
        }
        this.set(this.place(destMode, high, size), size, value);
        this.logic(value, size);
        return;
      }
      case 0x4: {
        if (op === 0x4e75) {
          this.pc = this.pop();
          return;
        }
        if ((op & 0xfff0) === 0x4e40) {
          // trap: the program waits there, for its next frame or its system; the run ends.
          this.trapped = true;
          return;
        }
        if ((op & 0xfff8) === 0x4e50) {
          // link
          this.push(this.a[reg]!);
          this.a[reg] = this.a[7]!;
          this.a[7] = this.a[7]! + signed(this.fetch(), WORD);
          return;
        }
        if ((op & 0xfff8) === 0x4e58) {
          // unlk
          this.a[7] = this.a[reg]!;
          this.a[reg] = this.pop();
          return;
        }
        if ((op & 0x1c0) === 0x1c0) {
          this.a[high] = this.address(mode, reg); // lea
          return;
        }
        if ((op & 0xffc0) === 0x4ec0) {
          const target = this.address(mode, reg); // jmp
          this.pc = this.skip.has(target & 0xffffff) ? this.pop() : target;
          return;
        }
        if ((op & 0xffc0) === 0x4e80) return this.callTo(this.address(mode, reg)); // jsr
        if ((op & 0xfff8) === 0x4840) {
          const v = this.d[reg]!;
          this.d[reg] = ((v << 16) | (v >>> 16)) >>> 0;
          this.logic(this.d[reg]!, LONG);
          return;
        }
        if ((op & 0xffc0) === 0x4840) return this.push(this.address(mode, reg)); // pea
        if ((op & 0xfb80) === 0x4880 && mode !== 0) return this.moveMultiple(op, mode, reg);
        if ((op & 0xfff8) === 0x4880 || (op & 0xfff8) === 0x48c0) {
          const long = (op & 0x40) !== 0;
          const v = long ? signed(this.d[reg]!, WORD) : signed(this.d[reg]!, BYTE);
          this.set({ kind: 'd', reg }, long ? LONG : WORD, v);
          this.logic(v >>> 0, long ? LONG : WORD);
          return;
        }
        if ((op & 0xffc0) === 0x44c0) {
          this.ccr = this.get(this.place(mode, reg, WORD), WORD); // move to CCR
          return;
        }
        const size = sizeOf((op >> 6) & 3);
        const p = this.place(mode, reg, size);
        switch (op & 0xff00) {
          case 0x4200:
            this.set(p, size, 0);
            this.logic(0, size);
            return;
          case 0x4400:
            this.set(p, size, this.arithmetic(0, this.get(p, size), size, true));
            return;
          case 0x4600: {
            const r = ~this.get(p, size);
            this.set(p, size, r);
            this.logic(masked(r, size), size);
            return;
          }
          case 0x4a00:
            this.logic(this.get(p, size), size);
            return;
        }
        throw this.unknown();
      }
      case 0x5: {
        if ((op & 0xf8) === 0xc8) {
          // DBcc
          const base = this.pc;
          const displacement = signed(this.fetch(), WORD);
          if (this.condition((op >> 8) & 15)) return;
          const count = (this.d[reg]! - 1) & 0xffff;
          this.d[reg] = (this.d[reg]! & 0xffff0000) | count;
          if (count !== 0xffff) this.pc = base + displacement;
          return;
        }
        const size = sizeOf((op >> 6) & 3);
        const quick = high || 8;
        const p = this.place(mode, reg, size);
        if (p.kind === 'a') {
          this.a[reg] = this.a[reg]! + (op & 0x100 ? -quick : quick);
          return;
        }
        this.set(p, size, this.arithmetic(this.get(p, size), quick, size, (op & 0x100) !== 0));
        return;
      }
      case 0x6: {
        const base = this.pc;
        let displacement = signed(op, BYTE);
        if (displacement === 0) displacement = signed(this.fetch(), WORD);
        const code = (op >> 8) & 15;
        if (code === 1) return this.callTo(base + displacement); // bsr
        if (this.condition(code)) this.pc = base + displacement;
        return;
      }
      case 0x7: {
        if (op & 0x100) throw this.unknown();
        const v = signed(op, BYTE);
        this.d[high] = v >>> 0;
        this.logic(v >>> 0, LONG);
        return;
      }
      case 0x8: {
        if ((op & 0xc0) !== 0xc0) {
          if ((op & 0x1f0) === 0x100) return this.decimalOp(mode, reg, high, true);
          return this.andOr(op, mode, reg, high, false);
        }
        // divu.w and divs.w: the quotient toward 0, the remainder the dividend's sign; one past a word sets V alone
        const s = (op & 0x100) !== 0;
        const word = this.get(this.place(mode, reg, WORD), WORD);
        const divisor = s ? signed(word, WORD) : word;
        if (divisor === 0) throw romDiffers(`A divide by 0 at 0x${at.toString(16)}`);
        const dividend = s ? this.d[high]! | 0 : this.d[high]!;
        const quotient = Math.trunc(dividend / divisor);
        if (s ? quotient < -0x8000 || quotient > 0x7fff : quotient > 0xffff) {
          this.v = true;
          this.c = false;
          return;
        }
        this.d[high] = ((((dividend % divisor) & 0xffff) << 16) | (quotient & 0xffff)) >>> 0;
        this.logic(quotient & 0xffff, WORD);
        return;
      }
      case 0xc: {
        if ((op & 0x1f0) === 0x100) return this.decimalOp(mode, reg, high, false);
        if ((op & 0x1f8) === 0x140 || (op & 0x1f8) === 0x148 || (op & 0x1f8) === 0x188) {
          // exg
          const [x, y] =
            (op & 0x1f8) === 0x140 ? [high, reg] : (op & 0x1f8) === 0x148 ? [high + 8, reg + 8] : [high, reg + 8];
          const vx = this.listed(x);
          this.setListed(x, this.listed(y));
          this.setListed(y, vx);
          return;
        }
        if ((op & 0xc0) !== 0xc0) return this.andOr(op, mode, reg, high, true);
        // mulu.w and muls.w
        const s = (op & 0x100) !== 0;
        const x = this.get(this.place(mode, reg, WORD), WORD);
        const y = this.d[high]! & 0xffff;
        const r = s ? signed(x, WORD) * signed(y, WORD) : x * y;
        this.d[high] = r >>> 0;
        this.logic(r >>> 0, LONG);
        return;
      }
      case 0x9:
      case 0xb:
      case 0xd: {
        const opmode = (op >> 6) & 7;
        const kind = op >> 12;
        if (opmode === 3 || opmode === 7) {
          // adda, suba, cmpa
          const size = opmode === 3 ? WORD : LONG;
          const v = signed(this.get(this.place(mode, reg, size), size), size);
          if (kind === 0xb) this.arithmetic(this.a[high]!, v >>> 0, LONG, true, false);
          else this.a[high] = this.a[high]! + (kind === 0x9 ? -v : v);
          return;
        }
        const size = sizeOf(opmode & 3);
        const p = this.place(mode, reg, size);
        const dn: Place = { kind: 'd', reg: high };
        if (kind === 0xb) {
          if (opmode & 4) {
            // eor Dn,<ea> (cmpm, of mode 1, is not run)
            if (mode === 1) throw this.unknown();
            const r = this.get(p, size) ^ this.get(dn, size);
            this.set(p, size, r);
            this.logic(masked(r, size), size);
            return;
          }
          this.arithmetic(this.get(dn, size), this.get(p, size), size, true, false);
          return;
        }
        const [to, from] = opmode & 4 ? [p, dn] : [dn, p];
        this.set(to, size, this.arithmetic(this.get(to, size), this.get(from, size), size, kind === 0x9));
        return;
      }
      case 0xe: {
        if ((op & 0xc0) === 0xc0) throw this.unknown();
        return this.shift(op, reg, high, sizeOf((op >> 6) & 3));
      }
    }
    throw this.unknown();
  }
}
