/**
 * TOP SPEED's road across ([Original road data](../../../docs/original-road-data.md#lanes-by-a-mask), [TOP SPEED road
 * data](../../../docs/top-speed-road-data.md#its-road-across)): a course's lanes by its records' masks as the main
 * program draws them, its limits as the sub program holds the car, its tunnels' walls among them, and its ground's
 * materials, each found by the instructions that read them.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { groundMaterial } from '../shared/ground-material.js';
import type { MaskChange, MaskLanes } from '../shared/lane-mask.js';
import type { GroundAlong, ProgramLimits } from '../shared/program-limits.js';
import type { Material } from '../shared/road-surface.js';
import { RECORD_UNITS } from '../taito/course-records.js';
import { rgb555Of } from '../taito/palette.js';
import { colorSet } from './top-speed-backgrounds.js';
import { coursePieces, RECORD_METRES } from './top-speed-plan.js';
import { LANE_METRES, POSITION_METRES, SECTIONS, type TopSpeedRecord, type TopSpeedStage } from './top-speed-road.js';

/** The lanes' slots, left to right, their bits in a record's mask, and the slot right of P. */
export const LANES = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f']);
const BITS = Object.freeze([6, 5, 4, 3, 2, 1]);
const CENTRE = 3;
/** A record's event a tunnel. */
const TUNNEL = 3;
/** The goal section. */
const GOAL = SECTIONS - 1;

/** A course's record: its record, its stage and its section (`courseSections`). */
export interface CourseRecord {
  readonly record: TopSpeedRecord;
  readonly stage: number;
  readonly section: number;
}

/** A course's sections' records, each with its stage and its section, from the course's start. */
export const courseRecords = (
  sections: readonly {
    readonly stage: number;
    readonly section: number;
    readonly records: readonly TopSpeedRecord[];
  }[],
): CourseRecord[] =>
  sections.flatMap((s) => s.records.map((record) => ({ record, stage: s.stage, section: s.section })));

/** A lane's laterals, the slot the sub program adds for each lane of a mask (S 0x5988), both halves of its long. */
export function laneLaterals(sub: Uint8Array) {
  const [left, right] = instruction(sub, 0x5988, [0x2a3c, null, null], "the lane mask's slots (move.l)");
  if (left !== right) throw romDiffers("The lane mask's two sides' slots differ");
  return left;
}

/** A road lateral, metres: a lane's width over its slot's laterals. */
export const lateralMetres = (sub: Uint8Array) => LANE_METRES / laneLaterals(sub);

/**
 * A lane's change, metres: the main program moves each side's drawn edge toward its mask's, 0x128 of its units a lane
 * (M 0x7FC0), by the camera's advance over 32 a frame (M 0x8044 to 0x805E), twice that in a goal section (M 0x6276 to
 * 0x629E, M 0x8060 to 0x8068), so that a lane takes 0x2500 positions, 28.4 m, and 14.2 m in a goal section.
 */
function laneChange(main: Uint8Array) {
  const [units] = instruction(main, 0x7fc0, [0x303c, null], "a lane's edge units (move.w)");
  instruction(main, 0x805e, [0xea42], "the advance a frame's edge units (asr.w #5)");
  instruction(main, 0x8060, [0x4a79, 0x0040, 0x1102, 0x6702, 0xd442], 'doubled where the flag is set (tst.w, add.w)');
  const [goal] = instruction(main, 0x6276, [0x0c39, null, 0x0040, 0x104c], 'the flag set in a goal section (cmpi.b)');
  instruction(main, 0x629e, [0x4679, 0x0040, 0x1102], 'the flag set (not.w)');
  if (goal !== GOAL) throw romDiffers("The lanes' quicker changes are not a goal section's");
  const metres = units * 32 * POSITION_METRES;
  return (section: number) => (section === GOAL ? metres / 2 : metres);
}

