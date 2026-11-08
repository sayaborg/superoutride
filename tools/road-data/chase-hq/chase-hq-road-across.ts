/**
 * CHASE H.Q.'s road across ([Original road data](../../../docs/original-road-data.md#lanes-by-a-mask)): a course's
 * lanes by its records' masks as the sub program draws them, its limits as the main program holds the car, its
 * tunnels' among them, and its road's and ground's materials, each found by the instructions that read it.
 */
import { instruction, shiftCount, sword } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { groundMaterial } from '../shared/ground-material.js';
import { laneWidths, type MaskChange, type MaskLanes } from '../shared/lane-mask.js';
import type { GroundAlong, ProgramLimits } from '../shared/program-limits.js';
import type { Band, Material } from '../shared/road-surface.js';
import type { Lateral } from '../../../src/course/course-document.js';
import { RECORD_METRES } from './chase-hq-plan.js';
import { LANE_METRES, laneLaterals, lateralMetres, POSITION_METRES, type ChaseHqRecord } from './chase-hq-road.js';

/** The lanes' slots, left to right, their bits in a record's mask, and the slot right of P. */
export const LANES = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f']);
const BITS = Object.freeze([6, 5, 4, 3, 2, 1]);
const CENTRE = 3;
/** A record's event a tunnel, and its kinds: the dirt road, a merge's mask kept left or right, no change smoothed. */
const TUNNEL = 3;
const DIRT_ROAD = 6;
const KEEP_LEFT = 4;
const KEEP_RIGHT = 5;
const UNSMOOTHED = 7;
/** A record's second road where a fork begins. */
const FORK = 3;

/**
 * The lanes as the sub program draws them: a mask's slots a lane each (M 0x8148); a change to a record's mask taken
 * over the 0x1000 positions ending at its record (S 0x3D88 to 0x3D92), at once where it or the record before begins or
 * ends a second road or its kind is 7 (S 0x3E58 to 0x3E60).
 */
export function maskLanes(main: Uint8Array, sub: Uint8Array): MaskLanes & { readonly smoothing: number } {
  instruction(sub, 0x3d8a, [0x0247, 0x1fe0], "a change's stretch's positions (andi.w #$1fe0)");
  const [stretch] = instruction(sub, 0x3d8e, [0x0c47, null], "a change's stretch (cmpi.w)");
  instruction(sub, 0x3e58, [0x0c13, UNSMOOTHED], 'a record of no smoothing (cmpi.b #7)');
  instruction(sub, 0x3e60, [0x0201, 0x0003], "a record's second road (andi.b #3)");
  return {
    names: LANES,
    bits: BITS,
    centre: CENTRE,
    width: laneLaterals(main) * lateralMetres(main),
    placement: 'ending',
    perLane: false,
    smoothing: stretch * POSITION_METRES,
  };
}

/** A record's mask as the sub program draws it: a merge's kind 4 keeping its left nibble, 5 its right (S 0x4BCE). */
export function drawnMask(sub: Uint8Array, record: ChaseHqRecord) {
  instruction(sub, 0x4bce, [0x0c02, KEEP_LEFT], "a merge's left kept (cmpi.b #4)");
  instruction(sub, 0x4bd4, [0x0210, 0x00f0], "a merge's left nibble (andi.b #$f0)");
  instruction(sub, 0x4bda, [0x0c02, KEEP_RIGHT], "a merge's right kept (cmpi.b #5)");
  instruction(sub, 0x4be0, [0x0210, 0x000f], "a merge's right nibble (andi.b #$f)");
  return record.kind === KEEP_LEFT ? record.mask & 0xf0 : record.kind === KEEP_RIGHT ? record.mask & 0x0f : record.mask;
}

/**
 * The changes to the drawn mask along `records` from the course's start: each record whose drawn mask differs from the
 * one before, at its start, over the 12.3 m ending there; at a fork, a merge or a kind 7 too, where the original makes
 * it at once (`atOnce`), as the format's Link joins roads of the same lanes alone (K, 2026-11-08).
 */
