import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAST_SKY_SET,
  rowEntry,
  skyFade,
  stagePalettes,
} from '../../tools/road-data/cisco-heat/cisco-heat-road-colours.ts';
import { rgb555Of } from '../../tools/road-data/jaleco/palette.ts';

/** Words `words` at `at` of `bytes`. */
const put = (bytes, at, words) =>
  words.forEach((w, i) => ((bytes[at + 2 * i] = (w >> 8) & 0xff), (bytes[at + 2 * i + 1] = w & 0xff)));
const putLong = (bytes, at, v) => put(bytes, at, [v >>> 16, v & 0xffff]);

/** A road CPU's program with its rows' stripes at the addresses CISCO HEAT's has, its table at 0x2000. */
function roadProgram() {
  const road = new Uint8Array(0x4000);
  put(road, 0x161e, [0x2003, 0x80fc, 0x01fe, 0x4840, 0x33c0, 0x000c, 0x0084]); // road 1's divu.w #$1fe
  put(road, 0x160e, [0x2003, 0x80fc, 0x01fe, 0x4840, 0x33c0, 0x000c, 0x0084]); // road 2's
  put(
    road,
    0x19ac,
    [0x41f9, 0, 0x2000, 0x322a, 0x001a, 0xd279, 0x000c, 0x0084, 0x0281, 0x0000, 0xfffe, 0x3230, 0x1800],
  );
  put(road, 0x19c6, [0x302a, 0x0018, 0x0240, 0x00ff, 0xd041]);
  // The stripes: word k is k.
  put(
    road,
    0x2000,
    Array.from({ length: 0x800 }, (_, k) => k & 0x1f),
  );
  return road;
}

test("a row's entry is its stripe's word at its record's stripes and its phase, plus its variant's low byte, bits 0 to 5", () => {
  const road = roadProgram();
  const record = {
    start: 1000,
    radius: 0,
    side: 'left',
    heading: 0,
    x: 0,
    y: 0,
    kind: 14,
    variant: 0x8043,
    stripes: 6,
  };
  // Position 1000 + 7: its phase 1007 mod 510 = 497, the byte 6 + 497 to an even one, 502: word 251, 27.
  assert.equal(rowEntry(road, 1, record, 1007), (0x43 + (251 & 0x1f)) & 0x3f);
  assert.equal(rowEntry(road, 2, record, 1007 + 510), rowEntry(road, 1, record, 1007));
  assert.throws(() => rowEntry(road, 1, { ...record, stripes: undefined }, 1007), /stripes/);
  road[0x1621] = 0xff;
  assert.throws(() => rowEntry(road, 1, record, 1007), /divu/);
});

const BASE = 0x10000;
const LIST = 0x11000;
const COLORS = 0x12000;
const THIRD = 0x13000;
const SKIES = 0x14000;
const STARTS = 0x15000;
/** A raw palette word for a place: unique, its colour its RGB555. */
const raw = (where, entry, pen) => ((where & 7) << 13) | ((entry & 0x3f) << 4) | (pen & 15) | 1;

