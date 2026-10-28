/**
 * OUTRUN's road data as its programs hold it ([OUTRUN road data](../../docs/outrun-road-data.md)): each stage's
 * colors, curves, widths and heights, and scenery on the main CPU, its road path and the height tables on the sub CPU.
 * Every reader takes a program as the 68000 addresses it (big-endian words and longs) and returns the table's entries
 * as numbers, without interpreting them further.
 */
import type { OutrunPrograms } from './outrun-rom.js';
import { instruction, long, s8, sword, u8, word } from './program-words.js';
import type { BoardClock } from './board-clock.js';
import { readHeightCounts, readLineDistances } from './hills.js';
import {
  readColors,
  readCurves,
  readPath,
  readScenery,
  readWidthsHeights,
  type Colors,
  type CurvePoint,
  type Path,
  type SceneryPoint,
  type WidthHeightPoint,
} from './road-tables.js';

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
/** Sub CPU: the stages' road paths, the fork's and goals' road paths. */
const STAGE_PATHS = 0x1224;
const FORK_PATH = 0x3a33e;
const GOAL_PATH = 0x3aca0;
/**
 * A sub CPU road path at `address`, its entries as many as the word before it holds bytes (four an entry), which the
 * programs do not read: a stage's 2280 to 2316, the stage's 1948 and those ahead; the fork stretch's 592, of which a
 * fork piece uses 63 to 431.5; the goal stretches' 624, shared by the five.
 */
function roadPath(sub: Uint8Array, address: number): Path {
  const bytes = word(sub, address - 2);
  if (bytes % 4 !== 0) throw new RangeError(`The road path at 0x${address.toString(16)} has ${bytes} bytes`);
  return readPath(sub, address, bytes / 4);
}
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
      sky: readColors(main, pointer(0), 1),
      centreLine: readColors(main, pointer(1), 4),
      laneLines: readColors(main, pointer(2), 4),
      edges: readColors(main, pointer(3), 4),
      surface: readColors(main, pointer(4), 4),
      ground: readColors(main, pointer(5), 1),
    },
    groundStripes: (() => {
      const ground = long(main, GROUNDS + 4 * word(main, pointer(5)));
      const [a, b] = readColors(main, ground + 28, 2).rgb555;
      return [a!, b!] as const;
    })(),
    ...stretch(main, pointer(6), pointer(7), pointer(8)),
    path: roadPath(sub, long(sub, STAGE_PATHS + number * 4)),
  };
}

/** The fork stretch: its tables' addresses at 0x1DFA4, its road path on the sub CPU. */
export function readForkStretch({ main, sub }: OutrunPrograms): Stretch & { readonly path: Path } {
  return {
    ...stretch(main, long(main, FORK_STRETCH), long(main, FORK_STRETCH + 4), long(main, FORK_STRETCH + 8)),
    path: roadPath(sub, FORK_PATH),
  };
}

/** The five goal stretches: their blocks' addresses at 0xE514, each block its tables' addresses. */
export function readGoalStretches({ main, sub }: OutrunPrograms): { stretches: Stretch[]; path: Path } {
  const stretches = Array.from({ length: GOALS }, (_, g) => {
    const block = long(main, GOAL_STRETCHES + 4 * g);
    return stretch(main, long(main, block), long(main, block + 4), long(main, block + 8));
  });
  return { stretches, path: roadPath(sub, GOAL_PATH) };
}

/** Main CPU: each stage's goal stretch by its place in the stage table (row r from 8r), a byte each. */
const GOAL_NUMBERS = 0xe4ec;
/** The goal stretch the stage at row `row` (0 to 4), `column` of the stage table ends in: 0x8A04's `move.b (a0, d0.w)`. */
export const goalNumber = (main: Uint8Array, row: number, column: number) => u8(main, GOAL_NUMBERS + 8 * row + column);

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

/**
 * OUTRUN's clock on its board ([the board's clock](../../docs/original-road-data.md#the-boards-clock)): its step, the
 * long at 0xE2EC (read at 0x6ABA); its tick's frames, the main loop's wait (`move.w #1, $60800` at 0x7DF4) counted down
 * by the frame interrupt (0x7CBE) past 0; its road's lines (`move.w #$200, d3` at S 0x1F36).
 */
export function readClock({ main, sub }: OutrunPrograms): BoardClock {
  const [wait] = instruction(main, 0x7df4, [0x33fc, null, 0x0006, 0x0800], "the main loop's wait");
  const [lines] = instruction(sub, 0x1f36, [0x363c, null], "the road's lines");
  return { step: long(main, 0xe2ec), frames: wait! + 1, lines: lines!, heights: readHeightCounts(sub, 0x1b12) };
}

/** Where the sub program copies its stripes to the road (`lea $109EE.l, a0` at S 0x1ACA). */
const STRIPES_AT = 0x1aca;

/**
 * The road's lines' distances ahead of the car, positions, near to far, by `clock` ([Hills](../../docs/original-road-data.md#hills),
 * A line's distance), read from the stripes the sub program copies to the road.
 */
export const lineDistances = ({ sub }: OutrunPrograms, clock: BoardClock) =>
  readLineDistances(sub, STRIPES_AT, clock.lines, clock);
