/**
 * TOP SPEED's things' places and hits as its sub program spawns and tests them ([TOP SPEED road data](../../../docs/top-speed-road-data.md#its-things)):
 * each record's roadside things by its bytes 4 and 5, those of type 0x1F flat on the ground, a gantry by its event 6
 * and a tunnel's mouths and lamps by its event 3,
 * each at its pattern's offsets along the record, beside its mask's outermost lanes or at their middle, with its hit
 * box and the side of P a car meets it from; each found by the instructions that read it.
 */
import { instruction, long, sword } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { TopSpeedRecord } from './top-speed-road.js';

/** A lane's laterals. */
const LANE = 0x4a0;
/** The events: a tunnel's, a gantry's. */
const TUNNEL = 3;
const GANTRY = 6;
const OVERPASS = 4;
const WATER_RIGHT = 1;
const WATER_LEFT = 2;
/** A roadside thing's type that is flat on the ground, and the color sets water's codes run through (1 to 10). */
const FLAT_TYPE = 0x1f;
const COLOR_SETS = 10;
/** A pattern's row's bytes, and its end. */
const PATTERN_BYTES = 8;
const PATTERN_END = 0xff;

/** A thing's hit: its parts' middles (laterals from its point), half their width, and whether a car meets it only from its side of P. */
export interface TopSpeedHit {
  readonly middles: readonly number[];
  readonly half: number;
  readonly ownSide: boolean;
}

/** A thing a record places: its code and descriptor, its positions into the record, its lateral (P 0x8000) and its hit. */
export interface TopSpeedPlacement {
  readonly code: number;
  readonly index: number;
  readonly ahead: number;
  readonly lateral: number;
  readonly hit: TopSpeedHit | null;
  /** Water's side: it lies from its lateral outward, flat on the ground. */
  readonly water?: 'left' | 'right';
  /** Whether it is a roadside thing flat on the ground (its type 0x1F), drawn beneath the others. */
  readonly flat?: boolean;
}

/** A section's records. */
const SECTION_RECORDS = 32;

/**
 * The records of a fork's branch not taken whose things the original puts out: from the camera's record 27 on, the
 * record five ahead of it is the next section's (S 0x65DC), at a fork each of its two next sections' (S 0x675C to
 * 0x6784), so each branch's first five; a thing whose section is not the camera's is freed as the main program's slide
 * of the road not taken ends, its word at 0x4010E4 then set (S 0x65EC to 0x6612).
 */
export function branchRecords(sub: Uint8Array): number {
  const [from] = instruction(sub, 0x65dc, [0x0c01, null, 0x6406], "the next section's records (cmpi.b, bcc)");
  instruction(sub, 0x675c, [0x1432, 0x1001, 0xb432, 0x1000, 0x6724], "a fork's two next sections (move.b, cmp.b)");
  instruction(sub, 0x65ec, [0x342d, 0x90e4], "the slide's end (move.w)");
  instruction(sub, 0x6608, [0xb229, 0x0020, 0x670c, 0x0891, 0x0000], "another section's thing freed (cmp.b, bclr)");
  return SECTION_RECORDS - (from >> 3);
}

/** An instruction's long operand: its two words. */
const longOf = ([high, low]: readonly number[]) => high! * 0x10000 + low!;