/** The lanes as the main program draws them: a mask's slots a lane each, each side's edge moving a lane at a time. */
export function maskLanes(sub: Uint8Array): MaskLanes {
  return {
    names: LANES,
    bits: BITS,
    centre: CENTRE,
    width: laneLaterals(sub) * lateralMetres(sub),
    placement: 'starting',
    perLane: true,
  };
}

/**
 * The changes to the mask along a course's records `records` from its start: each record whose mask differs from the
 * one before, from its start, each side's edge taking its section's change a lane.
 */
export function maskChanges(main: Uint8Array, sub: Uint8Array, records: readonly CourseRecord[]) {
  const lane = laneChange(main);
  const changes: MaskChange[] = [];
  records.forEach(({ record, section }, i) => {
    if (i > 0 && record.mask !== records[i - 1]!.record.mask)
      changes.push({ mask: record.mask, at: i * RECORD_METRES, length: lane(section) });
  });
  return { lanes: maskLanes(sub), first: records[0]!.record.mask, changes };
}

/**
 * Where a tunnel's walls hold the car within a record, its first and last fractions: its event 3 (S 0x6334 to 0x6348)
 * with its parameter 0 or 0x50 or more walls all of it, 0x48 to 0x4F its first half and any other its second (S 0x58F2
 * to 0x5934, the position's bits 12 to 8 against 0x10).
 */
function walls(sub: Uint8Array): (record: TopSpeedRecord) => readonly [number, number] | undefined {
  instruction(sub, 0x6338, [0x0201, 0x00e0, 0x0c01, TUNNEL << 5], "a tunnel's event (andi.b, cmpi.b #$60)");
  const [whole] = instruction(sub, 0x58f8, [0x0c00, null], 'a parameter walling the whole record (cmpi.b)');
  const [first] = instruction(sub, 0x5900, [0x0c00, null], 'a parameter walling its first half (cmpi.b)');
  const [half] = instruction(sub, 0x590e, [0x0c03, null], "a record's half (cmpi.b)");
  if (half * 0x100 !== RECORD_UNITS / 2) throw romDiffers("A tunnel's walls do not take a record's half");
  return (r) => {
    if (r.event !== TUNNEL) return undefined;
    if (r.parameter === 0 || r.parameter >= whole) return [0, 1];
    return r.parameter >= first ? [0, 0.5] : [0.5, 1];
  };
}

/** A stretch of a course whose limits are one pair, metres right of P, from station `from` to `to`. */
export interface LimitStretch {
  readonly from: number;
  readonly to: number;
  readonly left: number;
  readonly right: number;
  /** Whether a tunnel's walls hold the car there. */
  readonly walled: boolean;
}

/**
 * A course's limits along its records: the sub program holds the car within its record's mask's outermost lanes'
 * centres 0xDE0 laterals out (S 0x6354), and where a tunnel's walls are 0x1E0 out (S 0x75EE), changing at once at a
 * record's start or its half; each stretch of one pair.
 */
export function limitStretches(sub: Uint8Array, records: readonly CourseRecord[]): LimitStretch[] {
  const [beyond] = instruction(sub, 0x6354, [0x0681, 0xf220, null], "the limits beyond the lanes' centres (addi.l)");
  const [wall] = instruction(sub, 0x75ee, [0x0681, 0xfe20, null], "a tunnel's walls (addi.l)");
  const walled = walls(sub);
  const metres = lateralMetres(sub);
  const out: LimitStretch[] = [];
  const push = (from: number, to: number, record: TopSpeedRecord, w: number) => {
    const walledThere = w === wall;
    const set = BITS.map((bit, k) => ((record.mask >> bit) & 1 ? k : -1)).filter((k) => k >= 0);
    if (set.length === 0) throw romDiffers('A record sets no lane');
    const [left, right] = [
      (set[0]! - CENTRE + 0.5) * LANE_METRES - w * metres,
      (set.at(-1)! - CENTRE + 0.5) * LANE_METRES + w * metres,
    ];
    const last = out.at(-1);
    if (last && last.left === left && last.right === right && last.walled === walledThere)
      out[out.length - 1] = { ...last, to };
    else if (to > from) out.push({ from, to, left, right, walled: walledThere });
  };
  records.forEach(({ record }, i) => {
    const s = i * RECORD_METRES;
    const w = walled(record);
    if (!w) return push(s, s + RECORD_METRES, record, beyond);
    push(s, s + w[0] * RECORD_METRES, record, beyond);
    push(s + w[0] * RECORD_METRES, s + w[1] * RECORD_METRES, record, wall);
    push(s + w[1] * RECORD_METRES, s + RECORD_METRES, record, beyond);
  });
  return out;
}

