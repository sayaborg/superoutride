import assert from 'node:assert/strict';
import test from 'node:test';
import { Cpu68000 } from '../../tools/road-data/cpu/cpu-68000.ts';

const RAM = 0x10000;
const X = 16,
  N = 8,
  Z = 4,
  V = 2,
  C = 1;

/** A CPU over `words` from address 0, a 4 KiB RAM at 0x10000 and the `regions` beside it. */
function cpuOf(words, regions = []) {
  const program = new Uint8Array(0x400);
  words.forEach((w, i) => {
    program[2 * i] = w >> 8;
    program[2 * i + 1] = w & 0xff;
  });
  return new Cpu68000(program, new Uint8Array(0x1000), RAM, regions);
}

/** `words` run from 0 with `before` set; the CPU after. */
function run(words, before = () => {}, options = {}, regions = []) {
  const cpu = cpuOf(words, regions);
  before(cpu);
  cpu.call(0, options);
  return cpu;
}

const RTS = 0x4e75;

test('immediate logic sets N and Z, clears V and C and keeps X; to the CCR it changes the flags alone', () => {
  let cpu = run([0x0240, 0x00f0, RTS], (c) => {
    c.d[0] = 0xffff1234;
    c.ccr = X | C | V;
  });
  assert.equal(cpu.d[0], 0xffff0030); // andi.w #$F0,D0
  assert.equal(cpu.ccr, X);
  cpu = run([0x0001, 0x0080, RTS]);
  assert.equal(cpu.d[1], 0x80); // ori.b #$80,D1
  assert.equal(cpu.ccr, N);
  cpu = run([0x0a42, 0xffff, RTS], (c) => (c.d[2] = 0xff));
  assert.equal(cpu.d[2], 0xff00); // eori.w #$FFFF,D2
  assert.equal(cpu.ccr, N);
  cpu = run([0x023c, 0x0011, 0x003c, 0x0004, RTS], (c) => (c.ccr = X | N | C));
  assert.equal(cpu.ccr, X | Z | C); // andi #$11,CCR then ori #4,CCR
});

test('and, or and not between registers and memory', () => {
  let cpu = run([0xc041, RTS], (c) => {
    c.d[0] = 0xff0f;
    c.d[1] = 0x0ff0;
  });
  assert.equal(cpu.d[0], 0x0f00); // and.w D1,D0
  cpu = run([0x8190, 0x2010, RTS], (c) => {
    c.d[0] = 0xf0;
    c.a[0] = RAM;
    c.ramWrite(0, 4, 0x0f0f0000);
  });
  assert.equal(cpu.ramRead(0, 4), 0x0f0f00f0); // or.l D0,(A0)
  assert.equal(cpu.d[0], 0x0f0f00f0); // move.l (A0),D0
  cpu = run([0x4603, RTS], (c) => (c.d[3] = 0x0f));
  assert.equal(cpu.d[3], 0xf0); // not.b D3
  assert.equal(cpu.ccr, N);
});

test("bit tests and changes set Z from the bit before, a register's modulo 32 and memory's modulo 8", () => {
  let cpu = run([0x0800, 0x0003, RTS], (c) => (c.d[0] = 8));
  assert.equal(cpu.ccr & Z, 0); // btst #3,D0
  cpu = run([0x0800, 0x0004, RTS], (c) => (c.d[0] = 8));
  assert.equal(cpu.ccr & Z, Z);
  cpu = run([0x08c1, 0x001f, RTS]);
  assert.equal(cpu.d[1], 0x80000000); // bset #31,D1
  assert.equal(cpu.ccr & Z, Z);
  cpu = run([0x0890, 0x0008, RTS], (c) => {
    c.a[0] = RAM;
    c.ramWrite(0, 2, 0x0100);
  });
  assert.equal(cpu.ramRead(0, 2), 0x0000); // bclr #8,(A0): bit 0 of the byte
  assert.equal(cpu.ccr & Z, 0);
  cpu = run([0x0500, RTS], (c) => {
    c.d[0] = 2;
    c.d[2] = 33;
  });
  assert.equal(cpu.ccr & Z, 0); // btst D2,D0: bit 1
  cpu = run([0x0841, 0x0000, RTS], (c) => (c.d[1] = 1));
  assert.equal(cpu.d[1], 0); // bchg #0,D1
});

