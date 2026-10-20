/**
 * OUTRUN's road data as its programs hold it ([Original road data](../../docs/original-road-data.md)): each stage's
 * colors, curves, widths and heights, and scenery on the main CPU, its road path and the height tables on the sub CPU.
 * Every reader takes a program as the 68000 addresses it (big-endian words and longs) and returns the table's entries
 * as numbers, without interpreting them further.
 */
import type { OutrunPrograms } from './outrun-rom.js';

/** The stage numbers of the world edition, by stage: 1 to 5, left to right as the tables list them. */
export const OUTRUN_STAGES: readonly (readonly number[])[] = Object.freeze([
  [0x3c],
  [0x1e, 0x3b],
  [0x20, 0x2f, 0x2a],
  [0x2d, 0x35, 0x33, 0x21],
  [0x32, 0x23, 0x38, 0x22, 0x26],
]);

/** Main CPU: the stage blocks' addresses, the fork stretch's tables, the goal stretches' blocks, the scenery types. */
const STAGE_BLOCKS = 0xe528;
const FORK_STRETCH = 0x1dfa4;
const GOAL_STRETCHES = 0xe514;
const GOALS = 5;
const SCENERY_TYPES = 0x1a43c;
/** Sub CPU: the stages' road paths, the fork's and goals' road paths and the height tables. */
const STAGE_PATHS = 0x1224;
const FORK_PATH = 0x3a33e;
const GOAL_PATH = 0x3aca0;
const HEIGHT_TABLES = 0x220a;
/** A stage's road path covers this many positions: the stage's 1948 and 360 looking ahead into the fork. */
const STAGE_PATH_POSITIONS = 0x904;
/** The fork stretch's path: its 384 positions and its look-ahead. Each goal stretch's path, shared by the five. */
const FORK_PATH_POSITIONS = 600;
const GOAL_PATH_POSITIONS = 624;
/**
 * Every stage is 1948 positions long, a constant of the main CPU's program: the `cmpi.w #$079C, ($260006).l` at 0x870A
 * that compares the road position with it.
 */
const STAGE_LENGTH_COMPARE = 0x870a;
const STAGE_LENGTH_OPCODE = [0x0c79, 0x0026, 0x0006] as const;

/** A stage's length in positions, read from its comparison in the main CPU's program, which is checked first. */
export function stageLength(main: Uint8Array): number {
  const [opcode, high, low] = STAGE_LENGTH_OPCODE;
  if (
    word(main, STAGE_LENGTH_COMPARE) !== opcode ||
    word(main, STAGE_LENGTH_COMPARE + 4) !== high ||
    word(main, STAGE_LENGTH_COMPARE + 6) !== low
  )
    throw new RangeError("The program at 0x870A does not compare the road position with the stage's length");
  return word(main, STAGE_LENGTH_COMPARE + 2);
}
/** No table runs longer than this without its end mark: past it, the address is not a table's. */
const MOST_ENTRIES = 4096;

const u8 = (p: Uint8Array, a: number) => at(p, a, 1)[0]!;
const s8 = (p: Uint8Array, a: number) => (u8(p, a) << 24) >> 24;
const word = (p: Uint8Array, a: number) => {
  const [hi, lo] = at(p, a, 2);
  return (hi! << 8) | lo!;
};
const sword = (p: Uint8Array, a: number) => (word(p, a) << 16) >> 16;
const long = (p: Uint8Array, a: number) => word(p, a) * 0x10000 + word(p, a + 2);
function at(p: Uint8Array, a: number, n: number) {
  if (!(a >= 0 && a + n <= p.length)) throw new RangeError(`Address 0x${a.toString(16)} lies outside the program`);
  return p.subarray(a, a + n);
}

/** Entries of `size` bytes from `address` until `end` says one is the end mark. */
function entries<T>(address: number, size: number, end: (a: number) => boolean, read: (a: number) => T) {
  const out: T[] = [];
  for (let a = address; !end(a); a += size) {
    if (out.length >= MOST_ENTRIES) throw new RangeError(`The table at 0x${address.toString(16)} has no end mark`);
    out.push(read(a));
  }
  return out;
}