/** The sub program's tables and constants for its things, each found by the instruction that reads it. */
function tables(sub: Uint8Array) {
  return {
    patterns: longOf(instruction(sub, 0x67fe, [0x267c, null, null], 'the patterns (movea.l)')),
    indices: longOf(instruction(sub, 0x688e, [0x247c, null, null], "the codes' descriptors (movea.l)")),
    pushes: longOf(instruction(sub, 0x68a6, [0x247c, null, null], 'the pushes outward (movea.l)')),
    boxes: longOf(instruction(sub, 0x7652, [0x207c, null, null], 'the hit boxes (movea.l)')),
    bumps: longOf(instruction(sub, 0x7772, [0x227c, null, null], 'the things that only bump a car (movea.l)')),
    right: instruction(sub, 0x681c, [0x3c3c, null], "a right roadside thing's lateral (move.w)")[0],
    left: instruction(sub, 0x6840, [0x3c3c, null], "a left roadside thing's lateral (move.w)")[0],
    base: instruction(sub, 0x6886, [0x0642, null], "the roadside codes' base (addi.w)")[0],
    mouthLeft: instruction(sub, 0x6a72, [0x3c3c, null], "a tunnel's left mouth's lateral (move.w)")[0],
    mouthRight: instruction(sub, 0x6a90, [0x3c3c, null], "a tunnel's right mouth's lateral (move.w)")[0],
    mouthPair: instruction(sub, 0x6a8a, [0x0642, null], "the right mouth's code (addi.w)")[0],
    mouthPattern: instruction(sub, 0x6a82, [0x363c, null], "the mouths' pattern's row (move.w)")[0],
    water: instruction(
      sub,
      0x6a18,
      [0x243c, 0x0000, null, 0xd46d, 0x911a],
      "water's code, by the color set (move.l, add.w)",
    )[0],
    waterRight: instruction(sub, 0x6a24, [0x3c3c, null], "water's lateral right (move.w)")[0],
    waterLeft: instruction(sub, 0x6a42, [0x3c3c, null], "water's lateral left (move.w)")[0],
    waterPattern: instruction(sub, 0x6a52, [0x363c, null], "water's pattern's row (move.w)")[0],
    deckApart: instruction(sub, 0x6aea, [0x0687, null, null], "an overpass's far face (addi.l)")[1],
    farDeck: instruction(sub, 0x6af8, [0x0682, null, null], "its far deck's code (addi.l)")[1],
    nearDeck: instruction(sub, 0x6b0a, [0x0682, null, null], "its near deck's code (addi.l)")[1],
    deckLateral: instruction(sub, 0x6b1a, [0x3c3c, null], "a deck's lateral (move.w)")[0],
    postFirst: instruction(sub, 0x6b34, [0x3c3c, null], "its first post's lateral (move.w)")[0],
    postApart: instruction(sub, 0x6b5c, [0x0646, null], 'its posts apart (addi.w)')[0],
    posts6: instruction(sub, 0x6b3c, [0x3b7c, null, 0xa02e], 'its posts (move.w)')[0],
    sides: 0x6b46 + instruction(sub, 0x6b44, [0x45fa, null], "its posts' sides (lea)")[0],
    deckPattern: instruction(sub, 0x6ae4, [0x363c, null], "its pattern's row (move.w)")[0],
    lampLeft: instruction(sub, 0x6aac, [0x3c3c, null], "a tunnel's left lamp's lateral (move.w)")[0],
    lampRight: instruction(sub, 0x6aca, [0x3c3c, null], "a tunnel's right lamp's lateral (move.w)")[0],
    inside: instruction(sub, 0x6a6a, [0x0c02, null], "a tunnel's lamps' parameters (cmpi.b)")[0],
    lampPair: instruction(sub, 0x6ac4, [0x0642, null], "the right lamp's code (addi.w)")[0],
    lampPattern: instruction(sub, 0x6abc, [0x363c, null], "the lamps' pattern's row (move.w)")[0],
    gantry: instruction(sub, 0x6b78, [0x243c, null, null], "a gantry's code (move.l)")[1],
    gantryOdd: instruction(sub, 0x6b86, [0x0642, null], "an odd section's gantry (addi.w)")[0],
    gantryPattern: instruction(sub, 0x6b94, [0x363c, null], "a gantry's pattern's row (move.w)")[0],
    posts: instruction(sub, 0x7808, [0x0641, null], "a gantry's posts (addi.w)")[0],
    centre7: instruction(sub, 0x5982, [0x2c3c, null, null], "bit 7's lane's centre (move.l)")[0],
  };
}

/**
 * The places of a record's things (`placements`): a code's descriptor by the table's byte; a box by the long at its
 * descriptor (S 0x7738 to 0x7746), 0x100 added to each word, its low word the half width and its high word its depth;
 * a thing that only bumps a car (its byte non-zero, S 0x7772) has no hit; the outermost lanes' centres by the mask
 * (S 0x69AE, 0x69C8: a lane each clear bit from bit 0 up, or from bit 7 down); a gantry's the lanes' middle (S 0x5974),
 * its code by the camera's section `cameraSection` (S 0x6B7E).
 */