test('logical shifts set C and X from the last bit out; rotations set C and keep X', () => {
  let cpu = run([0xe948, RTS], (c) => (c.d[0] = 0x1234));
  assert.equal(cpu.d[0], 0x2340); // lsl.w #4,D0
  assert.equal(cpu.ccr, X | C);
  cpu = run([0xe289, RTS], (c) => (c.d[1] = 0x80000001));
  assert.equal(cpu.d[1], 0x40000000); // lsr.l #1,D1
  assert.equal(cpu.ccr, X | C);
  cpu = run([0xe35a, RTS], (c) => (c.d[2] = 0x8001));
  assert.equal(cpu.d[2], 0x0003); // rol.w #1,D2
  assert.equal(cpu.ccr, C);
  cpu = run([0xe85b, RTS], (c) => {
    c.d[3] = 0x1234;
    c.ccr = X;
  });
  assert.equal(cpu.d[3], 0x4123); // ror.w #4,D3
  assert.equal(cpu.ccr, X);
  cpu = run([0xe168, RTS], (c) => {
    c.d[0] = 1;
    c.ccr = X | C;
  });
  assert.equal(cpu.ccr & C, 0); // lsl.w D0,D0 by a register's count: 1 << 1 = 2, nothing out
  assert.equal(cpu.d[0], 2);
});

test('rotations through X take X in and give the bit out to C and X', () => {
  let cpu = run([0xe251, RTS], (c) => {
    c.d[1] = 0x0002;
    c.ccr = X;
  });
  assert.equal(cpu.d[1], 0x8001); // roxr.w #1,D1
  assert.equal(cpu.ccr, N);
  cpu = run([0xe352, RTS], (c) => {
    c.d[2] = 0x8000;
    c.ccr = 0;
  });
  assert.equal(cpu.d[2], 0x0000); // roxl.w #1,D2
  assert.equal(cpu.ccr, X | Z | C);
});

test('adds and subtracts set X as C; compares keep X', () => {
  const cpu = run([0x70ff, 0x5280, 0x0c80, 0x0000, 0x0001, RTS]);
  // moveq #-1,D0; addq.l #1,D0 (C and X); cmpi.l #1,D0 (borrow: C, X kept)
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.ccr, X | N | C);
});

test('abcd adds decimal digits and X, between registers and from -(Ay) to -(Ax)', () => {
  let cpu = run([0xc101, RTS], (c) => {
    c.d[0] = 0x45;
    c.d[1] = 0x38;
    c.ccr = Z;
  });
  assert.equal(cpu.d[0], 0x83); // abcd D1,D0
  assert.equal(cpu.ccr, 0);
  cpu = run([0xc101, RTS], (c) => {
    c.d[0] = 0x55;
    c.d[1] = 0x44;
    c.ccr = X | Z;
  });
  assert.equal(cpu.d[0], 0x00);
  assert.equal(cpu.ccr, X | Z | C);
  cpu = run([0xc109, 0xc109, RTS], (c) => {
    c.a[0] = RAM + 2;
    c.a[1] = RAM + 6;
    c.ramWrite(0, 2, 0x1999);
    c.ramWrite(4, 2, 0x0001);
    c.ccr = Z;
  });
  assert.equal(cpu.ramRead(0, 2), 0x2000); // two digits' pairs, the carry through X
  assert.equal(cpu.ccr & Z, 0);
});

test('sbcd subtracts decimal digits and X, between registers and from -(Ay) to -(Ax)', () => {
  let cpu = run([0x8101, RTS], (c) => {
    c.d[0] = 0x45;
    c.d[1] = 0x38;
    c.ccr = Z;
  });
  assert.equal(cpu.d[0], 0x07); // sbcd D1,D0
  assert.equal(cpu.ccr, 0);
  cpu = run([0x8101, RTS], (c) => {
    c.d[0] = 0x00;
    c.d[1] = 0x00;
    c.ccr = X | Z;
  });
  assert.equal(cpu.d[0], 0x99); // 0 − 0 − X borrows
  assert.equal(cpu.ccr, X | C);
  cpu = run([0x8109, 0x8109, RTS], (c) => {
    c.a[0] = RAM + 2;
    c.a[1] = RAM + 6;
    c.ramWrite(0, 2, 0x2000);
    c.ramWrite(4, 2, 0x0001);
    c.ccr = Z;
  });
  assert.equal(cpu.ramRead(0, 2), 0x1999); // two digits' pairs, the borrow through X
});

