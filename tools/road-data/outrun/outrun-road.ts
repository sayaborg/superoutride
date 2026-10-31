/**
 * OUTRUN's road data as its programs hold it ([OUTRUN road data](../../../docs/outrun-road-data.md)): each stage's
 * colors, curves, widths and heights, and scenery on the main CPU, its road path and the height tables on the sub CPU.
 * Every reader takes a program as the 68000 addresses it (big-endian words and longs) and returns the table's entries
 * as numbers, without interpreting them further.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import type { OutrunPrograms } from './outrun-rom.js';
import { instruction, long, s8, shiftCount, sword, u8, word } from '../sega-16/program-words.js';
import type { ProgramClock } from '../out-run-hardware/clock.js';
import { readHeightCounts, readLineDistances } from '../out-run-hardware/hills.js';
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
} from '../out-run-hardware/road-tables.js';

/**
 * The stage numbers of the world edition, by row 1 to 5, left to right: the stage table the program at 0xE4CA copies
 * to the shared RAM ($260010), its address and its longs less one the operands of `move.w #9, d0` at 0xE4D4 and
 * `lea.l $E49C, a1` at 0xE4DE, a row 8 bytes; row r (0 from) its first r + 1, the rest 0.
 */
export function readStages(main: Uint8Array): readonly (readonly number[])[] {
  const [longs] = instruction(main, 0xe4d4, [0x303c, null], "the stage table's copy");
  const [high, low] = instruction(main, 0xe4de, [0x43f9, null, null], "the stage table's address");
  const table = (high! << 16) | low!;
  const rows = ((longs! + 1) * 4) / STAGE_ROW;
  return Object.freeze(
    Array.from({ length: rows }, (_, r) => {
      const row = Array.from(main.subarray(table + STAGE_ROW * r, table + STAGE_ROW * (r + 1)));
      if (row.slice(0, r + 1).includes(0) || row.slice(r + 1).some((n) => n !== 0))
        throw romDiffers(`The stage table's row ${r + 1} does not hold ${r + 1} stages`);
      return Object.freeze(row.slice(0, r + 1));
    }),
  );
}
/** A stage table row's bytes. */
const STAGE_ROW = 8;

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
/** Sub CPU: the height tables (`readHeightTable`). */
export const OUTRUN_HEIGHT_TABLES = 0x220a;
/**
 * A sub CPU road path at `address`, its entries as many as the word before it holds bytes (four an entry), which the
 * programs do not read: a stage's 2280 to 2316, the stage's 1948 and those ahead; the fork stretch's 592, of which a
 * fork piece uses 63 to 431.5; the goal stretches' 624, shared by the five.
 */
