import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ciscoHeatDescriptor,
  ciscoHeatObjects,
  ciscoHeatPlace,
  ciscoHeatSpritePalette,
  objectScales,
  spritePixelUnits,
} from '../../tools/road-data/cisco-heat/cisco-heat-objects.ts';

/** A main program with its objects' routines and tables at the addresses CISCO HEAT's has: stage 1's list given. */
function program(records) {
  const main = new Uint8Array(0x130000);
  const put = (at, words) => words.forEach((w, i) => ((main[at + 2 * i] = w >> 8), (main[at + 2 * i + 1] = w & 0xff)));
  const long = (at, v) => put(at, [v >>> 16, v & 0xffff]);
  put(0xdaf2, [0x41fa, 0xd000 - 0xdaf4]); // lea $d000(pc), a0
  put(0xddfe, [0x206e, 0x000c]); // movea.l $c(a6), a0
  put(0xe0f0, [0x3c28, 0x000c]); // move.w $c(a0), d6
  put(0xe27e, [0x43f9, 0x0010, 0x9c68]); // lea $109c68, a1
  put(0xe288, [0x43f9, 0x0012, 0x2272]); // lea $122272, a1
  put(0xe296, [0x3606, 0x0283, 0x0000, 0x7000]); // move.w d6, d3; andi.l #$7000, d3
  put(0xe2a2, [0x43fa, 0xe358 - 0xe2a4]); // lea $e358(pc), a1
  put(0xe2ee, [0x3028, 0x0006, 0x0240, 0x00ff]); // move.w 6(a0), d0; andi.w #$ff, d0
  put(0xe398, [0x43f9, 0x0004, 0x0000, 0xd2e8, 0x0004]); // lea $40000, a1; adda.w 4(a0), a1
  put(0xe3a6, [0x3d69, 0x0004, 0x0010, 0x3b69, 0x0006, 0x000c]); // the descriptor's size and tile
  put(0xe5b4, [0x4a06, 0x6b00]); // tst.b d6; bmi
  put(0xe616, [0x3a28, 0x0008]); // move.w 8(a0), d5
  put(0xe746, [0x3a28, 0x000a, 0x0806, 0x000a]); // move.w $a(a0), d5; btst #10, d6
  put(0xe766, [0x4442, 0x0642, 0x00e8]); // neg.w d2; addi.w #$e8, d2
  put(0xe2d4, [0x0806, 0x0008]); // btst #8, d6
  put(0xe3a2, [0x2d51, 0x00a0]); // move.l (a1), $a0(a6)
  put(0xe3b2, [0x3d69, 0x0008, 0x00a4]); // move.w 8(a1), $a4(a6)
  put(0xe8d8, [0x4a6e, 0x00a4]); // tst.w $a4(a6)
  put(0xe8f4, [0x302e, 0x00a0, 0xb06e, 0x00a2]); // move.w $a0(a6), d0; cmp.w $a2(a6), d0
  put(0xe900, [0x4a68, 0x000a]); // tst.w $a(a0)
  // The scales: 1/2, then 1, by their halves' words.
  put(0xe358, [0, 1, 0, 0]);
  put(0xe358 + 8 * 3, [1, 0, 0, 0]);
  // At distance 0 a zoom of 255 and a road's scale of 32,767.
  put(0x122272, [255]);
  put(0x109c68, [32767]);
  // A descriptor 2 tiles across and 6 down from tile 0x186B, meeting the car between its columns 6 and 24.
  put(0x40000 + 0x10, [6, 24, 0x51, 0x186b, 1]);
  long(0xd000 + 4, 0x50000); // stage 2's list
  records.forEach((r, k) => {
    long(0x50000 + 16 * k, r.position);
    put(0x50000 + 16 * k + 4, [r.descriptor, r.kind, r.lateral & 0xffff, r.height & 0xffff, r.flags]);
  });
  long(0x50000 + 16 * records.length, 0xffffffff);
  return main;
}