/** A palette word's RGB555: each channel's four bits over the shared low bit its 12th, 13th or 14th bit holds. */
export function paletteRgb555(w: number): number {
  const r = ((w & 0xf) << 1) | ((w >> 12) & 1),
    g = (((w >> 4) & 0xf) << 1) | ((w >> 13) & 1),
    b = (((w >> 8) & 0xf) << 1) | ((w >> 14) & 1);
  return (r << 10) | (g << 5) | b;
}

/** A color entry: its address and palette words, and their RGB555. */
export interface Colors {
  readonly address: number;
  readonly words: readonly number[];
  readonly rgb555: readonly number[];
}
const colors = (p: Uint8Array, address: number, count: number): Colors => {
  const words = Array.from({ length: count }, (_, i) => word(p, address + 2 * i));
  return { address, words, rgb555: words.map(paletteRgb555) };
};

/** A curve segment's start: its position, radius in positions and kind (1 straight, 2 right, 3 left). */
export interface CurvePoint {
  readonly position: number;
  readonly radius: number;
  readonly kind: number;
}
/** {signed word position, word radius, word kind}, ending at position −1. */
export const readCurves = (p: Uint8Array, address: number): CurvePoint[] =>
  entries(
    address,
    6,
    (a) => sword(p, a) === -1,
    (a) => ({ position: sword(p, a), radius: word(p, a + 2), kind: word(p, a + 4) }),
  );

/** A width or height point: kind 0 a height (value a height table's number), any other a width (value its target). */
export interface WidthHeightPoint {
  readonly position: number;
  readonly kind: number;
  readonly value: number;
  readonly speed: number;
}
/** {word position, word kind, word value, signed word speed}, ending at position 0x7FFF. */
export const readWidthsHeights = (p: Uint8Array, address: number): WidthHeightPoint[] =>
  entries(
    address,
    8,
    (a) => word(p, a) === 0x7fff,
    (a) => ({ position: word(p, a), kind: word(p, a + 2), value: word(p, a + 4), speed: sword(p, a + 6) }),
  );

/** A scenery point: from its position, `count` objects of scenery type `type`. */
export interface SceneryPoint {
  readonly position: number;
  readonly count: number;
  readonly type: number;
}
/** {word position, u8 count, u8 type}, ending at position 0x7FFF. */
export const readScenery = (p: Uint8Array, address: number): SceneryPoint[] =>
  entries(
    address,
    4,
    (a) => word(p, a) === 0x7fff,
    (a) => ({ position: word(p, a), count: u8(p, a + 2), type: u8(p, a + 3) }),
  );

/** A stretch's tables: its curves, widths and heights, and scenery, by their addresses. */
export interface Stretch {
  readonly addresses: { readonly curves: number; readonly widthsHeights: number; readonly scenery: number };
  readonly curves: readonly CurvePoint[];
  readonly widthsHeights: readonly WidthHeightPoint[];
  readonly scenery: readonly SceneryPoint[];
}
const stretch = (main: Uint8Array, curves: number, widthsHeights: number, scenery: number): Stretch => ({
  addresses: { curves, widthsHeights, scenery },
  curves: readCurves(main, curves),
  widthsHeights: readWidthsHeights(main, widthsHeights),
  scenery: readScenery(main, scenery),
});

/** A stage: its block's address, its colors, its tables and its road path on the sub CPU. */
export interface Stage extends Stretch {
  readonly number: number;
  readonly block: number;
  readonly colors: {
    readonly sky: Colors;
    readonly centreLine: Colors;
    readonly laneLines: Colors;
    readonly edges: Colors;
    readonly surface: Colors;
    readonly ground: Colors;
  };
  /**
   * The ground's two colors, half 0 then half 1, RGB555: of the 16 palette words its ground number (the ground word)
   * points at through the long at 0x17350 + 4 × number, the 15th and 16th; the 14 before shade the far horizon.
   */
  readonly groundStripes: readonly [number, number];
  readonly path: Path;
}
/** Main CPU: the grounds' palette words, by ground number. */
const GROUNDS = 0x17350;

