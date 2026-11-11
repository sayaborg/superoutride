/**
 * BIG RUN's objects ([BIG RUN road data](../../../docs/big-run-road-data.md#its-objects)): each stage's records beside
 * its roads, each its picture's descriptor, its road, lateral and height; a descriptor's sprite (its tiles, their
 * number across and down, its scales and its attribute); and the sprites' palette as a stage loads it. Each table found
 * by the instruction that reads it.
 */
import { instruction, long, sword, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { PENS, rgb555Of } from '../jaleco/palette.js';
import type { RoadNumber } from '../jaleco/road-tables.js';

/** A record of an object. */
export interface BigRunObject {
  readonly position: number;
  /** Its picture's descriptor, bytes into the descriptors' table. */
  readonly descriptor: number;
  /** Its kind: 0 a picture standing where it is put, others moved or picked by the program. */
  readonly kind: number;
  /** Its road (its flags' bit 7: road 1), lateral from that road's centre (units) and height over it. */
  readonly road: RoadNumber;
  readonly lateral: number;
  readonly height: number;
  /** Its palette entry (its flags' bits 0 to 5, M 0xB284) and its flags. */
  readonly color: number;
  readonly flags: number;
}

const RECORD_BYTES = 16;
const ROAD_1 = 0x80;
const COLOR = 0x3f;

/**
 * Stage `stage`'s objects (M 0x9874: its table of a pointer a stage), 16 bytes each in the order of their positions to
 * one at 0xFFFFFFFF or before the one before: position (+0), descriptor (+4), kind (+6), lateral (+8), height (+A),
 * flags (+C), each on road 1 where its flags' bit 7 is set (M 0xB096), on road 2 else, its palette entry its flags'
 * bits 0 to 5.
 */
export function bigRunObjects(main: Uint8Array, stage: number): readonly BigRunObject[] {
  const [disp] = instruction(main, 0x9874, [0x41fa, null], "the stages' objects (lea pc)");
  const table = 0x9876 + ((disp << 16) >> 16);
  instruction(main, 0xb096, [0x0806, 0x0007], "an object's road (btst #7)");
  const out: BigRunObject[] = [];
  for (let at = long(main, table + 4 * stage); ; at += RECORD_BYTES) {
    const position = long(main, at);
    if (position === 0xffffffff || (out.length && position < out.at(-1)!.position)) break;
    const flags = word(main, at + 0xc);
    out.push({
      position,
      descriptor: word(main, at + 4),
      kind: word(main, at + 6),
      road: flags & ROAD_1 ? 1 : 2,
      lateral: sword(main, at + 8),
      height: sword(main, at + 0xa),
      color: flags & COLOR,
      flags,
    });
  }
  return out;
}

/** A picture's descriptor: its sprite's tiles from `tile`, `across` × `down`, its scales (128 its own size), its attribute. */
export interface BigRunDescriptor {
  readonly tile: number;
  readonly across: number;
  readonly down: number;
  readonly xScale: number;
  readonly yScale: number;
  readonly attribute: number;
}

/**
 * The descriptor at `offset` bytes into the descriptors' table (M 0xB07A: lea), 12 bytes: its scales across and down
 * (the high bytes of +0 and +2), its size (+4: tiles across less 1 in bits 0 to 3, down in bits 4 to 7), its first tile
 * (+6) and its attribute (+0xA).
 */
export function bigRunDescriptor(main: Uint8Array, offset: number): BigRunDescriptor {
  const [high, low] = instruction(main, 0xb07a, [0x43f9, null, null], "the descriptors' table (lea)");
  const at = high * 0x10000 + low + offset;
  const size = word(main, at + 4);
  return {
    tile: word(main, at + 6),
    across: (size & 15) + 1,
    down: ((size >> 4) & 15) + 1,
    xScale: word(main, at) >> 8,
    yScale: word(main, at + 2) >> 8,
    attribute: word(main, at + 0xa),
  };
}

/** The sprites' palette entries, each 16 pens. */
const ENTRIES = 64;
/** The entry a stage's list loads from (M 0xB88E: 0x9EB20, entry 25 of the sprites' palette at 0x9E800). */
const STAGE_FIRST = 25;

/**
 * The sprites' palette in stage `stage`, RGB555, as the main program loads it: its first 24 entries from its table at
 * M 0x179C, then its stage's list from entry 25 on (M 0xB884: a count less 1, then an entry's words' offset, signed, into the
 * table at M 0xB894 for each), the others none (null).
 */
export function spritePalette(main: Uint8Array, stage: number): readonly (readonly number[] | null)[] {
  const [bh, bl] = instruction(main, 0x179c, [0x41f9, null, null, 0x43f9, 0x0009, 0xe800, 0x303c, null], 'boot (lea)');
  const boot = bh * 0x10000 + bl;
  const bootEntries = (word(main, 0x17aa) + 1) / (PENS / 2);
  const [disp] = instruction(main, 0xb884, [0x41fa, null], "the stages' sprite colors (lea pc)");
  const lists = 0xb886 + ((disp << 16) >> 16);
  const [th, tl] = instruction(main, 0xb894, [0x45f9, null, null], "the sprite colors' table (lea)");
  const source = th * 0x10000 + tl;
  const out: (readonly number[] | null)[] = Array.from({ length: ENTRIES }, () => null);
  const entry = (at: number) => Array.from({ length: PENS }, (_, p) => rgb555Of(word(main, at + 2 * p)));
  for (let e = 0; e < bootEntries; e++) out[e] = entry(boot + 2 * PENS * e);
  const list = long(main, lists + 4 * stage);
  const count = word(main, list) + 1;
  for (let k = 0; k < count; k++) {
    const e = STAGE_FIRST + k;
    if (e >= ENTRIES) throw romDiffers(`Stage ${stage}'s sprite colors pass the palette`);
    out[e] = entry(source + sword(main, list + 2 + 2 * k));
  }
  return out;
}

/**
 * The own car's straight picture's width, units across (K, 2026-11-09: its scale across): its frame 0 (the frames' table
 * at M 0x122C4, a pointer a frame; a frame's size at +4 and first tile at +6) drawn at the zoom its distance gives (M
 * 0x12200: the table at 0x13B000, a word a position, its low byte the zoom), its colored columns' pixels at that zoom
 * over the road's pixels a unit at that distance, 600 ÷ (d + 600): the same at every distance.
 */
export function ownCarUnits(main: Uint8Array, pen: (tile: number, x: number, y: number) => number) {
  const [zh, zl] = instruction(main, 0x12200, [0x43f9, null, null], "the car's zoom (lea)");
  const [disp] = instruction(main, 0x122c4, [0x43fa, null], "the car's frames (lea pc)");
  const frame = long(main, 0x122c6 + ((disp << 16) >> 16));
  const size = word(main, frame + 4);
  const tile = word(main, frame + 6);
  const [across, down] = [(size & 15) + 1, ((size >> 4) & 15) + 1];
  let [from, to] = [Infinity, -Infinity];
  for (let ty = 0; ty < down; ty++)
    for (let tx = 0; tx < across; tx++)
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const p = pen(tile + ty * across + tx, x, y);
          if (p !== 15 && p !== 0) [from, to] = [Math.min(from, tx * 16 + x), Math.max(to, tx * 16 + x + 1)];
        }
  const zoom = main[zh * 0x10000 + zl + 2 * EYE + 1]!;
  return ((to - from) * zoom) / 128 / (EYE / (EYE + EYE));
}

/** Its eye's distance behind the plane a unit is a pixel at, positions, at which the zooms are taken. */
const EYE = 600;
