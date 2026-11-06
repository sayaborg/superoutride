/**
 * POLE POSITION II's objects' sprites ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-objects)):
 * how the second program lays the START gantry's, the DUNLOP arch's, a puddle's and the flagman's sprites, their
 * places, codes and colors, each found by the instructions that write them.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { PolePositionII } from './pole-position-ii-rom.js';

/**
 * One sprite of an object, as its routine lays it at the size where a big sprite is drawn 1:1: its code (its bit 7
 * mirrored), big (32 pixels) or small (16), its color, and its top left corner, `x` pixels right of the object's column
 * and `y` pixels above its road line, in the order the sprite circuit draws it (each over those before).
 */
export interface LaidSprite {
  readonly code: number;
  readonly big: boolean;
  readonly color: number;
  readonly x: number;
  readonly y: number;
  /** The rows it is drawn in, where its code word sets them (`codeRows`); else its own. */
  readonly rows?: number;
}

/**
 * The rows a sprite whose code word holds its size is drawn in: its high byte's low 6 bits the size register, a sprite
 * drawn s tall spanning s + 1 rows ([POLE POSITION II's hardware](../../../docs/pole-position-ii-road-data.md#pole-position-iis-hardware)).
 */
export const codeRows = (word: number) => ((word >> 8) & 0x3f) + 1;

/** The road line's row on the screen, `ROAD_ROW` less the line, and an object's column, `COLUMN_BASE` less its x. */
const ROAD_ROW = 0x182;
const COLUMN_BASE = 0x53e;
/** The RAM words a routine reads: the object's road line, its size (a big sprite's pixels) and its column's terms. */
const LINE = 0x8824;
const SIZE = 0x8834;
const COLUMN = 0x882c;
/** A big sprite's pixels: the size at which an object's sprites are laid, a big sprite 1:1. */
const BIG = 32;

/**
 * The places a straight-line layout routine at `address` writes, its sprite RAM's entries 4 bytes each (`y`, then `x`,
 * from r12), with the road line 0, the size `BIG` and the column's terms 0: each instruction one of the few such
 * routines are made of (`ld r,$a`, `ld r,r`, `sra`/`srl r,#1`, `neg r`, `add r,#i`, `add r,r`, `sub r,r`, `add
 * r,$9700(r)` (the column's table), `ld @r12,r`, `ld d(r12),r`), any other refused, to its `ret`.
 */
function laidPlaces(p: PolePositionII, address: number): { x: number; y: number }[] {
  const r = new Int32Array(16);
  const read = (at: number) => {
    if (at === LINE || at === COLUMN) return 0;
    if (at === SIZE) return BIG;
    throw romDiffers(`A layout routine reads 0x${at.toString(16)}`);
  };
  const places: { x?: number; y?: number }[] = [];
  const put = (offset: number, value: number) => {
    const place = (places[offset >> 2] ??= {});
    if (offset & 2) place.x = value - COLUMN_BASE;
    else place.y = value - ROAD_ROW;
  };
  for (let at = address; word(p.second, at) !== 0x9e08;) {
    const op = word(p.second, at);
    const [high, a, b] = [op >> 8, (op >> 4) & 15, op & 15];
    const next = word(p.second, at + 2);
    // Each form's length: two words where it takes an address, an immediate, a shift or a displacement.
    let length = 2;
    if (high === 0x61 && a === 0) [r[b], length] = [read(next), 4];
    else if (high === 0xa1) r[b] = r[a]!;
    else if (high === 0xb3 && (b === 9 || b === 1) && next === 0xffff) [r[a], length] = [r[a]! >> 1, 4];
    else if (high === 0x8d && b === 2) r[a] = -r[a]!;
    else if (high === 0x01 && a === 0) [r[b], length] = [r[b]! + ((next << 16) >> 16), 4];
    else if (high === 0x81) r[b] = r[b]! + r[a]!;
    else if (high === 0x83) r[b] = r[b]! - r[a]!;
    else if (high === 0x41 && a !== 0 && next === 0x9700) [r[b], length] = [r[b]! + read(COLUMN), 4];
    else if (high === 0x2f && a === 12) put(0, r[b]!);
    else if (high === 0x6f && a === 12) {
      put(next, r[b]!);
      length = 4;
    } else
      throw romDiffers(
        `The layout routine at 0x${address.toString(16)} holds 0x${op.toString(16)} at 0x${at.toString(16)}`,
      );
    at += length;
  }
  return places.map((place, k) => {
    if (place.x === undefined || place.y === undefined)
      throw romDiffers(`A layout routine leaves sprite ${k} unplaced`);
    return { x: place.x, y: place.y };
  });
}

