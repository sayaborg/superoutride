/**
 * ENDURO RACER's road as its programs hold it ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-programs)):
 * the stages' ends and road paths, the road's and ground's colors, the fords, the stripes' pattern, the
 * hills' table and the position where stage 3's background comes in; the program's amounts the course takes (the
 * bike's place, the grid, the lateral limit, a position's metres, the top speed, the hit width); and its scenery
 * ([ENDURO RACER's scenery](../../../docs/enduro-racer-road-data.md#enduro-racers-scenery)): the scenery table and its
 * types, the scaled items' x, the jumps and their kinds, and the start's templates.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { entries, instruction, long, sword, u8, word, shiftCount, s8 } from '../sega-16/program-words.js';
import { readColors } from '../out-run-hardware/road-tables.js';
import { metresAPosition } from '../shared/road-position.js';
import { type EnduroRacerPrograms } from './enduro-racer-rom.js';
import { FRAMES_A_SECOND } from '../sega-16/display.js';

/** Main CPU (its data image). */
const STAGE_ENDS = 0x53ac;
const ROAD_COLORS = 0xd948;
const GROUND_COLORS = 0xd918;
const FORDS = 0xd83c;
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
    if (end * 256 !== (s + 1) * STAGE_POSITIONS) throw romDiffers(`Stage ${s + 1} does not end at its 2048th position`);
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