export function maskChanges(main: Uint8Array, sub: Uint8Array, records: readonly ChaseHqRecord[]) {
  const lanes = maskLanes(main, sub);
  const changes: MaskChange[] = [];
  const atOnce: number[] = [];
  records.forEach((r, i) => {
    if (i === 0 || drawnMask(sub, r) === drawnMask(sub, records[i - 1]!)) return;
    if (r.secondRoad !== 0 || records[i - 1]!.secondRoad !== 0 || r.kind === UNSMOOTHED) atOnce.push(i * RECORD_METRES);
    changes.push({ mask: drawnMask(sub, r), at: i * RECORD_METRES, length: lanes.smoothing });
  });
  return { lanes, first: drawnMask(sub, records[0]!), changes, atOnce };
}

/**
 * A record's limits, metres right of P: the main program holds the car within its mask's outermost lanes' centres
 * 0xDE0 laterals out (M 0x8B50), and in a tunnel 0x1E0 out (M 0x9B5A).
 */
export function recordLimits(main: Uint8Array, record: ChaseHqRecord): readonly [number, number] {
  const [beyond] = instruction(main, 0x8b50, [0x0681, 0xf220, null], "the limits beyond the lanes' centres (addi.l)");
  const [wall] = instruction(main, 0x9b5a, [0x0681, 0xfe20, null], "a tunnel's walls (addi.l)");
  const set = BITS.map((bit, k) => ((record.mask >> bit) & 1 ? k : -1)).filter((k) => k >= 0);
  if (set.length === 0) throw romDiffers('A record sets no lane');
  const metres = lateralMetres(main);
  const lane = LANE_METRES;
  const out = (record.event === TUNNEL ? wall : beyond) * metres;
  return [(set[0]! - CENTRE + 0.5) * lane - out, (set.at(-1)! - CENTRE + 0.5) * lane + out];
}

/** Where a course's limits change at once: each record's start whose limits differ from the record's before. */
export function limitCuts(main: Uint8Array, records: readonly ChaseHqRecord[]) {
  const limits = records.map((r) => recordLimits(main, r));
  return limits.flatMap((l, i) =>
    i > 0 && (l[0] !== limits[i - 1]![0] || l[1] !== limits[i - 1]![1]) ? [i * RECORD_METRES] : [],
  );
}

/** A Section's limits from station `from` to `to`, its records' one pair of limits, held straight. */
export function spanLimits(
  main: Uint8Array,
  records: readonly ChaseHqRecord[],
  from: number,
  to: number,
  ground: GroundAlong,
): ProgramLimits {
  const first = Math.floor(from / RECORD_METRES + 1e-9);
  const [left, right] = recordLimits(main, records[first]!);
  for (let i = first; i * RECORD_METRES < to - 1e-9; i++) {
    const l = recordLimits(main, records[i]!);
    if (l[0] !== left || l[1] !== right)
      throw romDiffers(`The limits change within a Section at ${i * RECORD_METRES} m`);
  }
  return {
    left: [
      [from, left],
      [to, left],
    ],
    right: [
      [from, right],
      [to, right],
    ],
    ground,
  };
}

/** A record's road material: its dirt road's `DIRT`, else `ASPHALT`. */
export const roadMaterial = (record: ChaseHqRecord): Material => (record.kind === DIRT_ROAD ? 'DIRT' : 'ASPHALT');

/** Whether a record is a tunnel's (its event 3), dark, or the dirt road's (its kind 6). */
export const darkRecord = (record: ChaseHqRecord) => record.event === TUNNEL;
export const dirtRecord = (record: ChaseHqRecord) => record.kind === DIRT_ROAD;

/**
 * The ground's material along the course, the same each side as the program draws it: each record's road palette
 * entry's ground colors (`groundColors`) by the shared rule, where it changes, from its record's start; a stretch
 * whose two colors differ in material, or of `WATER` (no water lies beside CHASE H.Q.'s roads), stops the conversion.
 */
export function groundAlong(
  records: readonly ChaseHqRecord[],
  groundColors: (entry: number) => readonly number[],
): GroundAlong {
  const runs: [number, Material][] = [];
  records.forEach((r, i) => {
    const [a, b] = groundColors(r.palette).map(groundMaterial);
    if (a !== b)
      throw romDiffers(`The road palette entry 0x${r.palette.toString(16)}'s ground colors differ in material`);
    if (a === 'WATER') throw romDiffers(`The road palette entry 0x${r.palette.toString(16)}'s ground reads as water`);
    if (runs.at(-1)?.[1] !== a) runs.push([i * RECORD_METRES, a!]);
  });
  return { left: runs, right: runs };
}

