/**
 * ENDURO RACER's road as its programs hold it ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-programs)):
 * the stages' ends and road paths, the road's and ground's colors, the water crossings, the stripes' pattern, the
 * hills' table and the position where stage 3's background comes in.
 */
import { entries, instruction, long, sword, u8, word } from './program-words.js';
import { readColors } from './road-tables.js';

/** Main CPU (its data image). */
const STAGE_ENDS = 0x53ac;
const ROAD_COLORS = 0xd948;
const GROUND_COLORS = 0xd918;
const WATER_CROSSINGS = 0xd83c;
/** The hills' table: 8-byte {start, target1, hold's end, target2}, ending at a start of 0x7FFF. */
const HILLS = 0xde9c;
const HILLS_END = 0x7fff;
/** Sub CPU: the road paths' list and the stripes' pattern. */
const PATH_LIST = 0x592;
const PATH_LIST_LENGTH = 8;
const STRIPES = 0xd4e;
const STRIPES_BYTES = 0x200;

/** Five stages, each 2048 road positions, run without a stop. */
export const STAGES = 5;
export const STAGE_POSITIONS = 2048;

/**
 * The stages' ends: the words at 0x53AC, the position's high byte the bike passes at each stage's end (the bike's
 * position as 24.8 plus 0xC0, its upper word). Each is checked to end a stage of 2048 positions.
 */
export function readStageEnds(main: Uint8Array): number[] {
  const ends = Array.from({ length: STAGES }, (_, s) => word(main, STAGE_ENDS + 2 * s));
  ends.forEach((end, s) => {
    if (end * 256 !== (s + 1) * STAGE_POSITIONS)
      throw new RangeError(`Stage ${s + 1} does not end at its 2048th position`);
  });
  return ends;
}

/** A road path: 2048 points' {signed word x, signed word y}, x to the right and y ahead, from its address. */
export interface RoadPath {
  readonly address: number;
  readonly x: readonly number[];
  readonly y: readonly number[];
}

/** The road path at `address`. */
const roadPath = (sub: Uint8Array, address: number): RoadPath => ({
  address,
  x: Array.from({ length: STAGE_POSITIONS }, (_, p) => sword(sub, address + 4 * p)),
  y: Array.from({ length: STAGE_POSITIONS }, (_, p) => sword(sub, address + 4 * p + 2)),
});

/** The sub CPU's eight longs at 0x592: its paths by a count that starts at 0 and gains one at each 2048 positions. */
const pathList = (sub: Uint8Array) => Array.from({ length: PATH_LIST_LENGTH }, (_, k) => long(sub, PATH_LIST + 4 * k));

/** The stages' road paths in running order: stage s (0 from) runs the path the list's long s names. */
export const readRoadPaths = (sub: Uint8Array): RoadPath[] =>
  pathList(sub)
    .slice(0, STAGES)
    .map((address) => roadPath(sub, address));

/**
 * The road past the last stage's end: the path the list's long `STAGES` names, which the count reaches as the position
 * enters 2048 × `STAGES`, the main program's road object running on in the goal's mode.
 */
export const readPastGoal = (sub: Uint8Array): RoadPath => roadPath(sub, pathList(sub)[STAGES]!);

/**
 * Stage s's road colors: palette 0x38–0x3F, the 8 words at 0xD948 + 16s (stage 5's at 0xD948 + 0x60): surface,
 * edge's narrow band and edge's middle band, each band A then B.
 */
export const readRoadColors = (main: Uint8Array, stage: number) =>
  readColors(main, ROAD_COLORS + 16 * (stage === STAGES - 1 ? 6 : stage), 8);

/**
 * Stage s's ground colors: background colors 0x7D0–0x7D7, the 8 words at 0xD918 + 8s; 0x7D3 left of the road's fold
 * and 0x7D1 right of it, 0x7D2 and 0x7D0 on the row where the stripes change.
 */
