/**
 * TURBO OUTRUN's road data as its programs hold it ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md)):
 * the legs' order, each stage's block (colors, ground, sky ramp, curves, widths and heights, scenery) and road path, the
 * scenery types, the kinds' records and their size lists, the sprite palettes, the strips' size tables, the routines'
 * table and the program's constants the conversion uses. Where a format is OUTRUN's, OUTRUN's reader reads it. Every
 * reader takes a program as the 68000 addresses it and returns the table's entries as numbers.
 */
import { romDiffers } from './conversion-errors.js';
import { instruction, long, s8, sword, u8, word } from './program-words.js';
import type { BoardClock } from './board-clock.js';
import { readHeightCounts, readLineDistances } from './hills.js';
import {
  pathTurn,
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
import { requireInput } from '../authoring/authoring-error.js';
import type { TurboOutrunPrograms } from './turbo-outrun-rom.js';

/** The stages, four legs of four, in running order: the leg order's bytes number them 0 to 15. */
export const STAGE_COUNT = 16;
export const LEG_COUNT = 4;
export const LEG_STAGES = 4;

/** Main CPU. */
const STAGE_BLOCKS = 0x1e042;
const LEG_ORDER = 0x1e018;
const LEG_ORDER_STRIDE = 8;
const NAME_RECORDS = 0x11578;
const NAME_LENGTH = 14;
const START_WIDTHS = 0x1de14;
const RIGHT_FROM_LEFT_WIDTH = 0x1de04;
const TOP_SPEED = 0x1dde2;
const ADVANCE = 0x1ddea;
const OBJECT_SLOTS = 0x228d4;
const GROUNDS = 0x230a0;
const SKY_RAMPS = 0x232e0;
const SCENERY_TYPES = 0x39b16;
const KINDS = 0x28038;
const PALETTES = 0x2470;
const SHADOW_SIZES = 0x2667a;
/** Sub CPU. */
const STAGE_PATHS = 0x1224;
export const TURBO_OUTRUN_HEIGHT_TABLES = 0x2156;

/** A stage's road path covers 1496 positions; a sky ramp is 64 palette words; a ground 16. */
export const PATH_POSITIONS = 1496;
const RAMP_WORDS = 64;
const GROUND_WORDS = 16;
/** A kind's record is 16 bytes; a sprite palette 14 words (pixels 1 to 14). */
const KIND_BYTES = 16;
const PALETTE_WORDS = 14;

/** The legs' stages in running order: four bytes of each leg's eight at 0x1E018. */
export const readLegOrder = (main: Uint8Array): number[][] =>
  Array.from({ length: LEG_COUNT }, (_, leg) =>
    Array.from({ length: LEG_STAGES }, (_, i) => u8(main, LEG_ORDER + LEG_ORDER_STRIDE * leg + i)),
  );

/** The text RAM the names are written to; a name's lower row lies a row (64 tiles of a word) below its letters. */
const TEXT_RAM = 0x110000;
const LOWER_ROW = 0x80;

/**
 * The stages' names as the original draws them from the main CPU's name records at 0x11578, in stage order: records
 * {word text RAM offset, byte palette, byte count − 1, the characters}, each letter two tiles, its lower one a row below;
 * blank records are passed over. A tile record right after a name, {long address, word count − 1, word base, the
 * bytes}, is drawn with it where it falls in the name's lower row: its byte the font's character there (the dots of
 * WASHINGTON D.C and ST. LOUIS).
 */
export function readNameRecords(main: Uint8Array): { address: number; text: string }[] {
  const names: { address: number; text: string }[] = [];
  for (let a = NAME_RECORDS; names.length < STAGE_COUNT; a += 2) {
    if (a > NAME_RECORDS + 0x400) throw romDiffers('The name records do not hold 16 names');
    if (word(main, a + 2) !== NAME_LENGTH - 1) continue;
    const bytes = Array.from({ length: NAME_LENGTH }, (_, i) => u8(main, a + 4 + i));
    if (!bytes.every((b) => b >= 0x20 && b < 0x7f)) continue;
    const next = a + 4 + NAME_LENGTH;
    const lower = TEXT_RAM + word(main, a) + LOWER_ROW;
    const column = (long(main, next) - lower) / 2;
    if (Number.isInteger(column) && column >= 0 && column < NAME_LENGTH)
      for (let i = 0; i <= word(main, next + 4); i++) bytes[column + i] = u8(main, next + 8 + i);
    const text = String.fromCharCode(...bytes);
    if (text.trim()) names.push({ address: a, text });
    a += 2 + NAME_LENGTH;
  }
  return names;
}

/** The program's constants the conversion uses, each a word or long of a table the main CPU reads. */
export function readConstants(main: Uint8Array) {
  return {
    /** The road advances `speed × advance / 65536` positions a tick: the long at 0x1DDEA. */
    advance: long(main, ADVANCE),
    /** The top speed in the top gear without turbo or tune-up, km/h: the word at 0x1DDE2. */
    topSpeed: word(main, TOP_SPEED),
    /** Past this road width as an object appears, a right-side object stands by the left road: the word at 0x1DE04. */
    rightFromLeftWidth: word(main, RIGHT_FROM_LEFT_WIDTH),
    /** The road width each stage begins at from its leg's start (450) or played on (220): words at 0x1DE14. */
    startWidths: Array.from({ length: STAGE_COUNT }, (_, n) => word(main, START_WIDTHS + 2 * n)),
    /** The objects scenery is brought out into: the first and how many, words at 0x228D4. */
    objectSlots: { first: word(main, OBJECT_SLOTS), count: word(main, OBJECT_SLOTS + 2) },
  };
}

/** A stage: its block, colors, ground, sky ramp, tables and road path. */
export interface TurboOutrunStage {
  readonly number: number;
  /** Its name as the original draws it (`readNameRecords`), the spaces centring it left out. */
  readonly name: string;
  readonly block: number;
  readonly colors: {
    readonly centreLine: Colors;
    readonly laneLines: Colors;
    readonly edges: Colors;
    readonly surface: Colors;
  };
  /** The sky word's ramp: 64 palette words, two rows each up from the road's top, the last above. */
  readonly sky: { readonly number: number; readonly ramp: Colors };
  /** The ground word's 16 palette words: the 15th and 16th its halves, the 14 before the far horizon's. */
  readonly ground: { readonly number: number; readonly words: Colors };
  readonly curves: readonly CurvePoint[];
  readonly widthsHeights: readonly WidthHeightPoint[];
  readonly scenery: readonly SceneryPoint[];
  readonly path: Path;
}

/**
 * Stage `number`'s block, the long at 0x1E042 + 4 × number, nine longs as OUTRUN's: the sky word, the centre line's,
 * lane lines', edges' and surface's four palette words each, the ground word, then its curves, widths and heights, and
 * scenery. The sky word numbers its ramp (the long at 0x232E0 + 4 × it), the ground word its 16 words (the long at
 * 0x230A0 + 4 × it). Its road path is the long at 0x1224 + 4 × number on the sub CPU, 1496 positions.
 */
export function readTurboOutrunStage({ main, sub }: TurboOutrunPrograms, number: number): TurboOutrunStage {
  const block = long(main, STAGE_BLOCKS + 4 * number);
  const pointer = (k: number) => long(main, block + 4 * k);
  const sky = word(main, pointer(0)),
    ground = word(main, pointer(5));
  return {
    number,
    name: readNameRecords(main)[number]!.text.trim(),
    block,
    colors: {
      centreLine: readColors(main, pointer(1), 4),
      laneLines: readColors(main, pointer(2), 4),
      edges: readColors(main, pointer(3), 4),
      surface: readColors(main, pointer(4), 4),
    },
    sky: { number: sky, ramp: readColors(main, long(main, SKY_RAMPS + 4 * sky), RAMP_WORDS) },
    ground: { number: ground, words: readColors(main, long(main, GROUNDS + 4 * ground), GROUND_WORDS) },
    curves: readCurves(main, pointer(6)),
    widthsHeights: readWidthsHeights(main, pointer(7)),
    scenery: readScenery(main, pointer(8)),
    path: readPath(sub, long(sub, STAGE_PATHS + 4 * number), PATH_POSITIONS),
  };
}

/** Every stage's gate: the scenery point at 1358, one CHECK POINT gate (type 3), or at the last stage the GOAL (68). */
export const GATE_POINT = 1358;
const CHECK_GATE = 3;
const GOAL_GATE = 68;
/** A heading vector straight ahead (heading 0). */
const AHEAD = [0, 4096] as const;

/**
 * The stages in running order, checked as the description has them: the legs' order the stages 0 to 15 in turn, each
 * road path beginning and ending heading straight ahead and turning 0° or ±360°,
 * each stage's gate at 1358 (the last stage's the GOAL).
 */
export function readTurboOutrunStages(programs: TurboOutrunPrograms) {
  const { main } = programs;
  const legs = readLegOrder(main);
  requireInput(
    legs.flat().every((n, i) => n === i),
    '/rom/main',
    "The legs' order is not the stages 0 to 15 in turn",
  );
  const names = readNameRecords(main);
  const stages = Array.from({ length: STAGE_COUNT }, (_, n) => readTurboOutrunStage(programs, n));
  for (const stage of stages) {
    const { path, number } = stage;
    const at = (i: number) => [path.x[i], path.y[i]];
    const last = PATH_POSITIONS - 1;
    const turns = pathTurn(path, 0, last) / (2 * Math.PI);
    requireInput(
      at(0).join() === AHEAD.join() && at(last).join() === AHEAD.join(),
      `/stages/${number}`,
      `Stage ${number}'s path does not begin and end heading straight ahead`,
    );
    requireInput(
      Math.abs(turns - Math.round(turns)) < 1 / 360 && Math.abs(Math.round(turns)) <= 1,
      `/stages/${number}`,
      `Stage ${number}'s path turns ${(turns * 360).toFixed(2)}°, not 0° or ±360°`,
    );
    const gate = stage.scenery.filter((p) => p.position === GATE_POINT);
    const type = number === STAGE_COUNT - 1 ? GOAL_GATE : CHECK_GATE;
    requireInput(
      gate.length === 1 && gate[0]!.type === type && gate[0]!.count === 1,
      `/stages/${number}`,
      `Stage ${number} has no gate of type ${type} at ${GATE_POINT}`,
    );
  }
  return { legs, names, stages };
}

/** A scenery type's item: flags (bit 0 mirrors, bit 1 sets its depth), x (× 16 road units), y, its kind, b6 and b7. */
export interface TurboOutrunItem {
  readonly flags: number;
  readonly x: number;
  readonly y: number;
  readonly kind: number;
  readonly b6: number;
  readonly b7: number;
}
/** {u8 flags, s8 x, signed word y, word kind, u8 b6, u8 b7}. */
export const readItem = (main: Uint8Array, a: number): TurboOutrunItem => ({
  flags: u8(main, a),
  x: s8(main, a + 1),
  y: sword(main, a + 2),
  kind: word(main, a + 4),
  b6: u8(main, a + 6),
  b7: u8(main, a + 7),
});

/**
 * Scenery type `type`, the long at 0x39B16 + 4 × type: {signed word turn (negative turns the pattern's 32 bits, else
 * its upper 16), long pattern, u8 items, u8 step}, then its 8-byte items.
 */
export function readTurboOutrunSceneryType(main: Uint8Array, type: number) {
  const address = long(main, SCENERY_TYPES + 4 * type);
  const count = u8(main, address + 6);
  return {
    address,
    turn: sword(main, address),
    pattern: long(main, address + 2),
    step: u8(main, address + 7),
    items: Array.from({ length: count }, (_, i) => readItem(main, address + 8 + 8 * i)),
  };
}

/**
 * Kind `kind`'s record, 16 bytes at 0x28038 + 16 × kind: {long size list, s8 hit left, s8 hit right, u8 flags (bit 0
 * half scale, bit 1 casts the shadow picture, bit 2 its pixel 10 shades), u8 routine, word palette, word collision
 * class (0xFFFF none), two words}.
 */
export function readKind(main: Uint8Array, kind: number) {
  const a = KINDS + KIND_BYTES * kind;
  return {
    address: a,
    sizes: long(main, a),
    hit: [s8(main, a + 4), s8(main, a + 5)] as const,
    flags: u8(main, a + 6),
    routine: u8(main, a + 7),
    palette: word(main, a + 8),
    collision: word(main, a + 10),
    words: [word(main, a + 12), word(main, a + 14)] as const,
  };
}

/** How many sizes a kind's routine lists: strip A's (0x0C–0x14) and the far strip's (0x24) 9, strip B's (0x18–0x20) 16. */
export function sizeCount(routine: number): number {
  if (routine >= 0x18 && routine <= 0x20) return 16;
  if ((routine >= 0x0c && routine <= 0x14) || routine === 0x24) return 9;
  return 5;
}

/** A size: {word width, word height, word words a row, u8, u8 bank, word first word in the bank}. */
export interface TurboOutrunSize {
  readonly width: number;
  readonly height: number;
  readonly stride: number;
  readonly flags: number;
  readonly bank: number;
  readonly offset: number;
}
/** `count` sizes of 10 bytes from `address`. */
export const readSizeList = (main: Uint8Array, address: number, count: number): TurboOutrunSize[] =>
  Array.from({ length: count }, (_, k) => {
    const a = address + 10 * k;
    return {
      width: word(main, a),
      height: word(main, a + 2),
      stride: word(main, a + 4),
      flags: u8(main, a + 6),
      bank: u8(main, a + 7),
      offset: word(main, a + 8),
    };
  });

/** The shadow picture's largest size, the first of its size list at 0x2667A, which shadowed kinds cast on the road. */
export const readShadowSize = (main: Uint8Array): TurboOutrunSize => readSizeList(main, SHADOW_SIZES, 1)[0]!;

/** Sprite palette `palette`: the 14 palette words at 0x2470 + 28 × palette, pixels 1 to 14 (0 and 15 transparent). */
export const readSpritePalette = (main: Uint8Array, palette: number): Colors =>
  readColors(main, PALETTES + 2 * PALETTE_WORDS * palette, PALETTE_WORDS);

/**
 * TURBO OUTRUN's clock on OUTRUN's board ([the board's clock](../../docs/original-road-data.md#the-boards-clock)): its
 * step, the program's advance (`readConstants`, read at 0xF3D0); its road's lines (`move.w #$200, d3` at S 0x1E82). Its
 * tick's frames, two (the main loop's wait set at 0xFE68, counted down by the frame interrupt at 0x103E past 0), are an
 * encrypted instruction, read from its program decrypted locally (K, 2026-10-25).
 */
export function readClock({ main, sub }: TurboOutrunPrograms): BoardClock {
  const [lines] = instruction(sub, 0x1e82, [0x363c, null], "the road's lines");
  return { step: readConstants(main).advance, frames: 2, lines: lines!, heights: readHeightCounts(sub, 0x1a5e) };
}

/** Where the sub program copies its stripes to the road (`lea $109EE.l, a0` at S 0x1A16). */
const STRIPES_AT = 0x1a16;

/**
 * The road's lines' distances ahead of the car, positions, near to far, by `clock` ([Hills](../../docs/original-road-data.md#hills),
 * A line's distance), read from the stripes the sub program copies to the road.
 */
export const lineDistances = ({ sub }: TurboOutrunPrograms, clock: BoardClock) =>
  readLineDistances(sub, STRIPES_AT, clock.lines, clock);