/**
 * The codes a routine at `address` writes before its colors (0x147A's form): from the table its r6 takes, its first
 * count big sprites, the size's byte with its bit 7 set above each, then its second count small ones, the size halved.
 */
function laidCodes(p: PolePositionII, address: number): { code: number; big: boolean }[] {
  const [table, bigs, smalls] = instruction(
    p.second,
    address,
    [
      0xa1d5,
      0x2106,
      null,
      0x2107,
      null,
      0x6100,
      SIZE,
      0xa507,
      0xa080,
      0x2068,
      0x2f50,
      0xa960,
      0xa953,
      0xf785,
      0x2107,
      null,
      0xb201,
      0xffff,
      0x2068,
      0x2f50,
      0xa960,
      0xa953,
      0xf785,
      0xa1d5,
      0xa951,
    ],
    "an object's sprites' codes",
  );
  return Array.from({ length: bigs! + smalls! }, (_, k) => ({ code: p.second[table! + k]!, big: k < bigs! }));
}

/** An object's sprites from its places, codes and each one's color. */
const sprites = (
  places: readonly { x: number; y: number }[],
  codes: readonly { code: number; big: boolean }[],
  color: (k: number) => number,
): LaidSprite[] => {
  if (places.length !== codes.length) throw romDiffers("An object's sprites' places and codes differ in number");
  return codes.map((c, k) => ({ ...c, color: color(k), ...places[k]! }));
};

/**
 * The START gantry, as the second program's 0x136E places its 22 sprites and 0x147A codes them, in state `state` (its
 * $8886, & 7): the first two its lamps, in the high byte of 0x14FA's word for the state, the rest in its low byte.
 */
export function gantrySprites(p: PolePositionII, state: number): LaidSprite[] {
  const [table, rest, small] = instruction(
    p.second,
    0x14ac,
    [
      0x6101,
      0x8886,
      0x0701,
      0x0007,
      0x8111,
      0x6111,
      null,
      0x6100,
      SIZE,
      0xa507,
      0xa080,
      0xa018,
      0xa001,
      0x2f50,
      0xa953,
      0x2f50,
      0xa953,
      0x2107,
      null,
      0x2f51,
      0xa953,
      0xf783,
      0x2107,
      null,
      0x2f51,
      0xa953,
      0xf783,
      0x9e08,
    ],
    "the gantry's colors",
  );
  const colors = word(p.second, table! + 2 * (state & 7));
  const laid = sprites(laidPlaces(p, 0x136e), laidCodes(p, 0x147a), (k) => (k < 2 ? colors >> 8 : colors & 0xff));
  if (laid.length !== 2 + rest! + small!) throw romDiffers("The gantry's colors are not its sprites'");
  return laid;
}

/** The DUNLOP arch, as the second program's 0x1A9E places its 22 sprites and 0x1BB4 codes them, all in one color. */
export function archSprites(p: PolePositionII): LaidSprite[] {
  const [color] = instruction(
    p.second,
    0x1be6,
    [0x2101, null, 0x6100, SIZE, 0xa507, 0xa081, 0x2107, null, 0x2f51, 0xa953, 0xf783, 0x2107, null, 0x2f51, 0xa953],
    "the arch's color",
  );
  return sprites(laidPlaces(p, 0x1a9e), laidCodes(p, 0x1bb4), () => color!);
}

/**
 * A puddle, as the second program's 0x150A and 0x1582 lay it: four big sprites in a row from 0x30 (0x1582's `ldb rl1`
 * and three `incb`), a size apart from two sizes left of its column, their tops half a size above its road line, in
 * one color (0x1582's `ldb rl0`).
 */