/** Where a course's limits change at once: each stretch's start but the first's. */
export const limitCuts = (stretches: readonly LimitStretch[]) => stretches.slice(1).map((s) => s.from);

/** A Section's limits from station `from` to `to`, its stretch's one pair, held straight. */
export function spanLimits(
  stretches: readonly LimitStretch[],
  from: number,
  to: number,
  ground: GroundAlong,
): ProgramLimits {
  const within = stretches.filter((s) => s.to > from + 1e-9 && s.from < to - 1e-9);
  if (within.length !== 1) throw romDiffers(`The limits change within a Section at ${from} m`);
  const { left, right } = within[0]!;
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

/**
 * The ground's color by a color set and a record's field: the table at M 0xBA6C0 (M 0x47D6), 8 bytes a color set from
 * set 1 (M 0x47E2 to 0x47EA), a word by the field's low two bits (its word at 2 masked by 0x0C00, M 0x47EC to 0x47F2).
 */
export function groundColor(main: Uint8Array): (set: number, scene: number) => number {
  const [high, low] = instruction(main, 0x47d6, [0x41f9, null, null], "the ground's colors (lea)");
  instruction(main, 0x47e2, [0x5346, 0x6402, 0x4246, 0xe74e], 'a color set, 8 bytes from set 1 (lsl.w #3)');
  instruction(main, 0x47ec, [0x0240, 0x0c00, 0xef58], "the field's low bits (andi.w #$c00, rol.w #7)");
  const table = high * 0x10000 + low;
  return (set, scene) => word(main, table + 8 * Math.max(0, set - 1) + 2 * (scene & 3));
}

/**
 * The ground's alternate shade of palette word `rgb555`: each 5-bit component 3 more, at most 31 (M 0x470C to 0x474A, its
 * blue's step at M 0x4714).
 */
export function alternate(main: Uint8Array): (rgb555: number) => number {
  const [step] = instruction(main, 0x4714, [0x0641, null], "a shade's step (addi.w)");
  return (rgb555) => [10, 5, 0].reduce((c, shift) => c | (Math.min(31, ((rgb555 >> shift) & 31) + step) << shift), 0);
}

/**
 * The ground's material along the course, the same each side as the program draws it: each record's ground color and
 * its alternate shade by the shared rule, where it changes, from its record's start; a record whose two colors differ
 * in material, or of `WATER` (no water lies beside TOP SPEED's roads), stops the conversion.
 */
export function groundAlong(main: Uint8Array, records: readonly CourseRecord[]): GroundAlong {
  const color = groundColor(main);
  const shade = alternate(main);
  const runs: [number, Material][] = [];
  records.forEach((r, i) => {
    const c = color(colorSet(main, r.stage, r.section), r.record.scene);
    const [a, b] = [c, shade(c)].map((w) => groundMaterial(rgb555Of(w)));
    if (a !== b) throw romDiffers(`TOP SPEED's ground color 0x${c.toString(16)}'s shades differ in material`);
    if (a === 'WATER') throw romDiffers(`TOP SPEED's ground color 0x${c.toString(16)} reads as water`);
    if (runs.at(-1)?.[1] !== a) runs.push([i * RECORD_METRES, a!]);
  });
  return { left: runs, right: runs };
}

/** A road not taken: from a fork's branch's start, record `from`, the other branch's half beside the course's. */
export interface RoadNotTaken {
  readonly from: number;
  /** The other branch: its stage and its section. */
  readonly stage: number;
  readonly section: number;
  /** The side of the course's P it lies on, and its lanes there, out from its own P. */
  readonly beside: 'left' | 'right';
  readonly lanes: number;
  /** Its steps, each `step` metres, and its P's lateral, metres right of the course's, `k` steps from its start. */
  readonly steps: number;
  readonly step: number;
  readonly offset: (k: number) => number;
}

/**
 * Each road not taken along a course of sections `sections` (`courseSections`): at each fork the other branch's half,
 * which the main program draws from the fork's branch's start along the other branch's own curves (M 0x5B64, 0x5C34)
 * and slides outward by the camera's advance since then over 32 pixels on every line (M 0x5F46 to 0x5F8A), a pixel the
 * nearest line's `pixelMetres`, over 0x2800 positions (M 0x5F62), and then draws no more (M 0x5F92 to 0x6034). Its P
 * lies where the other branch's line lies from the course's, the two from the fork's end on the same heading, plus the
 * slide; its lanes its first record's mask's on its side; its steps the heights' `stepPositions`. As the slide ends
 * the main program sets the word the sub program frees the other branch's things by (M 0x5FCA).
 */
export function roadsNotTaken(
  main: Uint8Array,
  stages: readonly TopSpeedStage[],
  sections: readonly {
    readonly stage: number;
    readonly section: number;
    readonly records: readonly TopSpeedRecord[];
  }[],
  pixelMetres: number,
  stepPositions: number,
): RoadNotTaken[] {
  const [length] = instruction(main, 0x5f62, [0x0cb9, 0x0000, null, 0x0040, 0x105e], "the slide's positions (cmpi.l)");
  instruction(main, 0x5f74, [0xea80, 0x0839, 0x0000, 0x0040, 0x104c], 'a pixel 32 positions, by the side (asr.l #5)');
  instruction(main, 0x5fca, [0x33fc, 0x0009, 0x0040, 0x10e4], "the slide's end, told the sub program (move.w)");
  const steps = length / stepPositions;
  const step = stepPositions * POSITION_METRES;
  const out: RoadNotTaken[] = [];
  let record = 0;
  sections.forEach((s, k) => {
    record += s.records.length;
    const next = sections[k + 1];
    if (s.section === GOAL || !next) return;
    const [left, right] = stages[s.stage]!.sections[s.section]!.next;
    if (left === right) return;
    const other = next.section === left ? right : left;
    const beside = next.section === left ? 'right' : 'left';
    const otherRecords = stages[s.stage]!.sections[other]!.records;
    const mask = otherRecords[0]!.mask;
    const lanes = (beside === 'right' ? (mask >> 1) & 7 : (mask >> 4) & 7).toString(2).replace(/0/g, '').length;
    // Each line's point `d` metres on from the fork's end, its heading turned as its pieces turn, left positive.
    const line = (records: readonly TopSpeedRecord[]) => {
      const pieces = coursePieces(main, records);
      return (d: number) => {
        let [x, y, h, u] = [0, 0, 0, 0];
        for (const p of pieces)
          for (let t = 0; t < p.length && u < d; t = Math.min(p.length, t + 0.05)) {
            const dt = Math.min(0.05, p.length - t, d - u);
            h += (p.turn / p.length) * (dt / 2);
            [x, y] = [x + Math.cos(h) * dt, y + Math.sin(h) * dt];
            h += (p.turn / p.length) * (dt / 2);
            u += dt;
          }
        return { x, y, h };
      };
    };
    const [course, them] = [line(next.records), line(otherRecords)];
    const sign = beside === 'right' ? 1 : -1;
    out.push({
      from: record,
      stage: s.stage,
      section: other,
      beside,
      lanes,
      steps,
      step,
      offset: (j) => {
        const d = Math.min(j, steps) * step;
        const [p, q] = [course(d), them(d)];
        // Right of the course's line: against its left normal.
        const apart = -((q.x - p.x) * -Math.sin(p.h) + (q.y - p.y) * Math.cos(p.h));
        return apart + ((sign * (Math.min(j, steps) * stepPositions)) / 32) * pixelMetres;
      },
    });
  });
  return out;
}
