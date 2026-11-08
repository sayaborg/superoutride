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
import { edgePens, roadLines } from '../taito/tc0150rod.js';
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
