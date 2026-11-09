/**
 * CHASE H.Q.'s objects as its main program places them ([CHASE H.Q. road data](../../../docs/chase-hq-road-data.md#chase-hqs-objects),
 * [research notes](../../../docs/research/chase-hq.md#things)): each record's things from its road's table, four entries a
 * record, each a kind laid at a pattern of places along the record and a pattern of laterals beside its outer lanes'
 * centres (M 0x9170), or, for a record whose event places its own, that event's (M 0x9296); and what a car hits of each
 * (M 0x9C56).
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { ChaseHqRecord } from './chase-hq-road.js';

/** A road's table's bytes, a record's entries' and their count (M 0x917C to 0x91B2). */
const ROAD_BYTES = 0x2000;
const ENTRY_BYTES = 4;
const ENTRIES = 4;
/** A pattern's end, of places (a byte) and of laterals (a word). */
const PLACES_END = 0xff;
const LATERALS_END = 0xffff;
/** The kinds the hit table holds, from the first on (M 0x9CC0, 0x9CC6). */
const HIT_KINDS = [0x300, 0x600] as const;
/**
 * A thing's flags as it is placed (its slot's byte 8): `POSTS`, a car hits its two posts; else `HITS`, none hitting
 * nothing, both (`BOTH_SIDES`) from either side, one from the thing's side of P alone.
 */
const POSTS = 0x80;
const HITS = 0x06;
const BOTH_SIDES = 0x06;
/** The events whose records place no thing of their table, a tunnel's and a gate's (their handlers leave M 0x7D2A set). */
const OWN_PLACES = Object.freeze([3, 4]);
/** P, lanes on from the outer lanes' first centre (the mask's top bit's): between lanes c and d. */
const P_LANES = 3.5;
/** The event whose things this module places beside its record's table's: the sign over the road. */
const SIGN = 6;

/**
 * What a car hits of a thing: parts each `half` laterals to either side of its middle, the middles laterals from the
 * thing's lateral (one, or its two posts); `ownSide`, only a car whose lateral lies on the thing's side of P; `knocked`,
 * the thing knocked away where it is hit (M 0x9D32), not the car stopped.
 */
export interface ChaseHqHit {
  readonly middles: readonly number[];
  readonly half: number;
  readonly ownSide: boolean;
  readonly knocked: boolean;
}

/** A thing placed: its kind, its place (positions from its record's start), its lateral (road laterals right of P) and its hit. */
export interface ChaseHqPlacement {
  readonly kind: number;
  readonly ahead: number;
  readonly lateral: number;
  readonly hit: ChaseHqHit | null;
}

const s8 = (v: number) => (v << 24) >> 24;
const s16 = (v: number) => (v << 16) >> 16;
const long = ([high, low]: readonly number[]) => high! * 0x10000 + low!;

/** The main program's tables for its placements, each found by the instruction that reads it. */
function tables(main: Uint8Array) {
  const places = long(instruction(main, 0x914c, [0x267c, null, null], "the places' patterns (movea.l)"));
  const roads = long(instruction(main, 0x917c, [0x207c, null, null], "the roads' things (movea.l)"));
  instruction(
    main,
    0x9184,
    [0x142d, 0x2019, 0x4842, 0xe682],
    "a road's table, its index × 0x2000 (move.b, swap, asr.l)",
  );
  instruction(main, 0x919a, [0x3430, 0x0000], "an entry's kind (move.w)");
  instruction(main, 0x91b6, [0x1630, 0x0003, 0xe743, 0x0243, 0x07f8], "an entry's places (move.b, asl.w, andi.w)");
  instruction(main, 0x91d4, [0x1a30, 0x0002, 0xe945, 0x0245, 0x0ff0], "an entry's laterals (move.b, asl.w, andi.w)");
  const laterals = long(instruction(main, 0x918e, [0x247c, null, null], "the laterals' patterns (movea.l)"));
  instruction(main, 0x91f4, [0x3232, 0x5000, 0x6a08, 0x4846, 0xd246], 'a lateral beside an outer lane (move.w, bpl)');
  const [tableFlags] = instruction(main, 0x9216, [0x137c, null, 0x0008], "a table's thing's flags (move.b)");
  const [first, firstRight, step] = instruction(
    main,
    0x8142,
    [0x2c3c, null, null, 0x2a3c, null],
    'the outer lanes (move.l)',
  );
  if (first !== firstRight) throw romDiffers("The outer lanes' first centres differ");
  const hits = long(instruction(main, 0x9c56, [0x207c, null, null], 'the hits (movea.l)'));
  instruction(main, 0x9cc0, [0x0443, HIT_KINDS[0], 0x650e, 0x0c43, HIT_KINDS[1] - HIT_KINDS[0]], "a hit's kind");
  instruction(main, 0x9c92, [0x0800, 0x0007], "a thing's posts' flag (btst.b)");
  instruction(main, 0x9ca0, [0x0200, HITS], "a thing's hit's flags (andi.b)");
  const [knockedFrom, knockedTo] = instruction(
    main,
    0x9d3c,
    [0x0c40, null, 0x651c, 0x0c40, null],
    'the kinds knocked away (cmpi.w, bcs, cmpi.w)',
  );
  const [displacement] = instruction(main, 0x9296, [0x4dfa, null], "the events' handlers (lea)");
  const events = 0x9298 + s16(displacement);
  const handler = (event: number) => long([word(main, events + 4 * event), word(main, events + 4 * event + 2)]);
  // The sign: its kinds by the parameter and the road's width, centred on it, its flags and places (M 0x93EE, 0x94BC).
  const sign = handler(SIGN);
  const [signKinds] = instruction(main, sign, [0x1430, 0x0007, 0x0282, 0x0000, null, 0xe742], "a sign's parameter");
  const [signFirst] = instruction(main, sign + 12, [0x0642, null, 0x6100, 0x00bc], "a sign's first kind (addi.w, bsr)");
  const [signPlaces] = instruction(main, sign + 20, [0x363c, null], "a sign's places (move.w)");
  const [signFlags] = instruction(main, sign + 26, [0x103c, null], "a sign's flags (move.b)");
  const [narrowest] = instruction(main, 0x94ce, [0x0444, null], "a sign's narrowest road (subi.w)");
  instruction(main, 0x94d6, [0x0444, step], "a sign's road wider by a lane (subi.w)");
  return {
    places,
    roads,
    laterals,
    tableFlags,
    lanes: { first, step },
    hits,
    knocked: { from: knockedFrom, to: knockedTo },
    sign: { kinds: signKinds, first: signFirst, places: signPlaces, flags: signFlags, narrowest },
  };
}

