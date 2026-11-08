/**
 * CHASE H.Q.'s road picture ([Original road data](../../../docs/original-road-data.md#an-originals-modules)): its
 * road at the sub program's nearest row, its edges' width beyond the lanes' and its bands' colors, each found by the
 * instructions that read it. The TC0150ROD draws a line's body between its edges, its edges outward from them and the
 * ground beyond, each in a line of the palette by the line's bank (its color bank over 4, 0 to 7, which the stripes
 * step), its body a line above its edges' (S 0x348C): a body pen p of bank b is palette entry (0xC1 + 4b) × 16 + 4 + p,
 * an edge's (0xC0 + 4b) × 16 + 4 + p, the ground its pen 0.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { rgb555Of } from '../taito/palette.js';
import { edgePens, PRIORITY_BIT, roadLines, TC0150ROD_LEVELS } from '../taito/tc0150rod.js';
import { LANE_METRES } from './chase-hq-road.js';

/** The road's banks, and the palette's road lines from 0xC0 (MAME's driver draws CHASE H.Q.'s road from 0xC0). */
export const BANKS = 8;
const ROAD_LINES = 0xc0;
const entry = (line: number, pen: number) => line * 16 + 4 + pen;

const long = (high: number, low: number) => high * 0x10000 + low;

/** A list of palette entries from `at` to its 0 (M 0xFF2). */
function entries(main: Uint8Array, at: number): number[] {
  const out: number[] = [];
  for (let a = at; word(main, a) !== 0; a += 2) {
    if (out.length > 64) throw romDiffers(`The palette list at 0x${at.toString(16)} has no end`);
    out.push(word(main, a));
  }
  return out;
}

/**
 * Which word sets each road palette entry: the road palette entry's four words, each to its list (M 0xF38, 0xF4E,
 * 0xF62, 0xF76), and the stage's two, each to its list in turn (M 0xE46, 0xE56), the second's list after the first's 0.
 */
function sources(main: Uint8Array) {
  const road = [0xf38, 0xf4e, 0xf62, 0xf76].map((a, k) =>
    long(...instruction(main, a, [0x267c, null, null], `the road palette's word ${k + 1}'s entries (movea.l)`)),
  );
  const stage = long(...instruction(main, 0xe46, [0x267c, null, null], "the stage colors' entries (movea.l)"));
  const stageWords = long(...instruction(main, 0xe56, [0x207c, null, null], 'the stage colors (movea.l)'));
  instruction(main, 0xe60, [0xe540], 'four bytes a stage (asl.w #2)');
  const first = entries(main, stage);
  const second = entries(main, stage + 2 * (first.length + 1));
  const lists = [...road.map((a) => entries(main, a)), first, second];
  const source = (e: number) => {
    const k = lists.findIndex((l) => l.includes(e));
    if (k < 0) throw romDiffers(`No palette word sets the road's entry 0x${e.toString(16)}`);
    return k < 4 ? ({ road: k } as const) : ({ stage: k - 4 } as const);
  };
  return { source, stageWords };
}

/** The sub program's nearest row (S 0xA60), its road tile (S 0x3498) and a lane's pixels there (S 0x9D2, 9 a row). */
function nearestRow(sub: Uint8Array) {
  const [last] = instruction(sub, 0xa60, [0x303c, null], "the rows' count (move.w)");
  const tiles = long(...instruction(sub, 0x3498, [0x47f9, null, null], "the rows' road tiles (lea)"));
  const widths = long(...instruction(sub, 0x9d2, [0x41f9, null, null], "the rows' widths (lea)"));
  instruction(sub, 0x9e4, [0x0241, 0x01ff], "a width's pixels (andi.w #$1ff)");
  const tile = word(sub, tiles + 2 * last);
  if (tile > 0x3ff) throw romDiffers("The nearest row's road tile is no tile");
  // A row's widths are the lanes' edges from P, 4 left to 4 right; the first right of P is a lane's.
  const lanePixels = word(sub, widths + 2 * (9 * last + 5)) & 0x1ff;
  return { tile, lanePixels };
}

/** A color of the road's: from the road palette entry's word or from the stage's. */
export type RoadColor = { readonly road: number } | { readonly stage: number };

/**
 * The road at its nearest row: each edge's width beyond its lanes, metres, the same each side, and for each bank, the
 * colors' sources of each edge's pens outward, of the body's pen 3 and of the ground; and the stage's two colors.
 */