export function puddleSprites(p: PolePositionII): LaidSprite[] {
  instruction(
    p.second,
    0x150a,
    [
      0x6101,
      LINE,
      0x8d12,
      0x0101,
      ROAD_ROW,
      0x6100,
      SIZE,
      0xb301,
      0xffff,
      0x8101,
      0x2fc1,
      0x6fc1,
      4,
      0x6fc1,
      8,
      0x6fc1,
      12,
    ],
    "a puddle's rows",
  );
  instruction(
    p.second,
    0x1556,
    [
      0x4102,
      SIZE,
      0x4102,
      SIZE,
      0x8d22,
      0x0102,
      COLUMN_BASE,
      0x6fc2,
      2,
      0x4102,
      SIZE,
      0x6fc2,
      6,
      0x4102,
      SIZE,
      0x6fc2,
      10,
    ],
    "a puddle's columns",
  );
  const [color, first] = instruction(
    p.second,
    0x1598,
    [null, 0x6fd0, 2, 0x6fd0, 6, 0x6fd0, 10, 0x6fd0, 14, null, 0x2fd1, 0xa890, 0x6fd1, 4, 0xa890, 0x6fd1, 8, 0xa890],
    "a puddle's codes",
  );
  if (color! >> 8 !== 0xc8 || first! >> 8 !== 0xc9) throw romDiffers("A puddle's codes are not ldb");
  return [0, 1, 2, 3].map((k) => ({
    code: (first! & 0xff) + k,
    big: true,
    color: color! & 0xff,
    x: (k - 2) * BIG,
    y: BIG / 2,
  }));
}

/**
 * The flagman, as the second program's 0x180E and 0x1888 lay its picture `picture` (0x18D4's 4 bytes: a big sprite,
 * two small ones, and its shift's low two bits): its big sprite a size above its road line, three small ones half a
 * size above that, the third 0x70, from its column less a quarter size a shift step (half a size and a quarter for 3)
 * the small ones half a size apart, in one color (0x1888's `ldb rl0`).
 */
export function flagmanSprites(p: PolePositionII, picture: number): LaidSprite[] {
  instruction(
    p.second,
    0x180e,
    [
      0x6101,
      LINE,
      0xa110,
      0x8d02,
      0x0100,
      ROAD_ROW,
      0x6103,
      SIZE,
      0xa134,
      0xb349,
      0xffff,
      0xa145,
      0xb359,
      0xffff,
      0x8130,
      0x2fc0,
      0x8140,
      0x6fc0,
      4,
      0x6fc0,
      8,
      0x6fc0,
      12,
      0x8111,
      0x6102,
      COLUMN,
      0x4112,
      0x9700,
    ],
    "the flagman's rows",
  );
  const [shifts] = instruction(
    p.second,
    0x1846,
    [
      0x6103,
      0x8886,
      0xb339,
      2,
      0x0703,
      0xfc,
      0x6039,
      null,
      0x0701,
      3,
      0xe608,
      0xab10,
      0xe605,
      0xab10,
      0xe601,
      0x8152,
      0x8142,
      0xe801,
      0x8152,
      0x8d22,
      0x0102,
      COLUMN_BASE,
      0x6fc2,
      2,
      0x6fc2,
      6,
      0x8142,
      0x6fc2,
      10,
      0x8142,
      0x6fc2,
      14,
    ],
    "the flagman's columns",
  );
  const [color, table, second, third, last] = instruction(
    p.second,
    0x1888,
    [
      0x6101,
      SIZE,
      0xa091,
      0xa090,
      null,
      0x6102,
      0x8886,
      0xb329,
      2,
      0x0702,
      0xfc,
      0xa51f,
      0x6029,
      null,
      0x2fd1,
      0x6fd0,
      2,
      0xa31f,
      0xb319,
      0xffff,
      0x6029,
      null,
      0x6fd1,
      4,
      0x6fd0,
      6,
      0x6029,
      null,
      0x6fd1,
      8,
      0x6fd0,
      10,
      null,
      0x6fd1,
      12,
    ],
    "the flagman's codes",
  );
  if (
    color! >> 8 !== 0xc8 ||
    last! >> 8 !== 0xc9 ||
    second !== table! + 1 ||
    third !== table! + 2 ||
    shifts !== table! + 3
  )
    throw romDiffers("The flagman's picture is not 0x18D4's form");
  const at = table! + 4 * picture;
  const shift = [0, BIG / 4, BIG / 2, BIG / 2 + BIG / 4][p.second[at + 3]! & 3]!;
  const small = [p.second[at + 1]!, p.second[at + 2]!, last! & 0xff];
  return [
    { code: p.second[at]!, big: true, color: color! & 0xff, x: -shift, y: BIG },
    ...small.map((code, k) => ({
      code,
      big: false,
      color: color! & 0xff,
      x: -shift + (k * BIG) / 2,
      y: BIG + BIG / 2,
    })),
  ];
}

