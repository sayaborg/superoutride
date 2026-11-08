/**
 * CHASE H.Q.'s road across ([Original road data](../../../docs/original-road-data.md#lanes-by-a-mask)): a course's
 * lanes by its records' masks as the sub program draws them, its limits as the main program holds the car, its
 * tunnels' among them, and its road's and ground's materials, each found by the instructions that read it.
 */
import { instruction } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { groundMaterial } from '../shared/ground-material.js';
import type { MaskChange, MaskLanes } from '../shared/lane-mask.js';
import type { GroundAlong, ProgramLimits } from '../shared/program-limits.js';
import { baseColor, type Band, type Material } from '../shared/road-surface.js';
import { stripElement } from '../shared/section-writing.js';
import type { CoursePosition, Lateral } from '../../../src/course/course-document.js';
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
 * The changes to the drawn mask along `records` from the course's start, and the stations where one is made at once:
 * each record whose drawn mask differs from the one before, at its start.
 */
export function maskChanges(main: Uint8Array, sub: Uint8Array, records: readonly ChaseHqRecord[]) {
  const lanes = maskLanes(main, sub);
  const changes: MaskChange[] = [];
  records.forEach((r, i) => {
    if (i === 0 || drawnMask(sub, r) === drawnMask(sub, records[i - 1]!)) return;
    const atOnce = r.secondRoad !== 0 || records[i - 1]!.secondRoad !== 0 || r.kind === UNSMOOTHED;
    changes.push({ mask: drawnMask(sub, r), at: i * RECORD_METRES, length: atOnce ? 0 : lanes.smoothing });
  });
  return {
    lanes,
    first: drawnMask(sub, records[0]!),
    changes,
    jumps: changes.filter((c) => c.length === 0).map((c) => c.at),
  };
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

/**
 * A Section's road bands, left to right: its left edge, its body over its lanes and its right edge, `edge` metres
 * beyond them, each its colors by bank (`colors`) and its records' road material, its Strips each band's base color
 * cut where the material changes; the edges its outermost bands, which the ground reaches out from.
 */
export function spanBands(
  sub: Uint8Array,
  records: readonly ChaseHqRecord[],
  span: Span,
  edge: number,
  colors: (record: ChaseHqRecord) => { readonly edge: readonly number[]; readonly body: readonly number[] },
  positionAt: (s: number) => CoursePosition,
) {
  const first = LANES[0]!,
    last = LANES.at(-1)!;
  const laterals: readonly (readonly [Lateral, Lateral])[] = [
    [
      { lane: first, side: 'left', offset: -edge },
      { lane: first, side: 'left', offset: 0 },
    ],
    [
      { lane: first, side: 'left', offset: 0 },
      { lane: last, side: 'right', offset: 0 },
    ],
    [
      { lane: last, side: 'right', offset: 0 },
      { lane: last, side: 'right', offset: edge },
    ],
  ];
  const record = (s: number) => records[Math.floor(s / RECORD_METRES + 1e-9)]!;
  const cuts = [span.from];
  for (let i = Math.floor(span.from / RECORD_METRES + 1e-9) + 1; i * RECORD_METRES < span.to - 1e-9; i++)
    if (roadMaterial(records[i]!) !== roadMaterial(records[i - 1]!)) cuts.push(i * RECORD_METRES);
  cuts.push(span.to);
  const bandsAt = (s: number): Band[] => {
    const r = record(s);
    const c = colors(r);
    const set = BITS.map((bit, k) => ((drawnMask(sub, r) >> bit) & 1 ? k : -1)).filter((k) => k >= 0);
    const [left, right] = [(set[0]! - CENTRE) * LANE_METRES, (set.at(-1)! - CENTRE + 1) * LANE_METRES];
    const across = [left - edge, left, right, right + edge];
    return [c.edge, c.body, c.edge].map((cs, k) => ({
      left: across[k]!,
      right: across[k + 1]!,
      colors: cs,
      material: roadMaterial(r),
    }));
  };
  const strips = cuts
    .slice(0, -1)
    .flatMap((a, j) =>
      bandsAt(a).map((band, k) =>
        stripElement(
          positionAt(a),
          positionAt(cuts[j + 1]!),
          laterals[k]![0],
          laterals[k]![1],
          baseColor(band),
          band.material,
        ),
      ),
    );
  const outer = bandsAt(span.from);
  return {
    strips,
    outermost: [
      { band: outer[0]!, left: laterals[0]![0], right: laterals[0]![1] },
      { band: outer[2]!, left: laterals[2]![0], right: laterals[2]![1] },
    ] as const,
  };
}
