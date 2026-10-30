/**
 * ENDURO RACER's scenery as its main program holds it
 * ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-scenery)): the scenery table and its types, the
 * scaled items' x, the jumps and their kinds, and the start's templates.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { instruction, long, s8, shiftCount, sword, u8, word } from '../sega-16/program-words.js';

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
