/**
 * A 68000 running a routine of a program as its CPU does, for the research commands that check a model against the
 * original's own code ([Development](../../docs/development.md#road-data-commands)): the program read-only from address
 * 0, a work RAM, and the instructions the heights' procedure uses (moves, adds, subtracts, compares, multiplies, the
 * unsigned divide, shifts, branches, jumps through tables and returns) with their condition codes (no X: none of them reads it). Any other
 * instruction, an odd word access or a write outside the RAM is an error: the routine is not one this CPU runs.
 */

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

/** A value's `size` bytes, unsigned; and signed. */
const masked = (v: number, size: Size) => (size === LONG ? v >>> 0 : v & MASK[size]);
const signed = (v: number, size: Size) =>
  size === LONG ? v | 0 : v & SIGN[size] ? (v & MASK[size]) - 2 * SIGN[size] : v & MASK[size];

export class Cpu68000 {
  readonly d = new Uint32Array(8);
  readonly a = new Uint32Array(8);
  private pc = 0;
  private n = false;
  private z = false;
  private v = false;
  private c = false;

  /** The CPU over `program` (read-only from 0) and `ram` (from `ramStart`), its stack at the RAM's top. */
  constructor(
    private readonly program: Uint8Array,
    readonly ram: Uint8Array,
    private readonly ramStart: number,
  ) {}

  /** Runs the routine at `address` until it returns, A5 the RAM's start (the sub program's base register). */
  call(address: number) {
    this.a[5] = this.ramStart;
    this.a[7] = this.ramStart + this.ram.length - 4;
    this.write(this.a[7]!, LONG, RETURNED);
    this.pc = address;
    for (let count = 0; this.pc !== RETURNED; count++) {
      if (count >= MOST_INSTRUCTIONS) throw new Error(`The routine at 0x${address.toString(16)} does not return`);
      this.step();
    }
  }

  /** A RAM word or long, unsigned, at its offset; and one written. */
  ramRead(offset: number, size: Size) {
    return this.read(this.ramStart + offset, size);
  }
  ramWrite(offset: number, size: Size, value: number) {
    this.write(this.ramStart + offset, size, value);
  }

  private inRam(address: number, size: Size) {
    return address >= this.ramStart && address + size <= this.ramStart + this.ram.length;
  }

  private read(address: number, size: Size): number {
    address &= 0xffffff;
    if (size !== BYTE && address & 1)
      throw new Error(`An odd ${size === WORD ? 'word' : 'long'} read at 0x${address.toString(16)}`);
    const [memory, at] = this.inRam(address, size)
      ? [this.ram, address - this.ramStart]
      : address + size <= this.program.length
        ? [this.program, address]
        : (() => {
            throw new Error(`A read outside the program and the RAM at 0x${address.toString(16)}`);
          })();
    let value = 0;
    for (let i = 0; i < size; i++) value = value * 256 + memory[at + i]!;
    return value;
  }

  private write(address: number, size: Size, value: number) {
    address &= 0xffffff;
    if (size !== BYTE && address & 1) throw new Error(`An odd write at 0x${address.toString(16)}`);
    if (!this.inRam(address, size)) throw new Error(`A write outside the RAM at 0x${address.toString(16)}`);
    const at = address - this.ramStart;
    for (let i = size - 1; i >= 0; i--) {
      this.ram[at + i] = value & 0xff;
      value = Math.floor(value / 256);
    }
  }