/**
 * Stage `number`'s block, the long at 0xE528 + number × 4: the sky's, centre line's, lane lines', edges', surface's and
 * ground's colors' addresses (four words for the lines, edges and surface, one for the sky and ground), then its curves',
 * widths and heights' and scenery's; the ground's two colors through its ground word (`groundStripes`).
 */
export function readStage({ main, sub }: OutrunPrograms, number: number): Stage {
  const block = long(main, STAGE_BLOCKS + number * 4);
  const pointer = (k: number) => long(main, block + 4 * k);
  return {
    number,
    block,
    colors: {
      sky: colors(main, pointer(0), 1),
      centreLine: colors(main, pointer(1), 4),
      laneLines: colors(main, pointer(2), 4),
      edges: colors(main, pointer(3), 4),
      surface: colors(main, pointer(4), 4),
      ground: colors(main, pointer(5), 1),
    },
    groundStripes: (() => {
      const ground = long(main, GROUNDS + 4 * word(main, pointer(5)));
      return [paletteRgb555(word(main, ground + 28)), paletteRgb555(word(main, ground + 30))] as const;
    })(),
    ...stretch(main, pointer(6), pointer(7), pointer(8)),
    path: readPath(sub, long(sub, STAGE_PATHS + number * 4), STAGE_PATH_POSITIONS),
  };
}

/** The fork stretch: its tables' addresses at 0x1DFA4, its road path on the sub CPU. */
export function readForkStretch({ main, sub }: OutrunPrograms): Stretch & { readonly path: Path } {
  return {
    ...stretch(main, long(main, FORK_STRETCH), long(main, FORK_STRETCH + 4), long(main, FORK_STRETCH + 8)),
    path: readPath(sub, FORK_PATH, FORK_PATH_POSITIONS),
  };
}

/** The five goal stretches: their blocks' addresses at 0xE514, each block its tables' addresses. */
export function readGoalStretches({ main, sub }: OutrunPrograms): { stretches: Stretch[]; path: Path } {
  const stretches = Array.from({ length: GOALS }, (_, g) => {
    const block = long(main, GOAL_STRETCHES + 4 * g);
    return stretch(main, long(main, block), long(main, block + 4), long(main, block + 8));
  });
  return { stretches, path: readPath(sub, GOAL_PATH, GOAL_PATH_POSITIONS) };
}

/** Main CPU: each stage's goal stretch by its place in the stage table (row r from 8r), a byte each. */
const GOAL_NUMBERS = 0xe4ec;
/** The goal stretch the stage at row `row` (0 to 4), `column` of the stage table ends in: 0x8A04's `move.b (a0, d0.w)`. */
export const goalNumber = (main: Uint8Array, row: number, column: number) => u8(main, GOAL_NUMBERS + 8 * row + column);

/** A road path: per position a heading vector {signed word x, signed word y}, its address and length. */
export interface Path {
  readonly address: number;
  readonly x: readonly number[];
  readonly y: readonly number[];
}
export function readPath(sub: Uint8Array, address: number, positions: number): Path {
  const x: number[] = [],
    y: number[] = [];
  for (let i = 0; i < positions; i++) {
    x.push(sword(sub, address + 4 * i));
    y.push(sword(sub, address + 4 * i + 2));
  }
  return { address, x, y };
}

/**
 * The heading's change from position `from` to `to` along a path, radians, counterclockwise positive in the vectors'
 * (x, y): the sum of each step's turn, each within ±π. Only the vectors' directions count.
 */
export function pathTurn(path: Path, from: number, to: number): number {
  let turn = 0;
  for (let i = from; i < to; i++) {
    const a = Math.atan2(path.y[i]!, path.x[i]!),
      b = Math.atan2(path.y[i + 1]!, path.x[i + 1]!);
    turn += Math.atan2(Math.sin(b - a), Math.cos(b - a));
  }
  return turn;
}

/**
 * The positions by which a stage's path runs ahead of its curves: of shifts within `reach`, the one under which the
 * path's heading rate (each step's turn) best matches the rate the curves give, ±1/R a position on a curve (left
 * positive), 0 on a straight, over the positions both cover. 0 for every stage but 0x38, whose path runs 48 ahead.
 */