/** A Section's span of a course, its stations metres from the start. */
interface Span {
  readonly from: number;
  readonly to: number;
}

/** A piece of a Section's road band: its band (0 the left edge, 1 the body, 2 the right edge), stations and laterals. */
export interface BandPiece {
  readonly band: 0 | 1 | 2;
  readonly from: number;
  readonly to: number;
  readonly left: Lateral;
  readonly right: Lateral;
  readonly material: Material;
  /** Whether the picture of two roads colors it (`compositeOf`), the piece its material alone. */
  readonly pictured: boolean;
}

/**
 * A Section's road bands, left to right: its left edge, its body over its lanes and its right edge, `edge` metres
 * beyond them (the lanes `first` and `last` its outermost the Section writes, or the sides `across`), each its records'
 * road material (a station before the first record the first's): its pieces cut where the material changes and at
 * `cuts`, and the edges where `twoRoads` begins and ends, over which the picture of two roads colors them; the edges its
 * outermost bands, which the ground reaches out from.
 */
export function spanBands(
  sub: Uint8Array,
  records: readonly ChaseHqRecord[],
  span: Span,
  edge: number,
  [first, last]: readonly [string, string] = [LANES[0]!, LANES.at(-1)!],
  across?: readonly [number, number],
  twoRoads?: Span,
  cuts: readonly number[] = [],
) {
  // The body's sides: its outermost lanes' edges, or `across`, metres right of P, where the picture is not the lanes'.
  const [left, right]: readonly [Lateral, Lateral] = across ?? [
    { lane: first, side: 'left', offset: 0 },
    { lane: last, side: 'right', offset: 0 },
  ];
  const laterals: readonly (readonly [Lateral, Lateral])[] = [
    [beside(left, -edge), left],
    [left, right],
    [right, beside(right, edge)],
  ];
  const record = (s: number) => records[Math.max(0, Math.floor(s / RECORD_METRES + 1e-9))]!;
  const within = (s: number) => s > span.from + 1e-9 && s < span.to - 1e-9;
  const materialCuts: number[] = [];
  for (let i = Math.max(0, Math.floor(span.from / RECORD_METRES + 1e-9)) + 1; i * RECORD_METRES < span.to - 1e-9; i++)
    if (roadMaterial(records[i]!) !== roadMaterial(records[i - 1]!)) materialCuts.push(i * RECORD_METRES);
  const bounds = (k: number) =>
    [
      ...new Set([
        span.from,
        ...materialCuts,
        ...(k !== 1 && twoRoads ? [twoRoads.from, twoRoads.to].filter(within) : []),
        ...cuts.filter(within),
        span.to,
      ]),
    ].sort((x, y) => x - y);
  const pictured = (a: number, b: number) => !!twoRoads && a >= twoRoads.from - 1e-9 && b <= twoRoads.to + 1e-9;
  const pieces: BandPiece[] = ([0, 1, 2] as const).flatMap((band) => {
    const at = bounds(band);
    return at.slice(0, -1).map((from, j) => ({
      band,
      from,
      to: at[j + 1]!,
      left: laterals[band]![0],
      right: laterals[band]![1],
      material: roadMaterial(record(from)),
      pictured: band !== 1 && pictured(from, at[j + 1]!),
    }));
  });
  // The outermost bands' metres across, the record's drawn mask's at the Section's start.
  const r = record(span.from);
  const set = BITS.map((bit, k) => ((drawnMask(sub, r) >> bit) & 1 ? k : -1)).filter((k) => k >= 0);
  const [l, rr] = [(set[0]! - CENTRE) * LANE_METRES, (set.at(-1)! - CENTRE + 1) * LANE_METRES];
  const band = (from: number, to: number): Band => ({ left: from, right: to, colors: [], material: roadMaterial(r) });
  return {
    pieces,
    outermost: [
      { band: band(l - edge, l), left: laterals[0]![0], right: laterals[0]![1] },
      { band: band(rr, rr + edge), left: laterals[2]![0], right: laterals[2]![1] },
    ] as const,
  };
}