/**
 * The things of CHASE H.Q.'s records by their roads' tables and their events: `(road, index, record)` the things record
 * `record`, the `index`th of road `road` (its section × 32 and its place in it), places, in the order the program spawns
 * them. A thing of a record's table stands at each of its pattern's places, a byte each, its value × 0x100 positions from
 * the record's start, at each of its pattern's laterals, a word each beside the rightmost lane's centre where it is 0 or
 * more, else the leftmost's (M 0x8142: the first lane 0x6FD0 and a lane 0x4A0 on by the mask's bits, P 3.5 lanes on from
 * the first, 0x8000, between lanes c and d). A record's event places its own things before them, a tunnel's (3) and a
 * gate's (4) instead of them (their handlers leave M 0x7D2A set): of those, the sign over the road (6), centred on the
 * outer lanes, its kind wider by one for each lane beyond three. The backdrop event 2 places (kind 0x681) is not: its
 * composer draws it as though it stood 0x400 + 0.75 d² / 65,536 positions away at a distance d (M 0x44FC2 to
 * 0x44FD2), where a board stands at one distance.
 */
export function chaseHqPlacements(main: Uint8Array) {
  const t = tables(main);
  const hitOf = (kind: number, flags: number): ChaseHqHit | null => {
    if (kind < HIT_KINDS[0] || kind >= HIT_KINDS[1] || !(flags & (POSTS | HITS))) return null;
    const entry = t.hits + 4 * (kind - HIT_KINDS[0]);
    const [length, half] = [word(main, entry), word(main, entry + 2)];
    if (!half) return null;
    const knocked = kind >= t.knocked.from && kind < t.knocked.to;
    if (flags & POSTS) return { middles: [-length, length], half, ownSide: false, knocked };
    return { middles: [0], half, ownSide: (flags & HITS) !== BOTH_SIDES, knocked };
  };
  /** The centres of the record's outer lanes, its leftmost's and its rightmost's (M 0x8142). */
  const outerLanes = (mask: number) => {
    let bit = 7,
      left = t.lanes.first;
    for (; bit >= 0 && !((mask >> bit) & 1); bit--) left += t.lanes.step;
    if (bit < 0) throw romDiffers(`A record's lane mask 0x${mask.toString(16)} has no lane`);
    let right = left;
    for (bit--; bit >= 0 && (mask >> bit) & 1; bit--) right += t.lanes.step;
    return [left, right] as const;
  };
  const placesOf = (pattern: number) => {
    const out: number[] = [];
    for (let at = t.places + pattern; main[at] !== PLACES_END; at++) {
      if (at >= main.length) throw romDiffers(`A places' pattern at 0x${pattern.toString(16)} has no end`);
      out.push(s8(main[at]!) << 8);
    }
    return out;
  };
  const lateralsOf = (pattern: number) => {
    const out: number[] = [];
    for (let at = t.laterals + pattern; word(main, at) !== LATERALS_END; at += 2) out.push(s16(word(main, at)));
    return out;
  };
  const p = t.lanes.first + P_LANES * t.lanes.step;
  const spawned = (kind: number, places: number, lateral: number, flags: number) =>
    placesOf(places).map((ahead) => ({ kind, ahead, lateral: (lateral & 0xffff) - p, hit: hitOf(kind, flags) }));
  return (road: number, index: number, record: ChaseHqRecord): readonly ChaseHqPlacement[] => {
    const [left, right] = outerLanes(record.mask);
    const out: ChaseHqPlacement[] = [];
    if (record.event === SIGN) {
      let wider = 0;
      for (let d = right - left - t.sign.narrowest; d >= 0; d -= t.lanes.step) wider++;
      const kind = t.sign.first + (record.parameter & t.sign.kinds) * 8 + wider;
      out.push(...spawned(kind, t.sign.places, (left + right) >> 1, t.sign.flags));
    }
    if (OWN_PLACES.includes(record.event)) return out;
    for (let e = 0; e < ENTRIES; e++) {
      const at = t.roads + road * ROAD_BYTES + index * ENTRIES * ENTRY_BYTES + e * ENTRY_BYTES;
      const kind = word(main, at);
      if (!kind) continue;
      const laterals = lateralsOf((main[at + 2]! << 4) & 0xff0);
      for (const ahead of placesOf((main[at + 3]! << 3) & 0x7f8))
        for (const w of laterals)
          out.push({
            kind,
            ahead,
            lateral: (((w < 0 ? left : right) + w) & 0xffff) - p,
            hit: hitOf(kind, t.tableFlags),
          });
    }
    return out;
  };
}