export function pathOffset(curves: readonly CurvePoint[], path: Path, length: number, reach = 120): number {
  const rate = new Float64Array(length);
  curves.forEach((c, i) => {
    const end = Math.min(curves[i + 1]?.position ?? length, length);
    for (let p = c.position; p < end; p++) rate[p] = c.kind === 1 ? 0 : (c.kind === 3 ? 1 : -1) / c.radius;
  });
  const turn = (i: number) => {
    const a = Math.atan2(path.y[i]!, path.x[i]!),
      b = Math.atan2(path.y[i + 1]!, path.x[i + 1]!);
    return Math.atan2(Math.sin(b - a), Math.cos(b - a));
  };
  let best = 0,
    least = Infinity;
  for (let ahead = -reach; ahead <= reach; ahead++) {
    let squares = 0;
    for (let p = reach; p < length - reach; p++) squares += (rate[p]! - turn(p - ahead)) ** 2;
    if (squares < least) [best, least] = [ahead, squares];
  }
  return best;
}

/** A height table: its kind, step and its kind's values, then its signed entries (none for kind 4). */
export type HeightTable =
  | {
      readonly kind: 0;
      readonly step: number;
      readonly descent: number;
      readonly ascent: number;
      readonly entries: readonly number[];
    }
  | { readonly kind: 1 | 2; readonly step: number; readonly wait: number; readonly entries: readonly number[] }
  | { readonly kind: 3; readonly step: number; readonly value: number; readonly entries: readonly number[] }
  | { readonly kind: 4; readonly step: number; readonly horizon: number };

/**
 * Height table `number`, the long at 0x220A + number × 4 on the sub CPU: {u8 kind, u8 step}, then kind 0's u8 descent
 * and ascent factors, kinds 1 and 2's word wait, kind 3's word or kind 4's word horizon; the entries, signed words,
 * end at −1. Another kind is an error: the ROM disagrees with this reading.
 */
export function readHeightTable(sub: Uint8Array, number: number): HeightTable & { readonly address: number } {
  const address = long(sub, HEIGHT_TABLES + number * 4);
  const kind = u8(sub, address),
    step = u8(sub, address + 1);
  const list = () =>
    entries(
      address + 4,
      2,
      (a) => sword(sub, a) === -1,
      (a) => sword(sub, a),
    );
  switch (kind) {
    case 0:
      return { address, kind, step, descent: u8(sub, address + 2), ascent: u8(sub, address + 3), entries: list() };
    case 1:
    case 2:
      return { address, kind, step, wait: word(sub, address + 2), entries: list() };
    case 3:
      return { address, kind, step, value: word(sub, address + 2), entries: list() };
    case 4:
      return { address, kind, step, horizon: word(sub, address + 2) };
    default:
      throw new RangeError(`Height table ${number} at 0x${address.toString(16)} is of unknown kind ${kind}`);
  }
}

/** A scenery type's entry: flags, x (× 16 road-width units), y (× 128), its sprite and palette, and two unknown bytes. */
export interface SceneryEntry {
  readonly flags: number;
  readonly x: number;
  readonly y: number;
  readonly unknown: readonly [number, number];
  readonly sprite: number;
  readonly palette: number;
}

/**
 * Scenery type `type`, the long at 0x1A43C + type × 4: {word frequency, word last entry's offset} and 8-byte entries
 * {u8 flags, s8 x, signed word y, u8 unknown, u8 sprite, u8 unknown, u8 palette} up to that offset.
 */
export function readSceneryType(main: Uint8Array, type: number) {
  const address = long(main, SCENERY_TYPES + type * 4);
  const frequency = word(main, address),
    last = word(main, address + 2);
  if (last % 8) throw new RangeError(`Scenery type ${type}'s last entry's offset ${last} is not a multiple of 8`);
  const list: SceneryEntry[] = [];
  for (let offset = 0; offset <= last; offset += 8) {
    const a = address + 4 + offset;
    list.push({
      flags: u8(main, a),
      x: s8(main, a + 1),
      y: sword(main, a + 2),
      unknown: [u8(main, a + 4), u8(main, a + 6)],
      sprite: u8(main, a + 5),
      palette: u8(main, a + 7),
    });
  }
  return { address, frequency, last, entries: list };
}