/** A lateral `by` metres on from `l`. */
export const beside = (l: Lateral, by: number): Lateral =>
  typeof l === 'number' ? l + by : { ...l, offset: l.offset + by };

/**
 * The road not taken where a course's fork opens (S 0x4DBA to 0x4E02): from the start of the record after the one
 * that begins the fork, over 0x10000 positions (`length`), the other branch's road beside the course's, its lanes by
 * its own records' masks (`other`) about its own P, which moves away from the course's by the table's laterals (0xF654,
 * a word each 0x80 positions, `step`), negated where the side table (0xF5E4) by the camera's section (`sections`, each
 * record's) is not 0: to the right of the course's P, else to its left (`beside`). Then it is drawn no more.
 */
export function roadNotTaken(
  main: Uint8Array,
  sub: Uint8Array,
  records: readonly ChaseHqRecord[],
  other: readonly ChaseHqRecord[],
  sections: readonly number[],
) {
  instruction(sub, 0x4dac, [0x1039, 0x0010, 0x21bc], "the camera's section (move.b)");
  const [sidesHigh, sidesLow] = instruction(sub, 0x4dba, [0x41f9, null, null], "the road not taken's sides (lea)");
  const sides = sidesHigh * 0x10000 + sidesLow;
  instruction(sub, 0x4de4, [0x13f0, 0x0000, 0x0010, 0x2cda], "the camera's section's side (move.b (a0,d0.w))");
  instruction(sub, 0x4dec, [0x6702], 'a side of 0 kept (beq.b)');
  instruction(sub, 0x4dee, [0x4442], 'any other side negated (neg.w d2)');
  instruction(sub, 0x4dcc, [0x0c81, 0x0001, 0x0000], "the road not taken's positions (cmpi.l #$10000)");
  const [mask] = instruction(sub, 0x4dd4, [0x0241, null], "a step's positions (andi.w)");
  const shift = shiftCount(instruction(sub, 0x4dd8, [null], "a step's word (lsr.w)")[0], 0xe048, 'step');
  const [high, low] = instruction(sub, 0x4dda, [0x43f9, null, null], "the road not taken's laterals (lea)");
  const table = high * 0x10000 + low;
  const positions = 0x10000,
    stepPositions = 0x10000 - mask;
  if (stepPositions !== 2 ** (shift + 1)) throw romDiffers("The road not taken's steps are not its table's words");
  const fork = records.findIndex((_, i) => i > 0 && records[i - 1]!.secondRoad === FORK);
  if (fork < 0) throw romDiffers('A course meets no fork');
  const drawn = Math.ceil((positions * POSITION_METRES) / RECORD_METRES - 1e-9);
  if (sections.slice(fork, fork + drawn).some((s) => s !== sections[fork]))
    throw romDiffers("A road not taken's camera passes from one section to another");
  const lanes = maskLanes(main, sub);
  const changes = maskChanges(main, sub, other);
  const widths = laneWidths(lanes, 0, changes.first, changes.changes, []);
  const width = (k: number, s: number) => {
    const pieces = widths[k]!.pieces;
    return ([...pieces].reverse().find((p) => p.from <= s + 1e-9) ?? pieces[0]!).width(s);
  };
  const sign = sub[sides + sections[fork]!] === 0 ? 1 : -1;
  return {
    from: fork * RECORD_METRES,
    /** The side of the course's P it lies on. */
    beside: sign > 0 ? ('right' as const) : ('left' as const),
    length: positions * POSITION_METRES,
    step: stepPositions * POSITION_METRES,
    steps: positions / stepPositions,
    /** Its P's lateral, metres right of the course's, `k` steps after its start. */
    offset: (k: number) =>
      sign * sword(sub, table + 2 * Math.min(k, positions / stepPositions - 1)) * lateralMetres(main),
    /** Its lanes' edges at station `s`, metres either side of its P. */
    edges: (s: number): readonly [number, number] => [
      -LANES.slice(0, CENTRE).reduce((sum, _, k) => sum + width(k, s), 0),
      LANES.slice(CENTRE).reduce((sum, _, k) => sum + width(CENTRE + k, s), 0),
    ],
  };
}
