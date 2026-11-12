/**
 * CISCO HEAT's objects ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-objects)): each stage's records
 * beside its roads, each its picture's descriptor, its road, lateral and height; a descriptor's sprite (its tiles and
 * their number across and down); the scale a record's flags draw it at; each stage's sprite colors; and each object's
 * place as its program draws it, its sprite standing on its bottom edge. Each table found by the instruction that reads it.
 */
import { instruction, long, sword, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { PENS, rgb555Of } from '../jaleco/palette.js';
import type { RoadNumber } from '../jaleco/road-tables.js';
import { SPRITE_TILE } from '../jaleco/zoom-sprites.js';
import { STAGES } from './cisco-heat-backgrounds.js';

/** A record of an object. */
export interface CiscoHeatObject {
  readonly position: number;
  /** Its picture's descriptor, bytes into the descriptors' table. */
  readonly descriptor: number;
  /** Its kind (+6's low byte): 0 a picture standing where it is put, others moved or picked by the program. */
  readonly kind: number;
  /** Its road (its flags' bit 7: road 1), lateral from that road's centre (units) and height over it (units up). */
  readonly road: RoadNumber;
  readonly lateral: number;
  readonly height: number;
  /** Its palette entry (its flags' bits 0 to 6), its scale (bits 12 to 14), whether it is mirrored (bit 8) and its flags. */
  readonly color: number;
  readonly scale: number;
  readonly mirrored: boolean;
  readonly flags: number;
}

const RECORD_BYTES = 16;
const ROAD_1 = 0x80;
const COLOR = 0x7f;
/** Its flags' bit that mirrors its picture (M 0xE2D4). */
const MIRRORED = 0x100;
/** Its flags' bit that draws its height below its road (M 0xE74A). */
const BELOW = 0x400;
/** Its flags' bits that pick its scale (M 0xE296). */
const SCALE_BITS = 0x7000;
const SCALE_SHIFT = 12;
/** The position past which a stage's list holds no record: its last record's. */
const LIST_END = 0x40000000;

/**
 * The scales a record's flags' bits 12 to 14 pick (M 0xE296 to 0xE2D2: the table at the `lea` at 0xE2A2, four words a
 * scale): the zoom at its distance times each word's set halves, 1, 1/2, 1/4 and 1/8, summed.
 */
export function objectScales(main: Uint8Array): readonly number[] {
  instruction(main, 0xe296, [0x3606, 0x0283, 0x0000, SCALE_BITS], "an object's scale (andi.l #$7000)");
  const [disp] = instruction(main, 0xe2a2, [0x43fa, null], "the objects' scales (lea pc)");
  const table = 0xe2a4 + ((disp << 16) >> 16);
  return Array.from({ length: 8 }, (_, m) =>
    [0, 1, 2, 3].reduce((sum, k) => sum + (word(main, table + 8 * m + 2 * k) ? 1 / 2 ** k : 0), 0),
  );
}

/**
 * Stage `stage`'s objects (M 0xDAF2: its table of a pointer a stage; M 0xDDFE walks it, drawing those within 20,000
 * positions ahead), 16 bytes each in the order of their positions to one at 0xFFFFFFFF, past 0x40000000 or before the
 * one before: position (+0), descriptor (+4), kind (+6's low byte), lateral (+8), height (+A), flags (+C), each on road
 * 1 where its flags' bit 7 is set (M 0xE5B4), on road 2 else; its height below its road where bit 10 is (M 0xE74A); its
 * palette entry its flags' bits 0 to 6 (M 0xE88E), its scale its bits 12 to 14.
 */
export function ciscoHeatObjects(main: Uint8Array, stage: number): readonly CiscoHeatObject[] {
  if (!(Number.isInteger(stage) && stage >= 0 && stage < STAGES))
    throw new RangeError(`CISCO HEAT has no stage ${stage}`);
  const [disp] = instruction(main, 0xdaf2, [0x41fa, null], "the stages' objects (lea pc)");
  const table = 0xdaf4 + ((disp << 16) >> 16);
  instruction(main, 0xddfe, [0x206e, 0x000c], "the stage's objects (movea.l $c(a6))");
  instruction(main, 0xe0f0, [0x3c28, 0x000c], "an object's flags (move.w $c(a0))");
  instruction(main, 0xe2ee, [0x3028, 0x0006, 0x0240, 0x00ff], "an object's kind (andi.w #$ff)");
  instruction(main, 0xe5b4, [0x4a06, 0x6b00], "an object's road (tst.b, bmi)");
  instruction(main, 0xe616, [0x3a28, 0x0008], "an object's lateral (move.w 8(a0))");
  instruction(main, 0xe746, [0x3a28, 0x000a, 0x0806, 0x000a], "an object's height (move.w $a(a0), btst #10)");
  instruction(main, 0xe2d4, [0x0806, 0x0008], "an object's mirroring (btst #8)");
  const scales = objectScales(main);
  const out: CiscoHeatObject[] = [];
  for (let at = long(main, table + 4 * stage); ; at += RECORD_BYTES) {
    const position = long(main, at);
    if (position === 0xffffffff || position >= LIST_END || (out.length && position < out.at(-1)!.position)) break;
    const flags = word(main, at + 0xc);
    const height = sword(main, at + 0xa);
    out.push({
      position,
      descriptor: word(main, at + 4),
      kind: word(main, at + 6) & 0xff,
      road: flags & ROAD_1 ? 1 : 2,
      lateral: sword(main, at + 8),
      height: flags & BELOW ? -height : height,
      color: flags & COLOR,
      scale: scales[(flags & SCALE_BITS) >> SCALE_SHIFT]!,
      mirrored: (flags & MIRRORED) !== 0,
      flags,
    });
  }
  return out;
}

/**
 * A picture's descriptor: its sprite's tiles from `tile`, `across` × `down`; and the columns from its left edge, at its
 * own size, between which the program meets the car with it, or null where it meets none.
 */
export interface CiscoHeatDescriptor {
  readonly tile: number;
  readonly across: number;
  readonly down: number;
  readonly meets: readonly [number, number] | null;
}

/**
 * The descriptor at `offset` bytes into the descriptors' table (M 0xE398: the table at 0x40000, the record's +4 its
 * offset), 10 bytes: the columns it meets the car between (+0 and +2, either first), its size (+4: tiles across less 1 in bits 0 to 3,
 * down in bits 4 to 7), its first tile (+6) and whether it meets the car at all (+8): the program meets none where +8
 * is 0 or +0 is +2 (M 0xE8D8 to 0xE8FC).
 */
export function ciscoHeatDescriptor(main: Uint8Array, offset: number): CiscoHeatDescriptor {
  const [high, low] = instruction(main, 0xe398, [0x43f9, null, null, 0xd2e8, 0x0004], 'the descriptors (lea, adda)');
  instruction(main, 0xe3a2, [0x2d51, 0x00a0], "a descriptor's columns (move.l (a1), $a0(a6))");
  instruction(main, 0xe3a6, [0x3d69, 0x0004, 0x0010, 0x3b69, 0x0006, 0x000c], "a descriptor's size and tile");
  instruction(main, 0xe3b2, [0x3d69, 0x0008, 0x00a4], "a descriptor's meeting (move.w 8(a1), $a4(a6))");
  instruction(main, 0xe8d8, [0x4a6e, 0x00a4], "an object's meeting (tst.w $a4(a6))");
  instruction(main, 0xe8f4, [0x302e, 0x00a0, 0xb06e, 0x00a2], "an object's columns (cmp.w $a2(a6))");
  const at = high * 0x10000 + low + offset;
  const size = word(main, at + 4);
  const [from, to] = [word(main, at), word(main, at + 2)];
  return {
    tile: word(main, at + 6),
    across: (size & 15) + 1,
    down: ((size >> 4) & 15) + 1,
    meets: word(main, at + 8) !== 0 && from !== to ? [Math.min(from, to), Math.max(from, to)] : null,
  };
}

/**
 * A sprite's pixel at its own size, units across: at distance d its zoom (M 0xE288: the table at 0x122272, a word a
 * position, its low byte the zoom, 128 a tile's own size) over the road's pixels a unit there (M 0xE27E: the table at
 * 0x109C68, a word a position, 32,768 a pixel a unit), at the nearest distance, 0.
 */
export function spritePixelUnits(main: Uint8Array): number {
  const [zh, zl] = instruction(main, 0xe288, [0x43f9, null, null], "the objects' zoom (lea)");
  const [sh, sl] = instruction(main, 0xe27e, [0x43f9, null, null], "the road's scale (lea)");
  const d = 0;
  const zoom = word(main, zh * 0x10000 + zl + d) & 0xff;
  const scale = word(main, sh * 0x10000 + sl + d);
  return zoom / 128 / (scale / 0x8000);
}

/** An object's place as its program draws it, units: its picture's left edge across its road, its bottom edge up. */
export interface CiscoHeatPlace {
  readonly road: RoadNumber;
  readonly position: number;
  readonly left: number;
  readonly bottom: number;
  /** Its picture's drawn width and height, units. */
  readonly width: number;
  readonly drawnHeight: number;
  /** Where the program meets the car with it, units from its left edge, or null where it meets none. */
  readonly meets: { readonly from: number; readonly to: number } | null;
}

/**
 * Object `o`'s place (M 0xE5E6 to 0xE7B2): its sprite's x its road's centre plus its lateral at the road's scale there,
 * its left edge; its sprite's y the road's row less its height at that scale (0xE8 less their sum), which the board
 * draws its sprite up from, its bottom edge; its picture's size its tiles at its zoom times its scale, `pixel` units a
 * sprite's pixel at its own size (`spritePixelUnits`); where it meets the car, its descriptor's columns at that size,
 * mirrored with it, on a record at height 0 alone (M 0xE900 to 0xE960).
 */
export function ciscoHeatPlace(main: Uint8Array, o: CiscoHeatObject, pixel: number): CiscoHeatPlace {
  instruction(main, 0xe766, [0x4442, 0x0642, 0x00e8], "the sprite's y (neg, addi.w #$e8)");
  instruction(main, 0xe900, [0x4a68, 0x000a], "an object's height where it meets the car (tst.w $a(a0))");
  const d = ciscoHeatDescriptor(main, o.descriptor);
  const unit = pixel * o.scale;
  const width = d.across * SPRITE_TILE * unit;
  const meets =
    d.meets && o.height === 0
      ? o.mirrored
        ? { from: width - d.meets[1] * unit, to: width - d.meets[0] * unit }
        : { from: d.meets[0] * unit, to: d.meets[1] * unit }
      : null;
  return {
    road: o.road,
    position: o.position,
    left: o.lateral,
    bottom: o.height,
    width,
    drawnHeight: d.down * SPRITE_TILE * unit,
    meets,
  };
}

/** The sprites' palette's entries, each 16 pens (0xBD000 to 0xBDFFF). */
const SPRITE_ENTRIES = 128;
/** The entry a stage's list loads from (M 0xED68: 0xBD600). */
const STAGE_FIRST = 48;

/**
 * The sprites' palette in stage `stage`, RGB555, as far as its stage loads it (M 0xED4A to 0xED8E): its list (the table at
 * the `lea` at M 0xED5E, a pointer a stage) holds a count less 1, then for each entry from 48 on its 16 words' offset into
 * the table at M 0x1AB3C. The entries below 48, which the program loads for the cars and its screen, are not read (null).
 */
export function ciscoHeatSpritePalette(main: Uint8Array, stage: number): readonly (readonly number[] | null)[] {
  if (!(Number.isInteger(stage) && stage >= 0 && stage < STAGES))
    throw new RangeError(`CISCO HEAT has no stage ${stage}`);
  const [disp] = instruction(
    main,
    0xed5e,
    [0x41fa, null, 0x2070, 0x2000, 0x3018],
    "the stages' sprite colors (lea pc)",
  );
  instruction(main, 0xed68, [0x43f9, 0x000b, 0xd600, 0x45f9, 0x0001, 0xab3c, 0x3218], "a stage's sprite colors");
  const lists = 0xed60 + ((disp << 16) >> 16);
  const out: (readonly number[] | null)[] = Array.from({ length: SPRITE_ENTRIES }, () => null);
  const list = long(main, lists + 4 * stage);
  const count = word(main, list) + 1;
  for (let k = 0; k < count; k++) {
    const e = STAGE_FIRST + k;
    if (e >= SPRITE_ENTRIES) throw romDiffers(`CISCO HEAT's stage ${stage + 1}'s sprite colors pass the palette`);
    const at = 0x1ab3c + word(main, list + 2 + 2 * k);
    out[e] = Array.from({ length: PENS }, (_, p) => rgb555Of(word(main, at + 2 * p)));
  }
  return out;
}
