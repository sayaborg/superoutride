/**
 * POLE POSITION II's scenery ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-objects)):
 * each course's boards along its road, where the second program places them, the pictures it builds them of and how
 * near the car may come; each table found by the instructions that read it.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { PolePositionII } from './pole-position-ii-rom.js';
import { COURSES } from './pole-position-ii-road.js';
import { CAR_X_END } from './pole-position-ii-constants.js';

/** A board's place: the road position's high word (256 an interval), its side's lateral, objects' units, and its kind. */
export interface SceneryPlace {
  readonly position: number;
  readonly lateral: number;
  readonly kind: number;
}

/**
 * A board's picture by its kind: its tiles' big sprites by rows, and its poles' small sprites, each its code, mirrored
 * or not, and its column under the board (a tile's pixels); all in one sprite color.
 */
export interface BoardPicture {
  readonly tiles: readonly (readonly number[])[];
  readonly poles: readonly { readonly code: number; readonly mirrored: boolean; readonly x: number }[];
  readonly color: number;
}

/** A sprite code's mirrored bit, as the sprite hardware reads it. */
const MIRRORED = 0x80;

/**
 * Each course's 24 boards, in the table's order: the second program's 0x0854 reads course c's from 0x5A7E + 0x30c
 * downwards, a word each, its high byte the interval and its whole the place; its bits 2 and 3 its side, whose lateral
 * high byte 0x088A holds; its low four bits its kind (0x1DAC).
 */
export function readScenery(p: PolePositionII): SceneryPlace[][] {
  const [stride, base, count] = instruction(
    p.second,
    0x0858,
    [0x0705, 0x0003, 0x1904, null, 0x0105, null, 0x2104, 0x8d00, 0x2106, null],
    "the scenery's table",
  );
  instruction(p.second, 0x086c, [0x2151, 0x2f41, 0xb311, 0xfffe, 0x0701, 0x0003], "the scenery's side");
  const [sides] = instruction(p.second, 0x0878, [0x6011, null, 0x8c98], "the sides' laterals");
  instruction(p.second, 0x0884, [0xab51], 'the table read downwards');
  instruction(p.second, 0x1dac, [0x2151, 0x0701, 0x000f], "the scenery's kind");
  const signed = (byte: number) => (byte << 24) >> 24;
  return Array.from({ length: COURSES }, (_, c) =>
    Array.from({ length: count! }, (_, k) => {
      const at = base! + stride! * c - 2 * k;
      const word = (p.second[at]! << 8) | p.second[at + 1]!;
      return { position: word, lateral: signed(p.second[sides! + ((word >> 2) & 3)]!) << 8, kind: word & 15 };
    }),
  );
}

/**
 * Each kind's picture, as the second program's 0x1282 builds it: below kind 0x0C, a board of three tiles by two on two
 * poles, 0x56 and 0x57, under its outer tiles, kinds 8 to 0x0B's mirrored (0xD7 and 0xD6); from 0x0C, a board of four
 * tiles in a row on four poles, each mirrored. Its tiles' first big sprite is 0x5BC0's entry (kind with its low bit
 * cleared) + 1, the rest after it, and its color 0x5BD0's entry kind.
 */
