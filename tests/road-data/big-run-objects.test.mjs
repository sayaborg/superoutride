import assert from 'node:assert/strict';
import test from 'node:test';
import { bigRunDescriptor, bigRunObjects, spritePalette } from '../../tools/road-data/big-run/big-run-objects.ts';
import { spritePen } from '../../tools/road-data/jaleco/zoom-sprites.ts';
import { rgb555Of } from '../../tools/road-data/jaleco/palette.ts';

const writer = (bytes) => {
  const put = (at, words) =>
    words.forEach((w, i) => ((bytes[at + 2 * i] = (w >> 8) & 0xff), (bytes[at + 2 * i + 1] = w & 0xff)));
  return { put, long: (at, v) => put(at, [(v >>> 16) & 0xffff, v & 0xffff]) };
};

test("a stage's objects are its records in order, each on road 1 where its flags' bit 7 is set", () => {
  const main = new Uint8Array(0x140000);
  const { put, long } = writer(main);
  put(0x9874, [0x41fa, 0x9770 - 0x9876]);
  put(0xb096, [0x0806, 0x0007]);
  put(0xb07a, [0x43f9, 0x0012, 0x7e00]);
  long(0x9770 + 4, 0x20000);
  long(0x20000, 100);
  put(0x20004, [1980, 0, -217 & 0xffff, 72, 0xa7, 47]);
  long(0x20010, 300);
  put(0x20014, [2148, 0, 231, 0, 0x27, 31]);
  long(0x20020, 0xffffffff);
  assert.deepEqual(
    bigRunObjects(main, 1).map((o) => [o.position, o.descriptor, o.road, o.lateral, o.height, o.color]),
    [
      [100, 1980, 1, -217, 72, 0x27],
      [300, 2148, 2, 231, 0, 0x27],
    ],
  );
  // A descriptor: its scales, size, tile and attribute.
  put(0x127e00 + 1980, [0x7649, 0x5821, 0x42, 0xc0a, 0x14a, 0x1de0]);
  assert.deepEqual(bigRunDescriptor(main, 1980), {
    tile: 0xc0a,
    across: 3,
    down: 5,
    xScale: 0x76,
    yScale: 0x58,
    attribute: 0x1de0,
  });
});

test("a sprite tile's left eight columns lie before its right, four bytes a row, the left pixel the high nibble", () => {
  const rom = new Uint8Array(256);
  rom[128 + 4 * 2] = 0x12; // tile 1, row 2, columns 0 and 1
  rom[128 + 64 + 4 * 2 + 1] = 0x34; // its right half, row 2, columns 10 and 11
  assert.deepEqual(
    [
      [0, 2],
      [1, 2],
      [10, 2],
      [11, 2],
    ].map(([x, y]) => spritePen(rom, 1, x, y)),
    [1, 2, 3, 4],
  );
});

test("the sprites' palette is its boot table's first 24 entries and its stage's list from entry 25", () => {
  const main = new Uint8Array(0x140000);
  const { put, long } = writer(main);
  put(0x179c, [0x41f9, 0x0010, 0x0000, 0x43f9, 0x0009, 0xe800, 0x303c, 0x00bf]);
  put(0xb884, [0x41fa, 0x978c - 0xb886]);
  put(0xb894, [0x45f9, 0x0010, 0x0000]);
  put(0x100000 + 32 * 3, [0x1230]);
  long(0x978c + 8, 0x30000);
  put(0x30000, [1, 0x400, 0x420]); // two entries: from 0x100400 and 0x100420
  put(0x100420, [0x4560]);
  const palette = spritePalette(main, 2);
  assert.equal(palette[3][0], rgb555Of(0x1230));
  assert.equal(palette[26][0], rgb555Of(0x4560));
  assert.equal(palette[24], null);
  assert.equal(palette[27], null);
});
