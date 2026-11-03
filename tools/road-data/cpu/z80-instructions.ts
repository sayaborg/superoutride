/**
 * A Z80 instruction read from a program at an address, as Zilog's Z80 CPU User Manual encodes it: its bytes, its
 * mnemonic and its operands in Zilog's syntax, for the research listings
 * ([Research tools](../../../docs/development.md#research-tools)). Every documented instruction is read, the IX and IY
 * halves too; a byte no instruction begins with, or a prefix that changes nothing, is a byte of data (`dc.b`).
 */

/** An instruction read: its bytes, mnemonic and operands (`$` hexadecimal, a branch's target absolute). */
export interface Instruction {
  readonly length: number;
  readonly mnemonic: string;
  readonly operands: string;
}

const R = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'] as const;
const RP = ['bc', 'de', 'hl', 'sp'] as const;
const RP2 = ['bc', 'de', 'hl', 'af'] as const;
const CC = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'] as const;
const ALU = ['add a,', 'adc a,', 'sub ', 'sbc a,', 'and ', 'xor ', 'or ', 'cp '] as const;
const ROT = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'] as const;
const ACC = ['rlca', 'rrca', 'rla', 'rra', 'daa', 'cpl', 'scf', 'ccf'] as const;
const IM = ['0', '0', '1', '2', '0', '0', '1', '2'] as const;
const BLOCK = [
  ['ldi', 'cpi', 'ini', 'outi'],
  ['ldd', 'cpd', 'ind', 'outd'],
  ['ldir', 'cpir', 'inir', 'otir'],
  ['lddr', 'cpdr', 'indr', 'otdr'],
] as const;

export const hex = (value: number) => `$${value.toString(16)}`;

/** A byte of data: what no instruction begins with. */
const data = (): Instruction => ({ length: 1, mnemonic: 'dc.b', operands: '' });

/** The Z80 instruction at `address` of `program` (its byte 0 at address 0). */
export function decodeZ80(program: Uint8Array, address: number): Instruction {
  const at = (a: number) => program[a & 0xffff] ?? 0;
  const first = at(address);
  if (first === 0xcb) return bitwise(at(address + 1), '(hl)', 2);
  if (first === 0xed) return extended(at, address);
  if (first === 0xdd || first === 0xfd) return indexed(at, address, first === 0xdd ? 'ix' : 'iy') ?? data();
  return main(at, address, null) ?? data();
}

/** A CB instruction on the registers, `memory` its (hl) operand, `length` its bytes. */
function bitwise(op: number, memory: string, length: number): Instruction {
  const [x, y, z] = [op >> 6, (op >> 3) & 7, op & 7];
  const r = z === 6 ? memory : R[z]!;
  if (x === 0) return { length, mnemonic: ROT[y]!, operands: r };
  return { length, mnemonic: ['', 'bit', 'res', 'set'][x]!, operands: `${y},${r}` };
}

/** An ED instruction. */
function extended(at: (a: number) => number, address: number): Instruction {
  const op = at(address + 1);
  const [x, y, z, p, q] = [op >> 6, (op >> 3) & 7, op & 7, (op >> 4) & 3, (op >> 3) & 1];
  const nn = () => hex(at(address + 2) | (at(address + 3) << 8));
  const two = (mnemonic: string, operands = ''): Instruction => ({ length: 2, mnemonic, operands });
  if (x === 1) {
    if (z === 0) return two('in', y === 6 ? '(c)' : `${R[y]},(c)`);
    if (z === 1) return two('out', `(c),${y === 6 ? '0' : R[y]}`);
    if (z === 2) return two(q ? 'adc' : 'sbc', `hl,${RP[p]}`);
    if (z === 3) return { length: 4, mnemonic: 'ld', operands: q ? `${RP[p]},(${nn()})` : `(${nn()}),${RP[p]}` };
    if (z === 4) return two('neg');
    if (z === 5) return two(y === 1 ? 'reti' : 'retn');
    if (z === 6) return two('im', IM[y]);
    return (
      [two('ld', 'i,a'), two('ld', 'r,a'), two('ld', 'a,i'), two('ld', 'a,r'), two('rrd'), two('rld')][y] ?? data()
    );
  }
  if (x === 2 && z <= 3 && y >= 4) return two(BLOCK[y - 4]![z]!);
  return data();
}

/** A DD or FD instruction: the unprefixed one with `index` for hl, or null where the prefix changes nothing. */
function indexed(at: (a: number) => number, address: number, index: 'ix' | 'iy'): Instruction | null {
  const op = at(address + 1);
  if (op === 0xcb) {
    const d = (at(address + 2) << 24) >> 24;
    const b = bitwise(at(address + 3), `(${index}${d < 0 ? '-' : '+'}${hex(Math.abs(d))})`, 4);
    // Every DDCB instruction but those on (ix+d) itself also loads a register: undocumented, read as data.
    return (at(address + 3) & 7) === 6 ? b : null;
  }
  const inner = main(at, address + 1, index);
  return inner && { ...inner, length: inner.length + 1 };
}

