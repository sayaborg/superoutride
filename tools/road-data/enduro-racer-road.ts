/**
 * ENDURO RACER's road as its programs hold it ([Original road data](../../docs/original-road-data.md#enduro-racers-road)):
 * the stages' ends and road paths, the road's and ground's colors, the water crossings, the stripes' pattern and the
 * position where stage 3's background comes in.
 */
import { entries, long, sword, u8, word } from './program-words.js';
import { paletteRgb555, type Colors } from './road-tables.js';

/** Main CPU (its data image). */
const STAGE_ENDS = 0x53ac;
const ROAD_COLORS = 0xd948;
const GROUND_COLORS = 0xd918;
const WATER_CROSSINGS = 0xd83c;
/** The word holding the position where stage 3's background comes in: the hills' section table's. */
const STAGE_3_BACKGROUND = 0xdeb8;
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

/**
 * The stages' road paths in running order: the sub CPU's eight longs at 0x592 list its paths by a count that starts at
 * 0 and gains one at each stage's start after the first, so stage s (0 from) runs the path the list's long s names.
 */
export function readRoadPaths(sub: Uint8Array): RoadPath[] {
  const list = Array.from({ length: PATH_LIST_LENGTH }, (_, k) => long(sub, PATH_LIST + 4 * k));
  return list.slice(0, STAGES).map((address) => ({
    address,
    x: Array.from({ length: STAGE_POSITIONS }, (_, p) => sword(sub, address + 4 * p)),
    y: Array.from({ length: STAGE_POSITIONS }, (_, p) => sword(sub, address + 4 * p + 2)),
  }));
}

const colors = (main: Uint8Array, address: number, count: number): Colors => {
  const words = Array.from({ length: count }, (_, k) => word(main, address + 2 * k));
  return { address, words, rgb555: words.map(paletteRgb555) };
};

/**
 * Stage s's road colors: palette 0x38–0x3F, the 8 words at 0xD948 + 16s (stage 5's at 0xD948 + 0x60): surface,
 * edge's narrow band and edge's middle band, each band A then B.
 */
export const readRoadColors = (main: Uint8Array, stage: number) =>
  colors(main, ROAD_COLORS + 16 * (stage === STAGES - 1 ? 6 : stage), 8);

/**
 * Stage s's ground colors: background colors 0x7D0–0x7D7, the 8 words at 0xD918 + 8s; 0x7D3 left of the road's fold
 * and 0x7D1 right of it, 0x7D2 and 0x7D0 on the row where the stripes change.
 */
export const readGroundColors = (main: Uint8Array, stage: number) => colors(main, GROUND_COLORS + 8 * stage, 8);

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

/** The position where stage 3's background comes in: the word at 0xDEB8, checked to be 4068. */
export function readStage3Background(main: Uint8Array): number {
  const position = word(main, STAGE_3_BACKGROUND);
  if (position !== 4068) throw new RangeError(`Stage 3's background comes in at ${position}, not 4068`);
  return position;
}