export const readGroundColors = (main: Uint8Array, stage: number) => readColors(main, GROUND_COLORS + 8 * stage, 8);

/** A water crossing: the road's surface and edges give way to the ground from `from` to `to` (positions). */
export interface WaterCrossing {
  readonly from: number;
  readonly to: number;
  readonly frame: number;
}
/** The water crossings at 0xD83C: {long start, long end (position << 8), word frame}, ending at 0x7FFFFFFF. */
export const readWaterCrossings = (main: Uint8Array): WaterCrossing[] =>
  entries(
    WATER_CROSSINGS,
    10,
    (a) => long(main, a) === 0x7fffffff,
    (a) => ({ from: long(main, a) / 256, to: long(main, a + 4) / 256, frame: word(main, a + 8) }),
  );

/**
 * The stripes' pattern on the sub CPU at 0xD4E: 32 steps of 16 bytes, each 128 rows' bits of where a stripe's border
 * falls, chosen by (the position's long & 0x1F0).
 */
export const readStripes = (sub: Uint8Array): number[] =>
  Array.from({ length: STRIPES_BYTES }, (_, i) => u8(sub, STRIPES + i));

/** A step of the stripes' pattern: 16 bytes, the borders from the road's farthest line to its nearest. */
const STRIPE_STEP_BYTES = 16;

/**
 * The stripes' bands by position (S 0x47E, S 0xC36 to 0xC46): the sub CPU starts its stripe words as one long
 * (`move.l #$FF0000, $42(a5)`), takes them each frame swapped while the position's 24.8 long has the bit `andi.w`
 * names, and swaps them again at each border its pattern's step marks on the way to the road's nearest line, which
 * shows the low word: band B where it is set. `period` is the positions a band holds; `first` the band (0 A, 1 B) the
 * nearest line shows at position 0, the pattern's first step.
 */
export function readStripeBands(sub: Uint8Array): { readonly period: number; readonly first: 0 | 1 } {
  const [high, low] = instruction(
    sub,
    0x47e,
    [0x2b7c, null, null, 0x0042],
    'the stripe words (move.l #$FF0000, $42(a5))',
  );
  instruction(sub, 0xc36, [0x2c2d, 0x0042, 0x202d, 0x0184, 0x3600], 'the stripe words and the position read');
  const [bit] = instruction(sub, 0xc40, [0x0243, null], "the position's bit (andi.w #$200, d3)");
  instruction(sub, 0xc44, [0x6702, 0x4846], 'the stripe words swapped (beq; swap d6)');
  const borders = readStripes(sub)
    .slice(0, STRIPE_STEP_BYTES)
    .reduce((n, byte) => n + [...byte.toString(2)].filter((b) => b === '1').length, 0);
  return { period: bit! / 256, first: (borders % 2 ? high : low) ? 1 : 0 };
}

/**
 * A hill as the main CPU runs it: from `start` the slope words fall to `target1`, hold to `holdEnd`, rise past
 * `target2` and return to level (positions; words of the sub CPU's slope).
 */
export interface Hill {
  readonly start: number;
  readonly target1: number;
  readonly holdEnd: number;
  readonly target2: number;
}

/** The hills' table at 0xDE9C, in running order: {word start, signed word target1, word hold's end, signed word target2}. */
export const readHills = (main: Uint8Array): Hill[] =>
  entries(
    HILLS,
    8,
    (a) => word(main, a) === HILLS_END,
    (a) => ({
      start: word(main, a),
      target1: sword(main, a + 2),
      holdEnd: word(main, a + 4),
      target2: sword(main, a + 6),
    }),
  );

/** The position where stage 3's background comes in: the fourth hill's hold's end (0xDEB8), checked to be 4068. */
export function readStage3Background(main: Uint8Array): number {
  const position = readHills(main)[3]?.holdEnd;
  if (position !== 4068) throw new RangeError(`Stage 3's background comes in at ${position}, not 4068`);
  return position;
}