  private fetch(): number {
    const w = this.read(this.pc, WORD);
    this.pc += 2;
    return w;
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

  /** N and Z of a result, V and C cleared (moves, logic, multiplies). */
  private logic(value: number, size: Size) {
    this.n = (value & SIGN[size]) !== 0;
    this.z = masked(value, size) === 0;
    this.v = this.c = false;
  }

  /** `a + b` (or `a − b`) and its flags. */
  private arithmetic(a: number, b: number, size: Size, subtract: boolean): number {
    const m = MASK[size],
      s = SIGN[size];
    const full = subtract ? masked(a, size) - masked(b, size) : masked(a, size) + masked(b, size);
    const r = masked(full, size);
    this.n = (r & s) !== 0;
    this.z = r === 0;
    this.c = subtract ? full < 0 : full > m;
    this.v = subtract ? ((a ^ b) & (a ^ r) & s) !== 0 : (~(a ^ b) & (a ^ r) & s) !== 0;
    return r;
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
    return new Error(`An instruction this CPU does not run at 0x${(this.pc - 2).toString(16)}`);
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
        // Immediate subtract, add and compare.
        const kind = (op >> 9) & 7;
        const size = sizeOf((op >> 6) & 3);
        if (op & 0x100 || ![2, 3, 6].includes(kind)) throw this.unknown();
        const imm = this.get(this.place(7, 4, size), size);
        const p = this.place(mode, reg, size);
        const value = this.get(p, size);
        if (kind === 6) this.arithmetic(value, imm, size, true);
        else this.set(p, size, this.arithmetic(value, imm, size, kind === 2));
        return;
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
          this.pc = this.read(this.a[7]!, LONG);
          this.a[7] = this.a[7]! + 4;
          return;
        }
        if ((op & 0x1c0) === 0x1c0) {
          // lea
          const p = this.place(mode, reg, LONG);
          if (p.kind !== 'm') throw this.unknown();
          this.a[high] = p.address;
          return;
        }
        if ((op & 0xffc0) === 0x4ec0) {
          const p = this.place(mode, reg, LONG);
          if (p.kind !== 'm') throw this.unknown();
          this.pc = p.address;
          return;
        }
        if ((op & 0xfff8) === 0x4840) {
          const v = this.d[reg]!;
          this.d[reg] = ((v << 16) | (v >>> 16)) >>> 0;
          this.logic(this.d[reg]!, LONG);
          return;
        }
        if ((op & 0xfff8) === 0x4880 || (op & 0xfff8) === 0x48c0) {
          const long = (op & 0x40) !== 0;
          const v = long ? signed(this.d[reg]!, WORD) : signed(this.d[reg]!, BYTE);
          this.set({ kind: 'd', reg }, long ? LONG : WORD, v);
          this.logic(v >>> 0, long ? LONG : WORD);
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
        if (code === 1) throw this.unknown();
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
        if ((op & 0x1c0) !== 0xc0) throw this.unknown();
        // divu.w
        const divisor = this.get(this.place(mode, reg, WORD), WORD);
        if (divisor === 0) throw new Error(`A divide by 0 at 0x${at.toString(16)}`);
        const dividend = this.d[high]!;
        const quotient = Math.floor(dividend / divisor);
        if (quotient > 0xffff) {
          this.v = true;
          this.c = false;
          return;
        }
        this.d[high] = (((dividend % divisor) << 16) | quotient) >>> 0;
        this.logic(quotient, WORD);
        return;
      }
      case 0xc: {
        if ((op & 0xc0) !== 0xc0) throw this.unknown();
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
          if (kind === 0xb) this.arithmetic(this.a[high]!, v >>> 0, LONG, true);
          else this.a[high] = this.a[high]! + (kind === 0x9 ? -v : v);
          return;
        }
        const size = sizeOf(opmode & 3);
        const p = this.place(mode, reg, size);
        const dn: Place = { kind: 'd', reg: high };
        if (kind === 0xb) {
          if (opmode & 4) throw this.unknown();
          this.arithmetic(this.get(dn, size), this.get(p, size), size, true);
          return;
        }
        const [to, from] = opmode & 4 ? [p, dn] : [dn, p];
        this.set(to, size, this.arithmetic(this.get(to, size), this.get(from, size), size, kind === 0x9));
        return;
      }
      case 0xe: {
        if ((op & 0xc0) === 0xc0 || (op & 0x18) >> 3 !== 0) throw this.unknown();
        // asl and asr, by a count or a register's.
        const size = sizeOf((op >> 6) & 3);
        const count = op & 0x20 ? this.d[high]! & 63 : high || 8;
        const left = (op & 0x100) !== 0;
        const m = MASK[size],
          s = SIGN[size];
        let v = this.d[reg]! & m;
        let overflow = false;
        this.c = false;
        for (let i = 0; i < count; i++) {
          if (left) {
            this.c = (v & s) !== 0;
            const next = (v * 2) & m;
            if ((next & s) !== (v & s)) overflow = true;
            v = next >>> 0;
          } else {
            this.c = (v & 1) !== 0;
            v = ((v >>> 1) | (v & s)) >>> 0;
          }
        }
        this.set({ kind: 'd', reg }, size, v);
        this.n = (v & s) !== 0;
        this.z = v === 0;
        this.v = overflow;
        return;
      }
    }
    throw this.unknown();
  }
}