export function readBoardPictures(p: PolePositionII): BoardPicture[] {
  const [codes] = instruction(p.second, 0x12ac, [0x0701, 0x000e, 0x8161, 0x601a, null], "the boards' sprites");
  const [colors] = instruction(p.second, 0x12b6, [0x607c, null], "the boards' colors");
  const [wide] = instruction(p.second, 0x12bc, [0x0b07, null, 0xe931], 'the wide boards');
  const [mirrored] = instruction(p.second, 0x12e2, [0x0b07, null, 0xe907], "the mirrored poles' boards");
  const [left] = instruction(p.second, 0x12e8, [null], "the poles' sprite");
  const [leftMirrored] = instruction(p.second, 0x12f6, [null], "the mirrored poles' sprite");
  const [wideLeft, wideRight] = instruction(
    p.second,
    0x1338,
    [null, 0x6fd3, 0x0010, 0x6fd3, 0x0014, null],
    "the wide boards' poles",
  );
  instruction(p.second, 0x12ee, [0xa930], "the right pole's sprite, the left's + 1");
  instruction(p.second, 0x12fc, [0xab30], "the right mirrored pole's sprite, the left's − 1");
  const byte = (w: number, op: number) => {
    if (w >> 8 !== op) throw romDiffers(`The poles' sprite 0x${w.toString(16)} is not ldb rl3`);
    return w & 0xff;
  };
  const pole = (w: number) => ({ code: w & ~MIRRORED & 0x7f, mirrored: (w & MIRRORED) !== 0 });
  const [plain, flipped] = [byte(left!, 0xcb), byte(leftMirrored!, 0xcb)];
  if (byte(wideLeft!, 0xcb) !== flipped || byte(wideRight!, 0xcb) !== flipped - 1)
    throw romDiffers("The wide boards' poles are not the mirrored poles");
  const second = (w: number, step: number) => ({ ...pole(w + step), mirrored: pole(w).mirrored });
  return Array.from({ length: 16 }, (_, kind) => {
    const first = p.second[codes! + (kind & 0x0e) + 1]!;
    const color = p.second[colors! + kind]!;
    if (kind >= wide!) {
      const [a, b] = [pole(flipped), second(flipped, -1)];
      return {
        tiles: [[0, 1, 2, 3].map((k) => first + k)],
        poles: [a, a, b, b].map((q, k) => ({ ...q, x: 32 * k + 8 })),
        color,
      };
    }
    const [a, b] = kind >= mirrored! ? [pole(flipped), second(flipped, -1)] : [pole(plain), second(plain, 1)];
    return {
      tiles: [0, 3].map((row) => [0, 1, 2].map((k) => first + row + k)),
      poles: [
        { ...a, x: 8 },
        { ...b, x: 72 },
      ],
      color,
    };
  });
}

/**
 * How near the car comes to a board before it crashes (the second program's 0x239E): within `along` of the road
 * position's high word either way (256 an interval) and `across` objects' lateral units either way.
 */
export function readSceneryReach(p: PolePositionII) {
  const [along, both] = instruction(
    p.second,
    0x23a6,
    [0x6151, 0x0004, 0x0101, null, 0x0301, null, 0xef17],
    'the reach along a board',
  );
  const [across, wide] = instruction(
    p.second,
    0x23b4,
    [0x6151, 0x0006, 0x0101, null, 0x0301, null, 0xef10],
    'the reach across a board',
  );
  if (both !== 2 * along! || wide !== 2 * across!) throw romDiffers("A board's reach is not as far either way");
  return { along: along!, across: across! };
}

/**
 * How far the player's car goes either side of P, in the objects' lateral units: its x ($8188, from P, positive right)
 * as the first program's 0x2B52 and the second's 0x2B04 add its sideways movement to it (`add r1, $8188`, not stored
 * where it overflows, `ret ov`; stored, and once more one greater where negative), held nowhere, so to its word's ends
 * (`CAR_X_END`); the second's 0x1DCC makes it the objects' lateral, −x shifted right 4 bits and that again 2 more
 * added (5/64).
 */
export function readCarLimit(p: PolePositionII) {
  const adds = [0x4101, 0x8188, 0x9e04, 0x6f01, 0x8188, 0x9e0d, 0xa910, 0x6f01, 0x8188, 0x9e08] as const;
  instruction(p.first, 0x2b52, adds, "the player's x's sideways movement");
  instruction(p.second, 0x2b04, adds, "the player's x's sideways movement");
  const [first, second] = instruction(
    p.second,
    0x1dcc,
    [0x6101, 0x8188, 0x8d12, 0xb319, null, 0xa110, 0xb309, null, 0x8101, 0x6f01, 0x8c66],
    "the player's x as the objects' lateral",
  );
  const [a, b] = [first, second].map((v) => (v << 16) >> 16) as [number, number];
  if (a >= 0 || b >= 0) throw romDiffers("The player's x is not shifted right to the objects' lateral");
  return CAR_X_END * 2 ** a * (1 + 2 ** b);
}

