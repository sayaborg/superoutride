/**
 * POLE POSITION II's scenery ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-objects)):
 * each course's boards along its road, where the second program places them, the pictures it builds them of and how
 * near the car may come; each table found by the instructions that read it.
 */
import { instruction } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { PolePositionII } from './pole-position-ii-rom.js';
import { COURSES } from './pole-position-ii-road.js';

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