/**
 * The airship or plane with its banner, as the second program's 0x16FC places its 8 big sprites and 0x176E codes them,
 * in course `course`, its x `x`, its state 1 (the race's): the craft, 0x60 (the airship) where the course's bit 0 is 0,
 * else 0x61 (the plane), its color by x's bit 2; then the banner's four, 0x62 to 0x65, a step apart, their color 0x24
 * + 1 in state 1; then three more, 0x62 to 0x64, in their own color, a step apart from the fourth's place + half a step
 * (state 1), their tops the rise above the others'. Each code word's high byte holds its size register, so that a
 * sprite is drawn in its rows (`codeRows`): 0xA0's 33, the three's 0xA2 35.
 */
export function craftSprites(p: PolePositionII, course: number, x: number): LaidSprite[] {
  const [, rise, step, ...operands] = instruction(
    p.second,
    0x16fc,
    [
      0x2101,
      null,
      0x2fc1,
      0x6fc1,
      4,
      0x6fc1,
      8,
      0x6fc1,
      12,
      0x6fc1,
      16,
      0x0101,
      null,
      0x6fc1,
      20,
      0x6fc1,
      24,
      0x6fc1,
      28,
      0x6101,
      0x8884,
      0x6fc1,
      2,
      0x0101,
      null,
      0x6fc1,
      6,
      0x0101,
      null,
      0x6fc1,
      10,
      0x0101,
      null,
      0x6fc1,
      14,
      0x0101,
      null,
      0x6fc1,
      18,
      0x4d04,
      0x8886,
      0xee02,
      0x0101,
      null,
      0x0101,
      null,
      0x6fc1,
      22,
      0x0101,
      null,
      0x6fc1,
      26,
      0x0101,
      null,
      0x6fc1,
      30,
      0x9e08,
    ],
    "the craft's places",
  );
  const [airship, airshipColor, , plane, planeColor, , first, color, rest, restColor] = instruction(
    p.second,
    0x176e,
    [
      0x6100,
      0x801c,
      0x0700,
      0x0001,
      0xee0f,
      0x0dd5,
      null,
      0x6100,
      0x8884,
      0x0700,
      0x0004,
      0xee04,
      0x4dd5,
      0x0002,
      null,
      0xe812,
      0x4dd5,
      0x0002,
      null,
      0xe80e,
      0x0dd5,
      null,
      0x6100,
      0x8884,
      0x0700,
      0x0004,
      0xee04,
      0x4dd5,
      0x0002,
      null,
      0xe803,
      0x4dd5,
      0x0002,
      null,
      0x2101,
      null,
      0x2102,
      null,
      0x4d04,
      0x8886,
      0xe601,
      0xa920,
      0x6fd1,
      4,
      0x6fd2,
      6,
      0xa910,
      0x6fd1,
      8,
      0x6fd2,
      10,
      0xa910,
      0x6fd1,
      12,
      0x6fd2,
      14,
      0xa910,
      0x6fd1,
      16,
      0x6fd2,
      18,
      0x2101,
      null,
      0x2102,
      null,
      0x6fd1,
      20,
      0x6fd2,
      22,
      0xa910,
      0x6fd1,
      24,
      0x6fd2,
      26,
      0xa910,
      0x6fd1,
      28,
      0x6fd2,
      30,
      0x9e08,
    ],
    "the craft's codes",
  );
  // The steps a sprite apart, then the two halves state 0 adds of which state 1 skips the first, then two more steps.
  const [s2, s3, s4, skipped, half, s5, s6] = operands;
  if ([s2, s3, s4, s5, s6].some((s) => s !== step) || skipped !== step! / 2 || half !== step! / 2 || step !== BIG)
    throw romDiffers("The craft's sprites are not a big sprite apart");
  if (x & 4) throw romDiffers("The craft's first x is not its first color's");
  const big = (w: number) => {
    if ((w & 0xfd00) !== 0xa000) throw romDiffers(`The craft's code word 0x${w.toString(16)} is not a big sprite's`);
    return w & 0xff;
  };
  const craft = course & 1 ? { code: plane!, color: planeColor! } : { code: airship!, color: airshipColor! };
  const banner = (k: number) => ({
    code: big(first!) + k,
    big: true,
    color: (color! & 0xff) + 1,
    x: step! * (k + 1),
    y: 0,
    rows: codeRows(first!),
  });
  return [
    { code: big(craft.code), big: true, color: craft.color & 0xff, x: 0, y: 0, rows: codeRows(craft.code) },
    ...[0, 1, 2, 3].map(banner),
    ...[0, 1, 2].map((k) => ({
      code: big(rest!) + k,
      big: true,
      color: restColor! & 0xff,
      x: step! * 4 + half! + step! * k,
      y: rise!,
      rows: codeRows(rest!),
    })),
  ];
}