/**
 * How the second program projects a board at road line `row`, each as a share of (row + 4) screen pixels: a lateral
 * unit (its 0x0AD4: the lateral times row + 4, shifted left 6 bits of 32, so over 1024) and a source pixel of a board's
 * big sprites (its 0x0B72, a board's size: row + 4 halved, the screen pixels of a big sprite's 32).
 */
export function readProjection(p: PolePositionII) {
  const [four, shift] = instruction(
    p.second,
    0x0ade,
    [0x0100, null, 0x9902, 0xb325, null],
    "a board's lateral at its row",
  );
  const [size] = instruction(p.second, 0x0b72, [0x0101, null, 0xb311, 0xffff, 0xab10], "a board's size at its row");
  if (four !== 4 || size !== 4) throw romDiffers("The boards' projection is not about road line −4");
  return { lateral: 2 ** shift! / 2 ** 16, pixel: 1 / 2 / 32 };
}

/** The objects' kinds as the second program's 0x0A1E draws them (its table at 0x0A66) that the courses stand. */
export const GANTRY = 6;
export const PUDDLE = 7;
export const FLAGMAN = 10;
export const ARCH = 12;

/** An object placed besides the boards: its kind, its road position's high word and its lateral (positive left). */
export interface ObjectPlace {
  readonly kind: number;
  readonly position: number;
  readonly lateral: number;
}

/** A slot's first word: its bit 15 set while it is shown, its low byte its kind. */
const shownKind = (w: number, what: string) => {
  if (!(w & 0x8000)) throw romDiffers(`${what} is not shown`);
  return w & 0xff;
};

/**
 * The objects the race's start places besides the boards, in course `c`: the START gantry (the second program's
 * 0x07E2: $8BE0 of kind 6 at the high word 0x20, the start line's checker's start, lateral 0, its state 0), then its
 * three special objects (0x0800 to 0x0852, with r9 1: 0x5C08 + 9c's three bytes each, its kind, its interval and its
 * lateral's high byte, the lateral the byte's word over 16, all three placed), then the flagman (its command 26,
 * 0x057A: $8C00, the first special's slot, of kind 10 at the high word 0x0C, lateral 0x5C0, its picture 0).
 */
export function readObjects(p: PolePositionII, c: number): ObjectPlace[] {
  const [gantry, at] = instruction(
    p.second,
    0x07e2,
    [
      0x210b,
      0x8be0,
      0x0db5,
      null,
      0x4db5,
      0x0002,
      null,
      0x4db8,
      0x0006,
      0x4db8,
      0x000c,
      0x2103,
      0x0004,
      0x2109,
      0x0001,
    ],
    'the gantry at the race',
  );
  const [count, table, arch] = instruction(
    p.second,
    0x0800,
    [
      0x010b,
      0x0020,
      0x210a,
      null,
      0x6100,
      0x801c,
      0x0700,
      0x0003,
      0xa10c,
      0xb3c1,
      0x0003,
      0x810c,
      0x010c,
      null,
      0xc080,
      0x20c8,
      0xa9c0,
      0x0a08,
      null,
      0xe603,
      0x8d94,
      0xee01,
      0x8c08,
      0x2fb0,
      0x20c1,
      0xa9c0,
      0x20c2,
      0xa9c0,
      0x8c98,
      0x8ca8,
      0xb329,
      0xfffc,
      0x6fb1,
      0x0002,
      0x6fb2,
      0x0006,
    ],
    'the special objects',
  );
  const [flagman, flagAt, flagLateral] = instruction(
    p.second,
    0x057a,
    [0x210b, 0x8c00, 0x0db5, null, 0x4db5, 0x0002, null, 0x4db5, 0x0006, null, 0x4db8, 0x000c],
    'the flagman',
  );
  if (shownKind(gantry!, 'The gantry') !== GANTRY || shownKind(flagman!, 'The flagman') !== FLAGMAN)
    throw romDiffers("The gantry's or the flagman's kind differs");
  if ((arch! & 0xff) !== ARCH) throw romDiffers('The arch is not the kind always placed');
  const signed = (byte: number) => (byte << 24) >> 24;
  const specials = Array.from({ length: count! }, (_, k) => {
    const at3 = table! + 9 * c + 3 * k;
    const [kind, interval, lateral] = [p.second[at3]!, p.second[at3 + 1]!, p.second[at3 + 2]!];
    if (kind !== PUDDLE && kind !== ARCH) throw romDiffers(`Course ${c}'s special object ${k} is of kind ${kind}`);
    return { kind, position: interval << 8, lateral: (signed(lateral) << 8) >> 4 };
  });
  return [
    { kind: GANTRY, position: at!, lateral: 0 },
    ...specials,
    { kind: FLAGMAN, position: flagAt!, lateral: (flagLateral! << 16) >> 16 },
  ];
}