/** An unprefixed instruction, `index` replacing hl where a DD or FD prefix stands before it; null if it is none. */
function main(at: (a: number) => number, address: number, index: 'ix' | 'iy' | null): Instruction | null {
  const op = at(address);
  const [x, y, z, p, q] = [op >> 6, (op >> 3) & 7, op & 7, (op >> 4) & 3, (op >> 3) & 1];
  // Under a prefix, (hl) is (ix+d), its displacement next; h and l are the index's halves where (hl) is not used.
  const memory =
    index !== null &&
    ((x === 1 && (y === 6) !== (z === 6)) || (x === 2 && z === 6) || (x === 0 && z >= 4 && z <= 6 && y === 6));
  let length = 1;
  let replaced = false;
  let displacement = '';
  if (memory) {
    const d = (at(address + 1) << 24) >> 24;
    displacement = `(${index}${d < 0 ? '-' : '+'}${hex(Math.abs(d))})`;
    length = 2;
  }
  const n = () => hex(at(address + length++));
  const nn = () => {
    const v = at(address + length) | (at(address + length + 1) << 8);
    length += 2;
    return hex(v);
  };
  const relative = () => {
    const d = (at(address + length++) << 24) >> 24;
    return hex((address + length + d) & 0xffff);
  };
  const r = (i: number) => {
    if (index === null || (i !== 4 && i !== 5 && i !== 6)) return R[i]!;
    if (i === 6) return ((replaced = true), displacement);
    if (memory) return R[i]!;
    return ((replaced = true), `${index}${i === 4 ? 'h' : 'l'}`);
  };
  const hl = (name: string) => (index !== null && name === 'hl' ? ((replaced = true), index) : name);
  const done = (mnemonic: string, operands = ''): Instruction | null =>
    index !== null && !replaced ? null : { length, mnemonic, operands };

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return done('nop');
      if (y === 1) return done('ex', "af,af'");
      if (y === 2) return done('djnz', relative());
      if (y === 3) return done('jr', relative());
      return done('jr', `${CC[y - 4]},${relative()}`);
    }
    if (z === 1) return q ? done('add', `${hl('hl')},${hl(RP[p]!)}`) : done('ld', `${hl(RP[p]!)},${nn()}`);
    if (z === 2) {
      const place = [`(bc)`, `(de)`, '', ''][p]!;
      if (p < 2) return done('ld', q ? `a,${place}` : `${place},a`);
      const where = `(${nn()})`;
      const reg = p === 2 ? hl('hl') : 'a';
      return done('ld', q ? `${reg},${where}` : `${where},${reg}`);
    }
    if (z === 3) return done(q ? 'dec' : 'inc', hl(RP[p]!));
    if (z === 4) return done('inc', r(y));
    if (z === 5) return done('dec', r(y));
    if (z === 6) {
      const target = r(y);
      return done('ld', `${target},${n()}`);
    }
    return done(ACC[y]!);
  }
  if (x === 1) {
    if (y === 6 && z === 6) return done('halt');
    return done('ld', `${r(y)},${r(z)}`);
  }
  if (x === 2) {
    const alu = ALU[y]!;
    const [mnemonic, prefix] = alu.includes(',') ? [alu.slice(0, 3), 'a,'] : [alu.trim(), ''];
    return done(mnemonic, `${prefix}${r(z)}`);
  }
  if (z === 0) return done('ret', CC[y]);
  if (z === 1) {
    if (!q) return done('pop', hl(RP2[p]!));
    if (p === 0) return done('ret');
    if (p === 1) return done('exx');
    return p === 2 ? done('jp', `(${hl('hl')})`) : done('ld', `sp,${hl('hl')}`);
  }
  if (z === 2) return done('jp', `${CC[y]},${nn()}`);
  if (z === 3) {
    if (y === 0) return done('jp', nn());
    if (y === 1) return null;
    if (y === 2) return done('out', `(${n()}),a`);
    if (y === 3) return done('in', `a,(${n()})`);
    if (y === 4) return done('ex', `(sp),${hl('hl')}`);
    if (y === 5) return done('ex', 'de,hl');
    return done(y === 6 ? 'di' : 'ei');
  }
  if (z === 4) return done('call', `${CC[y]},${nn()}`);
  if (z === 5) {
    if (!q) return done('push', hl(RP2[p]!));
    return p === 0 ? done('call', nn()) : null;
  }
  if (z === 6) {
    const alu = ALU[y]!;
    const [mnemonic, prefix] = alu.includes(',') ? [alu.slice(0, 3), 'a,'] : [alu.trim(), ''];
    return done(mnemonic, `${prefix}${n()}`);
  }
  return done('rst', hex(y * 8));
}