export function chaseHqRoadPicture(main: Uint8Array, sub: Uint8Array, rod: Uint8Array) {
  const { source, stageWords } = sources(main);
  const { tile, lanePixels } = nearestRow(sub);
  const { edge } = roadLines(rod, tile);
  const [left, right] = [edgePens(edge, -1), edgePens(edge, 1)];
  if (left.length !== right.length || left.some((p, i) => p !== right[i]))
    throw romDiffers("The road's two edges differ");
  const banks = Array.from({ length: BANKS }, (_, b) => ({
    edge: left.map((p) => source(entry(ROAD_LINES + 4 * b, p))),
    body: source(entry(ROAD_LINES + 4 * b + 1, 3)),
    ground: source(entry(ROAD_LINES + 4 * b, 0)),
  }));
  return {
    edgeMetres: (left.length / lanePixels) * LANE_METRES,
    banks,
    stageColors: (stage: number) => [0, 1].map((k) => rgb555Of(word(main, stageWords + 4 * stage + 2 * k))),
  };
}

/** A road line word's palette bits (bits 12 and 11 of its words 0 to 2). */
const PALETTE_BITS = 0x1800;

/**
 * Where the sub program sets the high bits of a road line's words 0 to 2, each instruction's opcode word, its operand
 * the bits: its body's (word 2) where it writes the two roads' lines (S 0x43F6, 0x4434, 0x445C; 0x48CE, 0x490C, 0x4934)
 * and the dirt road's rows' (S 0x3BAC, 0x3BB0), and its edges' (words 0 and 1) background bits (S 0x3FEA to 0x4078,
 * 0x410A) and the dirt road's rows' (S 0x415C, 0x4160).
 */
const BODY_BITS = Object.freeze([
  [0x43f6, 0x0047],
  [0x4434, 0x0047],
  [0x445c, 0x0044],
  [0x48ce, 0x0047],
  [0x490c, 0x0047],
  [0x4934, 0x0044],
] as const);
const OTHER_BITS = Object.freeze([
  [0x3bac, 0x3c3c],
  [0x3bb0, 0x3e3c],
  ...[0x3fea, 0x4000, 0x400c, 0x4052, 0x4068, 0x4074].flatMap((a) => [
    [a, 0x343c],
    [a + 4, 0x3a3c],
  ]),
  [0x410a, 0x323c],
  [0x415c, 0x323c],
  [0x4160, 0x0041],
] as const);

/**
 * The order of the two roads CHASE H.Q. draws at a fork, and the road not taken's colors: no word of a line sets its
 * priority bit, so the TC0150ROD's order is its own with none (`TC0150ROD_LEVELS`). The sub program writes a line's
 * words 0 to 2 (S 0x4216, 0x4482 and 0x46EE) from its edges' pixels (S 0x9E4) with the bits each instruction sets,
 * ORed into its edges' tables (S 0x40B2, 0x40BA, 0x4116, 0x4118), stored there (S 0x4172, 0x4174) or into the dirt
 * road's rows' body bits (S 0x3BCC, 0x3BDE, read at S 0x4662, 0x46C8); the two roads' bodies take one palette's bits,
 * and each row's word 3, its bank and tile, is written to both roads' tables alike (S 0x349E to 0x34C6), which each road's lines take
 * (S 0x41A4, 0x41EE), so that the road not taken's colors and stripes are the course's row by row.
 */
export function chaseHqRoadLevels(sub: Uint8Array) {
  const bits = [...BODY_BITS, ...OTHER_BITS].map(([at, opcode]) => {
    const [value] = instruction(sub, at, [opcode, null], "a road line word's high bits (ori.w, move.w)");
    if (value & PRIORITY_BIT)
      throw romDiffers(`The sub program sets a road line's priority bit at 0x${at.toString(16)}`);
    return value;
  });
  for (const [at, words] of [
    [0x40b2, [0x8558]],
    [0x40ba, [0x8b59]],
    [0x4116, [0x8358]],
    [0x4118, [0x8359]],
    [0x4172, [0x34c1]],
    [0x4174, [0x36c1]],
    [0x3bcc, [0x34c6]],
    [0x3bde, [0x34c7]],
    [0x4662, [0x8e6d, 0x00ce]],
    [0x46c8, [0x886d, 0x00d0]],
  ] as const)
    instruction(sub, at, words, "a road line's words' high bits set (or.w, move.w)");
  if (new Set(bits.slice(0, BODY_BITS.length).map((b) => b & PALETTE_BITS)).size !== 1)
    throw romDiffers("The two roads' bodies take different palettes");
  instruction(sub, 0x349e, [0x45f9, 0x0010, 0x1384], "road A's banks and tiles (lea)");
  instruction(sub, 0x34a4, [0x43f9, 0x0010, 0x2bc6], "road B's banks and tiles (lea)");
  instruction(sub, 0x34c4, [0x34c1, 0x32c1], "a row's bank and tile, road A's and road B's alike (move.w)");
  instruction(sub, 0x41a4, [0x4bf9, 0x0010, 0x1384], "road A's lines' banks and tiles (lea)");
  instruction(sub, 0x41ee, [0x4bf9, 0x0010, 0x2bc6], "road B's lines' banks and tiles (lea)");
  return TC0150ROD_LEVELS;
}
