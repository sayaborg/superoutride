/**
 * SUPER MONACO GP's courses as its programs hold them
 * ([SUPER MONACO GP road data](../../../docs/super-monaco-gp-road-data.md#super-monaco-gps-courses-tables)): each course's descriptor,
 * heading table, road path and scenery list with its groups, and the barriers' band tables.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { long, s8, sword, u8, word } from '../sega-16/program-words.js';

/** Sub CPU: the descriptors' list, eight longs, course 0 the qualifying's and 1 the race's. */
const DESCRIPTORS = 0x42be;
/** A descriptor's longs address the sub CPU in their low 20 bits. */
const ADDRESS = 0xfffff;
/** Main CPU: each course's band tables, left and right. */
const BANDS = Object.freeze([
  { left: 0xc4e4, right: 0xc556 },
  { left: 0xc4ae, right: 0xc50e },
] as const);

/** No band table runs longer than this. */
const MOST_BANDS = 256;
/** The two courses: the qualifying's (0) and the race's (1). */
export const COURSES = Object.freeze(['qualifying', 'race'] as const);
export type CourseForm = (typeof COURSES)[number];

/** A course's descriptor: the addresses of its heading table, scenery list, road path and map on the sub CPU. */
export interface Descriptor {
  readonly address: number;
  readonly headings: number;
  readonly scenery: number;
  readonly path: number;
  readonly map: number;
}

/** Course `course`'s descriptor: the long at 0x42BE + 4 × course names its four longs. */
export function readDescriptor(sub: Uint8Array, course: number): Descriptor {
  const address = long(sub, DESCRIPTORS + 4 * course);
  const [headings, scenery, path, map] = [0, 1, 2, 3].map((k) => long(sub, address + 4 * k) & ADDRESS) as [
    number,
    number,
    number,
    number,
  ];
  return { address, headings, scenery, path, map };
}

/**
 * The heading table T1: a word N, then N words, each a step's heading in 1024ths of a turn, atan2(dx, dy) with x right
 * and y ahead: a heading that grows turns right.
 */
export function readHeadings(sub: Uint8Array, address: number): number[] {
  const count = word(sub, address);
  return Array.from({ length: count }, (_, k) => word(sub, address + 2 + 2 * k));
}

/** The road path: N steps of {signed byte dx, dy, dz}, which close on themselves. */
export function readPath(sub: Uint8Array, address: number, steps: number) {
  const dx: number[] = [],
    dy: number[] = [],
    dz: number[] = [];
  for (let k = 0; k < steps; k++) {
    dx.push(s8(sub, address + 3 * k));
    dy.push(s8(sub, address + 3 * k + 1));
    dz.push(s8(sub, address + 3 * k + 2));
  }
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  if (sum(dx) || sum(dy) || sum(dz)) throw romDiffers(`The road path at 0x${address.toString(16)} does not close`);
  return { dx, dy, dz };
}

/**
 * A scenery object of a group: its size class b1, kind (0x04 a flat board, 0x08 a standing one, 0x0C one that changes
 * with the angle), sprite flags (palette, bit 10 mirrored, bit 11 flipped, bit 13 its middle its base point), frame
 * table (a 0x0C object's view table), x (4 to a unit) and height.
 */
export interface SceneryObject {
  readonly b1: number;
  readonly kind: number;
  readonly flags: number;
  readonly frames: number;
  readonly x: number;
  readonly height: number;
}

/** A group: a word 4n, then n objects of 10 bytes {b1, kind, word flags, word frames, signed x, signed height}. */
export function readGroup(sub: Uint8Array, address: number): SceneryObject[] {
  const count = word(sub, address) / 4;
  if (!Number.isInteger(count)) throw romDiffers(`The group at 0x${address.toString(16)} does not count by 4`);
  return Array.from({ length: count }, (_, i) => {
    const a = address + 2 + 10 * i;
    return {
      b1: u8(sub, a),
      kind: u8(sub, a + 1),
      flags: word(sub, a + 2),
      frames: word(sub, a + 4),
      x: sword(sub, a + 6),
      height: sword(sub, a + 8),
    };
  });
}

/**
 * The scenery list: a long, its bytes, then a word each step, bit 15 mirrored and its low 15 bits a group (0x05CA the
 * empty one).
 */
export function readSceneryList(sub: Uint8Array, address: number) {
  const words = long(sub, address) / 2;
  return Array.from({ length: words }, (_, k) => {
    const w = word(sub, address + 4 + 2 * k);
    return { mirrored: (w & 0x8000) !== 0, group: w & 0x7fff };
  });
}

/** A band: the steps up to `end` (before it) and the band's kind t1 (the left table's negative). */
export interface Band {
  readonly end: number;
  readonly t1: number;
}

/**
 * A band table: 6-byte entries {word end, signed t1, signed t2}, up to the first whose end is at least `steps`; no rule
 * reads t2.
 */
export function readBands(main: Uint8Array, address: number, steps: number): Band[] {
  const bands: Band[] = [];
  for (let a = address; !bands.length || bands.at(-1)!.end < steps; a += 6) {
    if (bands.length >= MOST_BANDS) throw romDiffers(`The band table at 0x${address.toString(16)} has no end`);
    bands.push({ end: word(main, a), t1: sword(main, a + 2) });
  }
  return bands;
}

/** Course `course`'s band tables, left and right. */
export const readCourseBands = (main: Uint8Array, course: number, steps: number) => ({
  left: readBands(main, BANDS[course]!.left, steps),
  right: readBands(main, BANDS[course]!.right, steps),
});