/** A ford: the road's surface and edges give way to the ground from `from` to `to` (positions). */
export interface Ford {
  readonly from: number;
  readonly to: number;
  readonly frame: number;
}
/** The fords at 0xD83C: {long start, long end (position << 8), word frame}, ending at 0x7FFFFFFF. */
export const readFords = (main: Uint8Array): Ford[] =>
  entries(
    FORDS,
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

/**
 * The position where stage 3's background comes in: the hold's end (`cmp.w $2(a2), d0` at M 0xDE1A) of the hill whose
 * table offset the hills' routine compares there (`cmpi.w #$18, $6(a5)` at 0xDE24), where it sets the flag (`st.b
 * $42C16` at 0xDE2C) by which the background routine loads stage 3's background while the stage count is 1 (`cmpi.w #1,
 * d1`, `bne`, `move.w #2, d1` at 0xD4DE).
 */
export function readStage3Background({
  main,
  mainInstructions,
}: {
  readonly main: Uint8Array;
  readonly mainInstructions: Uint8Array;
}): number {
  instruction(mainInstructions, 0xde1a, [0xb06a, 0x0002], "the hills' routine's hold's end");
  const [offset] = instruction(
    mainInstructions,
    0xde24,
    [0x0c6d, null, 0x0006],
    "the hill bringing stage 3's background",
  );
  instruction(mainInstructions, 0xde2c, [0x50f9, 0x0004, 0x2c16], "the background's flag set");
  instruction(mainInstructions, 0xd4de, [0x0c41, 0x0001, 0x6604, 0x323c, 0x0002], "stage 3's background in stage 2");
  const hill = offset! % 8 === 0 ? readHills(main)[offset! / 8] : undefined;
  if (!hill) throw romDiffers(`The hills' table has no hill at offset 0x${offset!.toString(16)}`);
  return hill.holdEnd;
}

/** The objects' template pointers, the first rival's object and the rivals. */
const GRID_TEMPLATES = 0x41f8;
const FIRST_RIVAL = 32;
const GRID_RIVALS = 6;

/** The bike's place ahead of the road position, positions: `move.l #$C0, d5` at 0x60EE adds 0xC0 to the 24.8 position. */
export function bikeAhead(programs: EnduroRacerPrograms) {
  const [high, low] = instruction(programs.mainInstructions, 0x60ee, [0x2a3c, null, null], "the bike's place");
  return (high! * 0x10000 + low!) / 256;
}

/**
 * The rivals on the grid at GO. The start copies the 48 objects' templates (0x18A2), each's long pointer at 0x41F8;
 * the rivals are objects 32 to 42, every second (each followed by its companion), a template's long 0x10 their road
 * position as 24.8 and signed word 0x14 their x, road units from P. Those at the bike's place stand abreast with it at
 * GO; the others are held back.
 */
export function readGrid(programs: EnduroRacerPrograms) {
  const go = bikeAhead(programs);
  return Array.from({ length: GRID_RIVALS }, (_, k) => long(programs.main, GRID_TEMPLATES + 4 * (FIRST_RIVAL + 2 * k)))
    .map((template) => ({
      position: long(programs.main, template + 0x10) / 256,
      x: sword(programs.main, template + 0x14),
    }))
    .filter((rival) => rival.position === go);
}

/**
 * The bike's lateral limit, road units either side of P: 0x65FE holds its x (the 16.16 long at $32(a5)) within ±0x200,
 * `cmpi.l #$2000000` and, at 0x6612, its negative.
 */
export function lateralLimit(programs: EnduroRacerPrograms) {
  const [high] = instruction(programs.mainInstructions, 0x65fe, [0x0c80, null, 0], "the bike's lateral limit");
  instruction(programs.mainInstructions, 0x6612, [0x0c80, 0x10000 - high!, 0], "the bike's lateral limit");
  return high!;
}

/**
 * One road position, metres: the displayed speed is the speed word in km/h, and each tick, a frame (its interrupt), the 16.16 road
 * position gains it shifted left by the `asl.w #8, d0` at 0x608C, then `add.l d0, ($188, a6)`.
 */
export function positionMetres(programs: EnduroRacerPrograms) {
  const [shift] = instruction(programs.mainInstructions, 0x608c, [null, 0xd1ae, 0x0188], "the road's advance");
  return metresAPosition(1, 1 / FRAMES_A_SECOND, 2 ** shiftCount(shift!, 0xe140, "road's advance") / 65536);
}

/**
 * The top speed, km/h as the display shows it: the speed held at 0x3F80 (`cmpi.w #$3F80, ($36, a5)` at 0x6C36, `move.w
 * #$3F80` at 0x6C40) and shown as ⌊⌊v / 16⌋ × 16 × 0x326 / 65536⌋ (`move.w #$10, d1`, `divu.w d1, d0`, `lsl.w #4, d0`,
 * `mulu.w #$326, d0` and `swap d0` at 0x6C8C).
 */
export function topKmh(programs: EnduroRacerPrograms) {
  const i = programs.mainInstructions;
  const [held] = instruction(i, 0x6c36, [0x0c6d, null, 0x0036], 'the speed held');
  instruction(i, 0x6c40, [0x3b7c, held!, 0x0036], 'the speed held');
  const [step, lsl, factor] = instruction(
    i,
    0x6c8c,
    [0x323c, null, 0x80c1, null, 0xc0fc, null, 0x4840],
    "the speed's display",
  );
  if (2 ** shiftCount(lsl!, 0xe148, "speed's display") !== step) throw romDiffers("The speed's display is not as read");
  return Math.floor((Math.floor(held! / step!) * step! * factor!) / 65536);
}

/**
 * The original's hit, lateral units: a bike within 0x5A of an object's x either side, x − the bike's + 0x5A below 0xB4
 * unsigned (`addi.w #$5A, d2` and `cmpi.w #$B4, d2` at 0x8408).
 */
export function hitWidth(programs: EnduroRacerPrograms) {
  const [half, width] = instruction(programs.mainInstructions, 0x8408, [0x0642, null, 0x0c42, null], "the bike's hit");
  if (width !== 2 * half!) throw romDiffers("The bike's hit is not either side alike");
  return width;
}

/** Main CPU (its data image). */
const SCENERY = 0xaea0;
const TYPES = 0xc6a4;
const FIRST_TYPE = 0x10;
const SCALED_X = 0xcc88;
const JUMPS = 0xc8ae;
const JUMP_KINDS = 0xca60;
const START_TEMPLATES = 0xca78;
const START_TEMPLATE = 38;
const START_TEMPLATE_COUNT = 5;

/** The scaled types that take their x from the words at 0xCC88, `from` to `to`. */
export interface ScaledTypes {
  readonly from: number;
  readonly to: number;
}

/**
 * How the main program brings a scenery item out (its instructions' image): its x in lateral units, its byte times
 * `xUnits` (`asl.w #3, d0` at 0xCC4A); a scaled item of the `scaled` types taking its x from the words at 0xCC88
 * (`subi.w #$48, d2` and `cmpi.w #7, d2` at 0xCC6E); and any other item marked on the road where its x + 0xF0 is below
 * 0x1E1 unsigned (`addi.w #$F0, d0` and `cmpi.w #$1E1, d0` at 0xCC9A).
 */
export function itemRules(mainInstructions: Uint8Array) {
  const [asl] = instruction(mainInstructions, 0xcc4a, [null], "a scenery item's x");
  const [from, count] = instruction(mainInstructions, 0xcc6e, [0x0442, null, 0x0c42, null], 'the scaled types');
  const [add, below] = instruction(mainInstructions, 0xcc9a, [0x0640, null, 0x0c40, null], 'the on-road mark');
  return {
    xUnits: 2 ** shiftCount(asl!, 0xe140, "scenery item's x"),
    scaled: { from: from!, to: from! + count! - 1 } satisfies ScaledTypes,
    /** Whether an item `x` lateral units right of the road's centre is marked on the road. */
    onRoad: (x: number) => ((x + add!) & 0xffff) < below!,
  };
}

/**
 * A scenery item: at road position `position`, `x` × 8 lateral units right of the road's centre, of type `type`;
 * a scaled item (its type's bit 7) also has its object's placement `anchor` and its bottom's `height` above the road
 * in unscaled pixels.
 */
export interface SceneryItem {
  readonly position: number;
  readonly x: number;
  readonly type: number;
  readonly anchor?: number;
  readonly height?: number;
}

/**
 * The scenery table at 0xAEA0: a word, its items' bytes, then items {word position, signed byte x, byte type}, each
 * with bit 7 of its type followed by two bytes {placement, height}. Read in the table's order, the order the program
 * brings them out in.
 */
export function readScenery(main: Uint8Array): SceneryItem[] {
  const end = SCENERY + 2 + word(main, SCENERY);
  const items: SceneryItem[] = [];
  let a = SCENERY + 2;
  while (a < end) {
    const position = word(main, a),
      x = s8(main, a + 2),
      type = u8(main, a + 3);
    a += 4;
    if (type & 0x80) {
      items.push({ position, x, type: type & 0x7f, anchor: u8(main, a), height: u8(main, a + 1) });
      a += 2;
    } else items.push({ position, x, type });
  }
  if (a !== end) throw romDiffers("The scenery table's items overrun its length");
  return items;
}

/** A scenery type: its sprite's size set, palette and flags (0x80 used, 0x08 hit, 0x01 mirrored, 0x02 flipped). */
export interface SceneryType {
  readonly sizes: number;
  readonly palette: number;
  readonly flags: number;
}
/** Type `type`'s record at 0xC6A4 + 6 × (type − 0x10): {long size set, byte palette, byte flags}. */
export function readSceneryType(main: Uint8Array, type: number): SceneryType {
  const a = TYPES + 6 * (type - FIRST_TYPE);
  return { sizes: long(main, a), palette: u8(main, a + 4), flags: u8(main, a + 5) };
}

/** The `scaled` types' x in lateral units: the words at 0xCC88, one a type from the first. */
export const readScaledX = (main: Uint8Array, scaled: ScaledTypes): number[] =>
  Array.from({ length: scaled.to - scaled.from + 1 }, (_, k) => sword(main, SCALED_X + 2 * k));

/** Whether a scaled item of type `type` takes its x from the `scaled` types' x. */
export const takesScaledX = (scaled: ScaledTypes, type: number) => type >= scaled.from && type <= scaled.to;

/** A jump: at road position `position`, its halves' bottom middles `left` × 2 and `right` × 2 lateral units. */
export interface Jump {
  readonly position: number;
  readonly left: number;
  readonly right: number;
  readonly kind: number;
}
/**
 * The jumps' table at 0xC8AE: a word, the halves' count the program stops at (two a jump), then jumps {word
 * position, signed byte left, signed byte right, byte kind, byte spare} up to the first whose position is 0xFFFF.
 */
export function readJumps(main: Uint8Array) {
  const halves = word(main, JUMPS);
  const jumps: Jump[] = [];
  for (let a = JUMPS + 2; word(main, a) !== 0xffff; a += 6)
    jumps.push({ position: word(main, a), left: s8(main, a + 2), right: s8(main, a + 3), kind: u8(main, a + 4) });
  if (2 * jumps.length > halves) throw romDiffers("The jumps' table holds more halves than its count");
  return { halves, jumps };
}

/** A jump's kind: its half's size set and palette, and the margin beyond its halves where a bike jumps. */
export interface JumpKind {
  readonly sizes: number;
  readonly palette: number;
  readonly margin: number;
}
/** Kind `kind`'s record (an even number) at 0xCA60 + 3 × kind: {long size set, byte palette, byte margin}. */
export function readJumpKind(main: Uint8Array, kind: number): JumpKind {
  const a = JUMP_KINDS + 3 * kind;
  return { sizes: long(main, a), palette: u8(main, a + 4), margin: u8(main, a + 5) };
}

/**
 * A start template: an object's record as the program brings it out at the start: its flags, placement, road position
 * (8.8), x in lateral units, size set, palette and bottom's height above the road in unscaled pixels.
 */
export interface StartTemplate {
  readonly address: number;
  readonly flags: number;
  readonly anchor: number;
  readonly position: number;
  readonly x: number;
  readonly sizes: number;
  readonly palette: number;
  readonly height: number;
}
/**
 * The start's five templates of 38 bytes at 0xCA78: byte 0 the flags, byte 1 the placement, word 0x12 the position as
 * 8.8, word 0x14 the x, long 0x1A the size set, byte 0x1E the palette, byte 0x25 the height.
 */
export const readStartTemplates = (main: Uint8Array): StartTemplate[] =>
  Array.from({ length: START_TEMPLATE_COUNT }, (_, k) => {
    const a = START_TEMPLATES + START_TEMPLATE * k;
    return {
      address: a,
      flags: u8(main, a),
      anchor: u8(main, a + 1),
      position: word(main, a + 0x12) / 256,
      x: sword(main, a + 0x14),
      sizes: long(main, a + 0x1a),
      palette: u8(main, a + 0x1e),
      height: u8(main, a + 0x25),
    };
  });
