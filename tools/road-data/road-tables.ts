/**
 * The road tables the originals' programs share in OUTRUN's format ([Original road data](../../docs/original-road-data.md)):
 * palette words, curves, widths and heights, scenery points, road paths and height tables. Every reader takes a program
 * as the 68000 addresses it and returns the table's entries as numbers, without interpreting them further.
 */
import { requireInput } from '../course/authoring-io.js';
import { entries, long, sword, u8, word } from './program-words.js';
import { simplified } from './section-writing.js';

/** OUTRUN's height tables on the sub CPU: the default table of `readHeightTable`. */
const HEIGHT_TABLES = 0x220a;

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

/** The `count` palette words at `address`, and their RGB555. */
export const readColors = (p: Uint8Array, address: number, count: number): Colors => {
  const words = Array.from({ length: count }, (_, k) => word(p, address + 2 * k));
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
 * Height table `number`, the long at 0x220A + number × 4 on the sub CPU (`tables`, TURBO OUTRUN's 0x2156): {u8 kind, u8
 * step}, then kind 0's u8 descent and ascent factors, kinds 1 and 2's word wait, kind 3's word or kind 4's word horizon;
 * the entries, signed words, end at −1. Another kind is an error: the ROM disagrees with this reading.
 */
export function readHeightTable(
  sub: Uint8Array,
  number: number,
  tables = HEIGHT_TABLES,
): HeightTable & { readonly address: number } {
  const address = long(sub, tables + number * 4);
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

/** The road width approaches a width point's target by its speed × 16 / 303 units a position. */
export const WIDTH_RATE = 16 / 303;

/**
 * The road width along a stage, units, as knots `[position, width]` to `end`: from `start` at 0 (450 at the game's start),
 * each width point approaches its target from its position at its rate until it is reached or the next point begins.
 */
export function roadWidths(points: readonly WidthHeightPoint[], end: number, start: number): [number, number][] {
  const targets = points.filter((p) => p.kind !== 0 && p.position < end);
  const knots: [number, number][] = [[0, start]];
  let width = start;
  targets.forEach((p, i) => {
    const next = targets[i + 1]?.position ?? end;
    knots.push([p.position, width]);
    const rate = Math.abs(p.speed) * WIDTH_RATE;
    if (p.value === width) return;
    requireInput(rate > 0, `/widthsHeights/${p.position}`, `The width point at ${p.position} has no speed`);
    const reach = p.position + Math.abs(p.value - width) / rate;
    if (reach < next) {
      width = p.value;
      knots.push([reach, width]);
    } else {
      width += Math.sign(p.value - width) * rate * (next - p.position);
      knots.push([next, width]);
    }
  });
  knots.push([end, width]);
  return simplified(knots);
}