/**
 * A puddle's projection, the second program's 0x0D34: its high word less 0x64 (its place drawn 0x64 units nearer).
 */
export function readPuddleAhead(p: PolePositionII): number {
  const [ahead] = instruction(
    p.second,
    0x0d34,
    [0x6100, 0x8882, 0x0300, null, 0x6f00, 0x8882],
    "a puddle's projection",
  );
  return ahead!;
}

/**
 * Each object's pixel as a share of a board's, by the slopes of its size at road line `row` (the second program's
 * 0x0AD4 jumping by 0x0AFC's table on its kind): a board's and the gantry's (0x0B6C) (row + 4) / 2 − 1; the arch's
 * (0x0C0C) (row + 4) × 9/16 − 1; a puddle's (0x0B1C) (row + 6) × 3/8 − 1; the flagman's (0x0BEE) 8 (row + 4) / 13.
 */
export function readObjectScales(p: PolePositionII): ReadonlyMap<number, number> {
  const [table] = instruction(p.second, 0x0af0, [0x0703, 0x000f, 0x8133, 0x6133, null, 0x1e38], 'the sizes by kind');
  const routine = (kind: number) => word(p.second, table! + 2 * kind);
  const board = routine(5);
  if (routine(GANTRY) !== board) throw romDiffers("The gantry's size is not a board's");
  instruction(p.second, board, [0x0b01, 0x0070, 0xef08, 0x0101, 0x0004, 0xb311, 0xffff, 0xab10], "a board's size");
  instruction(
    p.second,
    routine(ARCH),
    [0x0b01, 0x0070, 0xef0c, 0x0101, 0x0004, 0xa110, 0xb301, 0xfffd, 0x8101, 0xb311, 0xffff, 0xab10],
    "the arch's size, (row + 4) and its eighth, halved",
  );
  instruction(
    p.second,
    routine(PUDDLE),
    [0x0b01, 0x0070, 0xef0b, 0x0101, 0x0006, 0xa110, 0x8101, 0x8101, 0xb311, 0xfffd, 0xab10],
    "a puddle's size, three times (row + 6) over 8",
  );
  instruction(
    p.second,
    routine(FLAGMAN),
    [0x0b01, 0x0070, 0xe702, 0x2101, 0x0070, 0x0101, 0x0004, 0x8d08, 0xb305, 0x0003, 0x1b00, 0x000d],
    "the flagman's size, eight times (row + 4) over 13",
  );
  const half = 1 / 2;
  return new Map([
    [GANTRY, 1],
    [ARCH, 9 / 16 / half],
    [PUDDLE, 3 / 8 / half],
    [FLAGMAN, 8 / 13 / half],
  ]);
}

/**
 * How far off the road the gantry and the arch are hit (the second program's 0x236C and 0x247A): within 0x14 of the high
 * word's units either way and 0x600 lateral units or more from their middle, as a board is hit (0x23C2).
 */