test('eor of a data register into a register or memory sets N and Z and clears V and C', () => {
  let cpu = run([0xb340, RTS], (c) => {
    c.d[0] = 0xffff00ff;
    c.d[1] = 0x12340f0f;
    c.ccr = X | V | C;
  });
  assert.equal(cpu.d[0], 0xffff0ff0); // eor.w D1,D0
  assert.equal(cpu.ccr, X);
  cpu = run([0xb190, RTS], (c) => {
    c.d[0] = 0x80000001;
    c.a[0] = RAM;
    c.ramWrite(0, 4, 0x00000001);
  });
  assert.equal(cpu.ramRead(0, 4), 0x80000000); // eor.l D0,(A0)
  assert.equal(cpu.ccr, N);
});

test('exg swaps data, address and mixed registers', () => {
  const cpu = run([0xc141, 0xc149, 0xc189, RTS], (c) => {
    c.d[0] = 1;
    c.d[1] = 2;
    c.a[0] = 3;
    c.a[1] = 4;
  });
  // exg D0,D1; exg A0,A1; exg D0,A1
  assert.deepEqual([cpu.d[0], cpu.d[1], cpu.a[0], cpu.a[1]], [3, 1, 4, 2]);
});

test('calls return; a call to a routine to skip returns at once', () => {
  let cpu = run([0x6100, 0x0004, RTS, 0x7005, RTS]);
  assert.equal(cpu.d[0], 5); // bsr.w to moveq #5,D0
  cpu = run([0x4eb9, 0x0000, 0x0008, RTS, 0x7007, RTS]);
  assert.equal(cpu.d[0], 7); // jsr $8.l
  cpu = run([0x4eba, 0x0004, RTS, 0x7009, RTS]);
  assert.equal(cpu.d[0], 9); // jsr (6,PC)
  cpu = run([0x4eb9, 0x0000, 0x0008, RTS, 0x7007, RTS], () => {}, { skip: new Set([8]) });
  assert.equal(cpu.d[0], 0);
});

test('movem stores a list down from -(An) and loads it up from (An)+, words signed', () => {
  let cpu = run([0x48e7, 0xc080, 0x4cdf, 0x020c, RTS], (c) => {
    c.d[0] = 0x11111111;
    c.d[1] = 0x22222222;
    c.a[0] = 0x33333333;
  });
  assert.deepEqual([cpu.d[2], cpu.d[3], cpu.a[1]], [0x11111111, 0x22222222, 0x33333333]);
  cpu = run([0x4c90, 0x0030, RTS], (c) => {
    c.a[0] = RAM;
    c.ramWrite(0, 2, 0x8000);
    c.ramWrite(2, 2, 0x0001);
  });
  assert.deepEqual([cpu.d[4], cpu.d[5]], [0xffff8000, 1]);
});

test('link and unlk make and drop a frame; pea pushes an address; a trap ends the run', () => {
  let cpu = run([0x4e56, 0xfff8, 0x2d40, 0xfffc, 0x222e, 0xfffc, 0x4e5e, RTS], (c) => (c.d[0] = 42));
  // link A6,#-8; move.l D0,-4(A6); move.l -4(A6),D1; unlk A6
  assert.equal(cpu.d[1], 42);
  assert.equal(cpu.a[6], 0);
  cpu = run([0x4850, 0x201f, RTS], (c) => (c.a[0] = 0x1234));
  assert.equal(cpu.d[0], 0x1234); // pea (A0); move.l (A7)+,D0
  cpu = run([0x7001, 0x4e45, 0x7002, RTS]);
  assert.equal(cpu.d[0], 1); // trap #5
});

test('a call takes its A5, A6 and stack; move to CCR sets every flag; regions beside the RAM are written', () => {
  const shared = { start: 0x20000, bytes: new Uint8Array(16) };
  const cpu = run([0x2b4e, 0x0000, 0x44fc, 0x001f, RTS], () => {}, { a5: 0x20000, a6: 0xabcdef, stack: RAM + 0x800 }, [
    shared,
  ]);
  // move.l A6,0(A5); move #$1F,CCR
  assert.deepEqual([...shared.bytes.slice(0, 4)], [0x00, 0xab, 0xcd, 0xef]);
  assert.equal(cpu.ccr, X | N | Z | V | C);
  assert.equal(cpu.a[7], RAM + 0x800);
});