function roadPath(sub: Uint8Array, address: number): Path {
  const bytes = word(sub, address - 2);
  if (bytes % 4 !== 0) throw romDiffers(`The road path at 0x${address.toString(16)} has ${bytes} bytes`);
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
    throw romDiffers("The program at 0x870A does not compare the road position with the stage's length");
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
  /** Its length, positions: every stage's, the program's (`stageLength`). */
  readonly length: number;
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
    length: stageLength(main),
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

/**
 * How the main CPU runs a stretch whose roads part: from road position `parts` the road width is the width the stretch
 * began at plus (the position − `parts`) shifted left, `spread` units a position, until it passes `apart`, where the
 * road not taken is no longer drawn and the width holds.
 */
export interface Parting {
  readonly parts: number;
  readonly spread: number;
  readonly apart: number;
}

/**
 * A parting's instructions, checked: its start (`cmpi.w #parts, $260006`), its spread (`subi.w #parts, d0` then `asl.w
 * #n, d0`) and its end (`cmpi.w #apart, $260314`).
 */
function readParting(main: Uint8Array, [start, spread, end]: readonly [number, number, number], what: string): Parting {
  const [parts] = instruction(main, start, [0x0c79, null, 0x0026, 0x0006], `the ${what}'s parting`);
  const [less, shift] = instruction(main, spread, [0x0440, null, null], `the ${what}'s spread`);
  if (less !== parts) throw romDiffers(`The ${what}'s spread is not as read`);
  const [apart] = instruction(main, end, [0x0c79, null, 0x0026, 0x0314], `the ${what}'s roads apart`);
  return { parts: parts!, spread: 2 ** shiftCount(shift!, 0xe140, `${what}'s spread`), apart: apart! };
}

/** The fork stretch: its tables, its road path on the sub CPU, and how the main CPU runs it (0x8780 to 0x89B6). */
export interface ForkStretch extends Stretch {
  readonly path: Path;
  /**
   * Its parting from 63 by 8 a position to 0x300 (768; 0x87CA, 0x87E4, 0x8898); the route chosen, and the next stage's
   * sky wiping in, where the width passes `chosen`, 0x168 (360; `cmpi.w #$168, d0` at 0x8832); the roads closing from
   * `closes`, where its curves end, 362 (their last entry's position): there the original carries the car 2w across,
   * the road coming in appearing 2w beyond the road taken; the roads closed at `touching`, 0xD4 (212), the width the
   * stretch's end sets and the next stage begins at (`move.w #$D4, $260314` at 0x8994), two roads touching as one of six
   * equal lanes.
   */
  readonly rules: Parting & { readonly chosen: number; readonly closes: number; readonly touching: number };
}

/** The fork stretch: its tables' addresses at 0x1DFA4, its road path on the sub CPU, its rules. */
export function readForkStretch({ main, sub }: OutrunPrograms): ForkStretch {
  const tables = stretch(main, long(main, FORK_STRETCH), long(main, FORK_STRETCH + 4), long(main, FORK_STRETCH + 8));
  const [chosen] = instruction(main, 0x8832, [0x0c40, null], 'the route chosen');
  const [touching] = instruction(main, 0x8994, [0x33fc, null, 0x0026, 0x0314], "the roads' width closed");
  return {
    ...tables,
    path: roadPath(sub, FORK_PATH),
    rules: {
      ...readParting(main, [0x87ca, 0x87e4, 0x8898], 'fork'),
      chosen: chosen!,
      closes: tables.curves.at(-1)!.position,
      touching: touching!,
    },
  };
}

/**
 * The five goal stretches: their blocks' addresses at 0xE514, each block its tables' addresses; their road path; their
 * parting, from 182 by 8 a position to 0x300 (768; 0x8A7A, 0x8AA6, 0x8AF6).
 */
export function readGoalStretches({ main, sub }: OutrunPrograms): {
  stretches: Stretch[];
  path: Path;
  parting: Parting;
} {
  const stretches = Array.from({ length: GOALS }, (_, g) => {
    const block = long(main, GOAL_STRETCHES + 4 * g);
    return stretch(main, long(main, block), long(main, block + 4), long(main, block + 8));
  });
  return {
    stretches,
    path: roadPath(sub, GOAL_PATH),
    parting: readParting(main, [0x8a7a, 0x8aa6, 0x8af6], 'goal stretch'),
  };
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
  if (last % 8) throw romDiffers(`Scenery type ${type}'s last entry's offset ${last} is not a multiple of 8`);
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
 * OUTRUN's clock on its hardware ([the programs' clock](../../../docs/original-road-data.md#the-programs-clock)): its step, the
 * long at 0xE2EC (read at 0x6ABA); its tick's frames, the main loop's wait (`move.w #1, $60800` at 0x7DF4) counted down
 * by the frame interrupt (0x7CBE) past 0; its road's lines (`move.w #$200, d3` at S 0x1F36).
 */
export function readClock({ main, sub }: OutrunPrograms): ProgramClock {
  const [wait] = instruction(main, 0x7df4, [0x33fc, null, 0x0006, 0x0800], "the main loop's wait");
  const [lines] = instruction(sub, 0x1f36, [0x363c, null], "the road's lines");
  return { step: long(main, 0xe2ec), frames: wait! + 1, lines: lines!, heights: readHeightCounts(sub, 0x1b12) };
}

/**
 * The frames OUTRUN takes to change a stage's sky, road and ground once a fork's width passes 360 (M 0x8874 sets $60BDC
 * bit 0 in the player's tick; [OUTRUN's chapter](../../../docs/outrun-road-data.md#outruns-roads)). The frame
 * interrupt (the level 4 vector, M 0x7CBA) runs the background (M 0xD812), the sky's copy (M 0x8E20) and the colors
 * (M 0x91F8) every frame; the main loop's objects run every tick (`clock.frames` frames). The background takes the flag
 * in the next frame and starts the sky (M 0xD93C → 0x8D06); the colors then fill in two frames (M 0x9270) and step
 * `move.w #$80, $60C5C` (M 0x935C) frames. The player's tick works out the sky's colors one a tick
 * (`cmpi.w #$40, $26054E` at M 0xBA84), the tick after the last marking them ready, and the copy writes the rows below
 * `cmpi.w #$20, d0` (M 0x8E52) one every second frame. The layers are in by the fork's position 161 (the table at
 * 0x30B00), well before. Whichever ends last ends the change: the sky.
 */
export function readStageChangeFrames({ main }: OutrunPrograms, clock: ProgramClock) {
  const [colorSteps] = instruction(main, 0x935c, [0x33fc, null, 0x0006, 0x0c5c], "the colors' steps");
  const [skySteps] = instruction(main, 0xba84, [0x0c79, null, 0x0026, 0x054e], "the sky's steps");
  const [rows] = instruction(main, 0x8e52, [0x0c40, null], "the sky's rows");
  const colors = 1 + 2 + colorSteps!;
  const sky = clock.frames * (skySteps! + 1) + 2 * (rows! - 1);
  return Math.max(colors, sky);
}

/**
 * OUTRUN's top speed, km/h, the speed word the speedometer shows (M 0xBA24), at full throttle in the high gear. The
 * throttle is (its input held to 0x30–0x90, less 0x30) × 256 / 0x61 (M 0x7584). Each tick the revs, a 16.16 long, are
 * brought down to a multiple of the gear's ratio (`divu.w d1, d2` at M 0x6352, `mulu.w d1, d2` at M 0x6392), the high
 * gear's the word 31 of the ratios at 0x6C4E (`lea` at M 0x6382, `cmpi.w #$1F, d1` at M 0x6A02); below the throttle
 * they rise by the byte of the table at 0x30C80 at their whole part × the ratio² >> 12, doubled in the race (`asl.l d7,
 * d4` by $60BA2 at M 0x67E0, 1 from the race's start at M 0x61F2). So they stop at the first whole part whose rise is
 * less than the ratio (252), where the speed long is ⌊⌊revs⌋ × 0x1A90 / 256⌋ × 4096 / the ratio × 0x480, held to
 * L(0xE2E4) (M 0x6904): its word 293, under the 294 held.
 */
export function readTopKmh({ main }: OutrunPrograms) {
  const [high, highHeld] = instruction(
    main,
    0x7584,
    [0x0c40, null, 0x6f00, 0x000a, 0x303c, null],
    "the throttle's top",
  );
  const [low, lowHeld] = instruction(main, 0x7594, [0x0c40, null, 0x6c00, 0x0006, 0x303c, null], "the throttle's foot");
  const [less, scale, divisor] = instruction(main, 0x75a0, [0x0440, null, 0xc1fc, null, 0x81fc, null], 'the throttle');
  if (high !== highHeld || low !== lowHeld || low !== less) throw romDiffers('The throttle is not as read');
  const throttle = Math.floor(((high! - low!) * scale!) / divisor!);
  instruction(main, 0x6352, [0x84c1], "the revs' gear");
  instruction(main, 0x6392, [0xc4c1], "the revs' gear");
  const [ratios] = instruction(main, 0x6382, [0x41f9, 0x0000, null], "the gears' ratios");
  const [highGear] = instruction(main, 0x6a02, [0x0c41, null], 'the high gear');
  const ratio = word(main, ratios! + 2 * highGear!);
  const [most, mostHeld] = instruction(main, 0x67a0, [0x0c43, null, 0x6f00, 0x0006, 0x363c, null], "the revs' table");
  const [tableHigh, tableLow] = instruction(
    main,
    0x67ac,
    [0x41f9, null, null, 0x4244, 0x1830, 0x3000],
    "the revs' table",
  );
  const [squareHigh, squareLow] = instruction(main, 0x67c6, [0x3a01, 0xcac5, null, null, 0xc8c5], 'the revs rising');
  instruction(main, 0x67da, [0x3e39, 0x0006, 0x0ba2, 0xefa4], 'the revs rising');
  const [race] = instruction(main, 0x61f2, [0x33fc, null, 0x0006, 0x0ba2], "the race's revs");
  if (most !== mostHeld) throw romDiffers("The revs' table is not as read");
  const square = (ratio * ratio) >> (shiftCount(squareHigh!, 0xe080, 'revs') + shiftCount(squareLow!, 0xe080, 'revs'));
  const rise = (whole: number) =>
    (u8(main, tableHigh! * 0x10000 + tableLow! + Math.min(whole, most!)) * square) << race!;
  const [factor, fraction, scroll] = instruction(main, 0x6904, [0x4842, 0xc4fc, null, null, 0x4842, null], 'the speed');
  const [speedFactor] = instruction(main, 0x6924, [0x84c1, 0xc4fc, null], 'the speed');
  const [heldHigh, heldLow] = instruction(main, 0x6936, [0xb4b9, null, null], 'the speed held');
  const held = long(main, heldHigh! * 0x10000 + heldLow!);
  const speed = (whole: number) => {
    const v = (whole * factor!) >> shiftCount(fraction!, 0xe080, 'speed');
    const q = Math.floor((v * 2 ** (16 - shiftCount(scroll!, 0xe080, 'speed'))) / ratio);
    return Math.floor(Math.min(q * speedFactor!, held) / 65536);
  };
  for (let whole = 0; whole < throttle; whole++) if (rise(whole) < ratio) return speed(whole);
  throw romDiffers('The revs reach the throttle');
}

/** Where the sub program copies its stripes to the road (`lea $109EE.l, a0` at S 0x1ACA). */
const STRIPES_AT = 0x1aca;

/**
 * The road's lines' distances ahead of the car, positions, near to far, by `clock` ([Hills](../../../docs/original-road-data.md#hills),
 * A line's distance), read from the stripes the sub program copies to the road.
 */
export const lineDistances = ({ sub }: OutrunPrograms, clock: ProgramClock) =>
  readLineDistances(sub, STRIPES_AT, clock.lines, clock);

/** The height tables a list of width and height points names: its kind 0 points' values. */
const heightNumbers = (points: readonly WidthHeightPoint[]) => points.filter((p) => p.kind === 0).map((p) => p.value);

/**
 * The height tables OUTRUN's courses run, ascending: those its spans name (each stage's points before its end, the fork
 * stretch's, the goal stretches').
 */
export function outrunCourseTables(programs: OutrunPrograms): number[] {
  const length = stageLength(programs.main);
  const named = new Set([
    ...readStages(programs.main)
      .flat()
      .flatMap((n) => heightNumbers(readStage(programs, n).widthsHeights.filter((p) => p.position < length))),
    ...heightNumbers(readForkStretch(programs).widthsHeights),
    ...readGoalStretches(programs).stretches.flatMap((s) => heightNumbers(s.widthsHeights)),
  ]);
  return [...named].sort((a, b) => a - b);
}