export function readObjectReach(p: PolePositionII) {
  const [along, both, across] = instruction(
    p.second,
    0x236c,
    [
      0x210b,
      0x8be0,
      0x21b0,
      0x0b00,
      0x8006,
      0x9e0e,
      0x61b1,
      0x0008,
      0x0101,
      null,
      0x0301,
      null,
      0x9e0f,
      0x61b1,
      0x000a,
      0x8d14,
      0xed01,
      0x8d12,
      0x0b01,
      null,
      0xe916,
    ],
    "the gantry's reach",
  );
  const [archAlong, archBoth, archAcross] = instruction(
    p.second,
    0x247a,
    [
      0x0b00,
      0x800c,
      0xeef6,
      0x61b1,
      0x0008,
      0x0101,
      null,
      0x0301,
      null,
      0xefef,
      0x61b1,
      0x000a,
      0x8d14,
      0xed01,
      0x8d12,
      0x0b01,
      null,
      0xe1e7,
      0xe891,
    ],
    "the arch's reach",
  );
  if (both !== 2 * along! || archAlong !== along || archBoth !== both || archAcross !== across)
    throw romDiffers("The gantry's and the arch's reach differ");
  return { along: along!, beyond: across! };
}

/** The airship's or plane's kind, the second program's 0x0A1E's. */
export const CRAFT = 9;

/**
 * The airship or plane before the race (its command 25, the second program's 0x0794): $8BE0 of kind 9 in state 1 at x
 * 0x100 (0x07B2); its 0x0932 moves it 2 pixels left a frame and keeps it 4 of the high word's units ahead of the car,
 * fixed on the screen. Its x, which its colors and its sprites' places take at the start.
 */
export function readCraft(p: PolePositionII): { x: number; state: number } {
  const [kind, state] = instruction(
    p.second,
    0x0794,
    [0x210b, 0x8be0, 0x0db5, null, 0x4db5, 0x000c, null, 0xe807],
    'the craft before the race',
  );
  const [, x] = instruction(p.second, 0x07b2, [0x4db5, 0x0002, null, 0x4db5, 0x0006, null], "the craft's place");
  instruction(
    p.second,
    0x0932,
    [0x210b, 0x8be0, 0x0db1, 0x8009, 0x9e0e, 0x6bb1, 0x0006, 0x6101, 0x8184, 0xa913, 0x6fb1, 0x0002],
    "the craft's flight",
  );
  if (shownKind(kind!, 'The craft') !== CRAFT || state !== 1) throw romDiffers('The craft before the race differs');
  return { x: x!, state: state! };
}

/**
 * The second program's view of what it draws: its 0x0A86 puts an object `d` of the high word's units ahead on road line
 * 0x6F − 0x74 d / (d + 0x93), so its camera is 0x93 units behind the car; its 0x1D84 draws boards no farther than 0xF00.
 * With the line a board's big sprite is drawn 1:1 on (its size, (line + 4) / 2 − 1, 31) and the depth that line
 * takes, solved as continuous.
 */
export function readView(p: PolePositionII) {
  const [scale, behind, horizon] = instruction(
    p.second,
    0x0a86,
    [
      0x6102,
      0x8882,
      0x8d24,
      0xe517,
      0x0b02,
      0x1000,
      0xe90e,
      0xa121,
      0x1900,
      null,
      0x0102,
      null,
      0x9b20,
      0x8d12,
      0x0101,
      null,
    ],
    "an object's road line",
  );
  const [farthest] = instruction(
    p.second,
    0x1d84,
    [0x2105, 0x8d00, 0x2106, 0x0018, 0x2107, 0x0003, 0x4d51, 0x0004, null],
    "the boards' drawing limit",
  );
  // A board's big sprite is drawn its size + 1 pixels: 32 on the line where (line + 4) / 2 − 1 is 31.
  const line = 2 * (31 + 1) - 4;
  return {
    behind: behind!,
    scale: scale!,
    horizon: horizon!,
    farthest: farthest!,
    oneToOne: (behind! * (horizon! - line)) / (scale! - (horizon! - line)),
  };
}