const RECORDS = [
  { position: 1000, descriptor: 0x10, kind: 0, lateral: -300, height: 0, flags: 0x3005 },
  { position: 1500, descriptor: 0x10, kind: 0, lateral: 0, height: 0, flags: 0x3105 },
  { position: 2000, descriptor: 0x10, kind: 0x16d, lateral: 200, height: 48, flags: 0x0480 },
];

test("a stage's records are read as its program draws them: road, height below where bit 10 says, scale and color", () => {
  const main = program(RECORDS);
  const [a, m, b] = ciscoHeatObjects(main, 1);
  assert.deepEqual([a.position, a.road, a.lateral, a.height, a.color, a.scale, a.kind], [1000, 2, -300, 0, 5, 1, 0]);
  assert.deepEqual([a.mirrored, m.mirrored], [false, true]);
  assert.deepEqual([b.road, b.height, b.scale, b.kind], [1, -48, 0.5, 0x6d]);
  assert.deepEqual(objectScales(main).slice(0, 4), [0.5, 0, 0, 1]);
  assert.deepEqual(ciscoHeatDescriptor(main, 0x10), { tile: 0x186b, across: 2, down: 6, meets: [6, 24] });
  main[0x40000 + 0x10 + 1] = 30;
  assert.deepEqual(ciscoHeatDescriptor(main, 0x10).meets, [24, 30]);
  assert.throws(() => ciscoHeatObjects(main, 5), RangeError);
  main[0xe5b5] = 0x4a;
  assert.throws(() => ciscoHeatObjects(main, 1), /road/);
});

test("an object stands on its picture's bottom edge, its height over its road, its left edge at its lateral", () => {
  const main = program(RECORDS);
  const pixel = spritePixelUnits(main);
  assert.ok(Math.abs(pixel - 255 / 128 / (32767 / 32768)) < 1e-12);
  const [a, m, b] = ciscoHeatObjects(main, 1).map((o) => ciscoHeatPlace(main, o, pixel));
  assert.deepEqual([a.left, a.bottom], [-300, 0]);
  assert.ok(Math.abs(a.width - 2 * 16 * pixel) < 1e-9 && Math.abs(a.drawnHeight - 6 * 16 * pixel) < 1e-9);
  // It meets the car between its descriptor's columns, mirrored with its picture.
  assert.ok(Math.abs(a.meets.from - 6 * pixel) < 1e-9 && Math.abs(a.meets.to - 24 * pixel) < 1e-9);
  assert.ok(Math.abs(m.meets.from - 8 * pixel) < 1e-9 && Math.abs(m.meets.to - 26 * pixel) < 1e-9);
  // At half its scale, its picture half as big; off the road's height, it meets nothing.
  assert.ok(Math.abs(b.drawnHeight - 3 * 16 * pixel) < 1e-9 && b.bottom === -48);
  assert.equal(b.meets, null);
});

test("a stage's sprite colors are its list's entries from 48, each 16 words into its table", () => {
  const main = new Uint8Array(0x30000);
  const put = (at, words) => words.forEach((w, i) => ((main[at + 2 * i] = w >> 8), (main[at + 2 * i + 1] = w & 0xff)));
  put(0xed5e, [0x41fa, (0xd738 - 0xed60) & 0xffff, 0x2070, 0x2000, 0x3018]);
  put(0xed68, [0x43f9, 0x000b, 0xd600, 0x45f9, 0x0001, 0xab3c, 0x3218]);
  put(0xd738 + 4, [0x0002, 0x0000]); // stage 2's list at 0x20000
  put(0x20000, [1, 0x40, 0]); // two entries: the table's third, then its first
  put(0x1ab3c, [0x0008]); // the first entry's pen 0: red's low bit
  put(0x1ab3c + 0x40 + 2, [0xf000]); // the third's pen 1: red's four high bits
  const palette = ciscoHeatSpritePalette(main, 1);
  assert.equal(palette.length, 128);
  assert.equal(palette[47], null);
  assert.equal(palette[48].length, 16);
  assert.equal(palette[48][1], 0x1e << 10);
  assert.equal(palette[49][0], 1 << 10);
  assert.equal(palette[50], null);
  assert.throws(() => ciscoHeatSpritePalette(main, 5), RangeError);
});