export function topSpeedPlacements(sub: Uint8Array) {
  instruction(sub, 0x685a, [0x0242, 0x001f], "a roadside code's type (andi.w #$1f)");
  instruction(sub, 0x685e, [0x0c42, FLAT_TYPE, 0x6604, 0x0042, 0x8000], "a flat type's bit 15 (cmpi.w, ori.w)");
  instruction(sub, 0x7778, [0x1031, 0x4000, 0x660e], 'a thing that only bumps a car (move.b, bne)');
  instruction(sub, 0x778c, [0x6100, 0x0360, 0x600c], 'its bump, and no more (bsr, bra)');
  instruction(sub, 0x7aee, [0x6102, 0x4e75, 0x08eb, 0x0005, 0x0005, 0x4e75], "a bump, the car's flag alone (bset)");
  instruction(sub, 0x686e, [0xeb4c, 0x0244, 0x01e0], 'the section, 0x20 codes (lsl.w #5, andi.w #$1e0)');
  instruction(sub, 0x687c, [0xee5c, 0x0244, 0x0e00], 'the stage, 0x200 codes (ror.w #7, andi.w #$e00)');
  instruction(sub, 0x6884, [0xe44b], "a pattern's row, 8 bytes (lsr.w #2)");
  instruction(sub, 0x68ba, [0xdc72, 0x4000], 'a right push outward (add.w)');
  instruction(sub, 0x68ce, [0x9c72, 0x4000], 'a left push outward (sub.w)');
  instruction(sub, 0x6928, [0x4884, 0xe144], "a pattern's offset, 0x100 positions (ext.w, asl.w #8)");
  instruction(sub, 0x69b6, [0x0446, LANE, 0xe21b], 'a lane in from the right (subi.w, ror.b)');
  instruction(sub, 0x69d0, [0x0646, LANE, 0xe31b], 'a lane in from the left (addi.w, rol.b)');
  instruction(sub, 0x7738, [0x203c, 0x0100, 0x0100], "a box's least (move.l #$1000100)");
  const t = tables(sub);
  const indexOf = (code: number) => sub[t.indices + (code & 0xfff)]!;
  const box = (index: number) => {
    const b = long(sub, t.boxes + 4 * index);
    return { half: 0x100 + (b & 0xffff), depth: 0x100 + (b >>> 16) };
  };
  const bumps = (index: number) => sub[t.bumps + index] !== 0;
  // Water's descriptors, its codes' by each color set.
  const waters = new Set(Array.from({ length: COLOR_SETS }, (_, k) => indexOf(t.water + 1 + k)));
  const offsets = (row: number) => {
    const out: number[] = [];
    for (let k = 0; k < PATTERN_BYTES; k++) {
      const b = sub[t.patterns + row * PATTERN_BYTES + k]!;
      if (b === PATTERN_END) return out;
      out.push(((b << 24) >> 24) * 0x100);
    }
    throw romDiffers(`TOP SPEED's pattern ${row} has no end`);
  };
  const rightmost = (mask: number, from: number) => {
    let at = from;
    for (let bit = 0; bit < 8 && !((mask >> bit) & 1); bit++) at -= LANE;
    return at;
  };
  const leftmost = (mask: number, from: number) => {
    let at = from;
    for (let bit = 7; bit >= 0 && !((mask >> bit) & 1); bit--) at += LANE;
    return at;
  };
  return (
    record: TopSpeedRecord,
    stage: number,
    section: number,
    cameraSection: number,
    colorSet: number,
  ): TopSpeedPlacement[] => {
    const out: TopSpeedPlacement[] = [];
    const place = (
      code: number,
      row: number,
      lateral: number,
      hit: (index: number) => TopSpeedHit | null,
      beyond = 0,
    ) => {
      const index = indexOf(code);
      for (const ahead of offsets(row))
        out.push({ code, index, ahead: ahead + beyond, lateral, hit: bumps(index) ? null : hit(index) });
    };
    // Its roadside things, right (byte 5) then left (byte 4), each met from its side of P.
    for (const [byte, right] of [
      [record.right, true],
      [record.left, false],
    ] as const) {
      if (!byte) continue;
      const type = byte & 0x1f;
      const flat = type === FLAT_TYPE;
      const code = ((flat ? 0x8000 : 0) | type | ((section << 5) & 0x1e0) | ((stage << 9) & 0xe00)) + t.base;
      const index = indexOf(code);
      const push = sword(sub, t.pushes + 2 * index);
      const lateral = right ? rightmost(record.mask, t.right) + push : leftmost(record.mask, t.left) - push;
      // A flat one, which only bumps a car: water where its descriptor is one of water's, else a ground patch.
      if (flat && !bumps(index)) throw romDiffers(`TOP SPEED's flat thing ${index} does not only bump a car`);
      if (flat)
        for (const ahead of offsets(byte >> 5))
          out.push({
            code,
            index,
            ahead,
            lateral,
            hit: null,
            flat,
            ...(waters.has(index) ? { water: right ? ('right' as const) : ('left' as const) } : {}),
          });
      else place(code, byte >> 5, lateral, (index) => ({ middles: [0], half: box(index).half, ownSide: true }));
    }
    // A tunnel's mouths, met by no car (its walls its limits), beside the outermost lanes' centres.
    if (record.event === TUNNEL && record.parameter && record.parameter < t.inside) {
      place(record.parameter, t.mouthPattern >> 3, leftmost(record.mask, t.mouthLeft), () => null);
      place(record.parameter + t.mouthPair, t.mouthPattern >> 3, rightmost(record.mask, t.mouthRight), () => null);
    }
    // A tunnel's lamps, met by no car.
    if (record.event === TUNNEL && record.parameter >= t.inside) {
      place(record.parameter, t.lampPattern >> 3, leftmost(record.mask, t.lampLeft), () => null);
      place(record.parameter + t.lampPair, t.lampPattern >> 3, rightmost(record.mask, t.lampRight), () => null);
    }
    // An overpass: its far face 0xE80 positions beyond its near one, each a deck at P met by no car and six posts a
    // position nearer, from 0x800 every 0x3000, each met from its side as the table at S 0x6B6C gives (3 right, 5
    // left) or by none (1); the codes by the stage, the posts the deck's and 1.
    if (record.event === OVERPASS)
      for (const [deck, far] of [
        [t.farDeck, t.deckApart],
        [t.nearDeck, 0],
      ] as const) {
        const code = deck + 2 * stage;
        place(code, t.deckPattern >> 3, t.deckLateral, () => null, far);
        for (let k = 0; k < t.posts6; k++) {
          const side = sub[t.sides + t.posts6 - 1 - k]!;
          place(
            code + 1,
            t.deckPattern >> 3,
            t.postFirst + k * t.postApart,
            (index) => (side === 1 ? null : { middles: [0], half: box(index).half, ownSide: true }),
            far - 1,
          );
        }
      }
    // Water by its event 1 or 2, right or left, its code by the color set (S 0x6A18 to 0x6A5E), bumping a car alone.
    for (const [event, side] of [
      [WATER_RIGHT, 'right'],
      [WATER_LEFT, 'left'],
    ] as const)
      if (record.event === event) {
        const lateral = side === 'right' ? rightmost(record.mask, t.waterRight) : leftmost(record.mask, t.waterLeft);
        const code = t.water + colorSet;
        for (const ahead of offsets(t.waterPattern >> 3))
          out.push({ code, index: indexOf(code), ahead, lateral, hit: null, water: side });
      }
    // A gantry at the lanes' middle, met at its two posts from either side.
    if (record.event === GANTRY) {
      const middle = (leftmost(record.mask, t.centre7) + rightmost(record.mask, t.centre7 + 7 * LANE)) / 2;
      const code = cameraSection & 1 ? t.gantry + t.gantryOdd : t.gantry;
      place(code, t.gantryPattern >> 3, middle, (index) => ({
        middles: [-t.posts, t.posts],
        half: box(index).half,
        ownSide: false,
      }));
    }
    return out;
  };
}