/** A main program with its road layers' palettes and its sky's fade where CISCO HEAT's main has them. */
function mainProgram() {
  const main = new Uint8Array(0x20000);
  put(main, 0x2730, [0x41f9, BASE >>> 16, BASE & 0xffff]);
  put(main, 0x2736, [0x43f9, 0x000b, 0xb800, 0x45f9, 0x000b, 0xc800, 0x303c, 0x01ff, 0x22d0, 0x24d8]);
  put(main, 0xedce, [0x41fa, LIST - 0xedd0]);
  put(main, 0xedfa, [0x2070, 0x0000, 0x2050]);
  put(main, 0xee00, [0x0c79, 0x0002, 0x000f, 0x011a]);
  put(main, 0xee0e, [0x45f9, 0x000b, 0xbd60]);
  put(main, 0xee3e, [0x41f9, THIRD >>> 16, THIRD & 0xffff]);
  put(main, 0xee48, [0x45f9, 0x000b, 0xb820, 0x47f9, 0x000b, 0xc820]);
  const pair = [0x24d0, 0x26d8];
  const next = [0x584a, 0x584b];
  put(main, 0xee54, [...Array(7).fill(pair).flat(), ...next]);
  put(main, 0xee7c, [
    0x3028,
    0x000c,
    ...Array(4).fill(pair).flat(),
    0x34d0,
    0x36d8,
    ...Array(5).fill(0x34c0),
    ...Array(5).fill(0x36c0),
    0xd0fc,
    0x000a,
    ...next,
  ]);
  put(main, 0xeeb8, [
    0x3028,
    0x000c,
    ...pair,
    0x5048,
    ...Array(4).fill(0x34c0),
    ...Array(4).fill(0x36c0),
    ...pair,
    0x3540,
    0xfffe,
    0x3740,
    0xfffe,
    ...Array(3).fill(pair).flat(),
    ...next,
  ]);
  put(main, 0xed52, [0x41fa, SKIES - 0xed54]);
  put(main, 0xeda2, [0x43f9, 0x000b, 0xbf20, 0x45f9, 0x000b, 0xcf20]);
  put(main, 0xeefe, [...Array(8).fill([0x24d0, 0x22d8]).flat(), 0x4e75]);
  put(main, 0xdb16, [0x41fa, STARTS - 0xdb18]);
  put(main, 0xdb1c, [0x2d70, 0x0000, 0x005a]);
  put(main, 0xef82, [0x3d7c, 0x0600, 0x0054]);
  put(main, 0xef9c, [0x7403]);
  put(main, 0xefa4, [0x0c79, 0x0004, 0x000f, 0x011a]);
  put(main, 0xefe2, [0x046e, 0x0010, 0x0054]);
  // The base: 64 entries of 16 pens; each stage's colors, 14 entries of 14 pens; STAGE 3's entries 1 to 42; nine sets of
  // the sky's six entries a stage; each stage's fade's start.
  for (let e = 0; e < 64; e++)
    put(
      main,
      BASE + 32 * e,
      Array.from({ length: 16 }, (_, p) => raw(0, e, p)),
    );
  for (let s = 0; s < 5; s++) {
    putLong(main, LIST + 4 * s, LIST + 0x100 + 4 * s);
    putLong(main, LIST + 0x100 + 4 * s, COLORS + 0x200 * s);
    for (let k = 0; k < 14; k++)
      put(
        main,
        COLORS + 0x200 * s + 28 * k,
        Array.from({ length: 14 }, (_, p) => raw(1 + s, k, p)),
      );
    putLong(main, SKIES + 4 * s, SKIES + 0x100 + 0x800 * s);
    for (let set = 0; set <= 8; set++)
      for (let e = 0; e < 6; e++)
        put(
          main,
          SKIES + 0x100 + 0x800 * s + 192 * set + 32 * e,
          Array.from({ length: 16 }, (_, p) => raw(6, 8 * set + e, p)),
        );
    putLong(main, STARTS + 4 * s, 100000 * (s + 1));
  }
  for (let k = 0; k < 14; k++)
    put(
      main,
      THIRD + 28 * k,
      Array.from({ length: 14 }, (_, p) => raw(7, k, p)),
    );
  return main;
}

test("a stage's palettes are the base, its 14 colors made into entries 1 to 42, and its sky's set", () => {
  const main = mainProgram();
  const [layer0, layer1] = stagePalettes(main, 1);
  const c = (k, p) => rgb555Of(raw(2, k, p));
  // Entries 1 to 14 its colors' pens 0 to 13, pens 14 and 15 the base's.
  assert.equal(layer0[1][3], c(0, 3));
  assert.equal(layer0[14][13], c(13, 13));
  assert.equal(layer0[1][14], rgb555Of(raw(0, 1, 14)));
  // 15 to 28: pens 0 to 8 its colors', 9 to 13 their pen 6.
  assert.equal(layer0[15][8], c(0, 8));
  assert.equal(layer0[15][10], c(0, 6));
  // 29 to 42: pens 2 to 5 and 7 their pen 6, the others their own.
  assert.deepEqual(
    layer0[30].slice(0, 14),
    [0, 1, 6, 6, 6, 6, 6, 6, 8, 9, 10, 11, 12, 13].map((p) => c(1, p)),
  );
  // The others the base's; the sky's entries its first set; both layers alike.
  assert.equal(layer0[43][0], rgb555Of(raw(0, 43, 0)));
  assert.equal(layer0[57][5], rgb555Of(raw(6, 0, 5)));
  assert.deepEqual(layer1, layer0);
  // STAGE 3: entries 1 to 42 from its own table, its list's colors as entries 43 to 56.
  const [third] = stagePalettes(main, 2);
  assert.equal(third[2][4], rgb555Of(raw(7, 1, 4)));
  assert.equal(third[44][4], rgb555Of(raw(3, 1, 4)));
  // Its fade's last set over layer 0, and in STAGE 5 over both.
  const [faded0, faded1] = stagePalettes(main, 1, LAST_SKY_SET);
  assert.equal(faded0[58][0], rgb555Of(raw(6, 8 * 8 + 1, 0)));
  assert.equal(faded1[58][0], rgb555Of(raw(6, 1, 0)));
  const [, fifth] = stagePalettes(main, 4, LAST_SKY_SET);
  assert.equal(fifth[58][0], rgb555Of(raw(6, 8 * 8 + 1, 0)));
  assert.throws(() => stagePalettes(main, 5), RangeError);
  assert.throws(() => stagePalettes(main, 0, 9), RangeError);
});

test("a stage's sky fades from its position over 96 ticks, over layer 0 and in STAGE 5 both", () => {
  const main = mainProgram();
  assert.deepEqual(skyFade(main, 0), { at: 100000, ticks: 96, layers: [0] });
  assert.deepEqual(skyFade(main, 4), { at: 500000, ticks: 96, layers: [0, 1] });
  put(main, 0xef82, [0x3d7c, 0x0500, 0x0054]);
  assert.throws(() => skyFade(main, 0), /fade/);
});
