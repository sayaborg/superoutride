/**
 * TOP SPEED's course tables ([TOP SPEED road data](../../../docs/top-speed-road-data.md#its-course-tables)): its five
 * stages' sections, each its records and its next sections for the left and the right, and each path's goal section,
 * held by its sub program and found by the instructions that read them; its stages' paths and its seven courses; and
 * a road position's length.
 */
import { instruction, u8 } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { metresAPosition } from '../shared/road-position.js';
import { nextSections, sectionRecords, type RawRecord } from '../taito/course-records.js';

/** Its stages, a stage's sections with its goal section last, and the first section its last may be. */
export const STAGES = 5;
export const SECTIONS = 16;
const GOAL = SECTIONS - 1;
const LAST_FIRST = 7;
/** A stage's records and a section's, bytes apart; the goal sections' indices, 8 bytes a stage. */
const STAGE_BYTES = 0x1000;
const SECTION_BYTES = 0x100;
const GOAL_INDICES = 8;
/** Its courses, roads 0 to 6, TOP SPEED A to G (K, 2026-11-05). */
export const COURSES = 7;

/** The frames a second of TOP SPEED's screen, as MAME's description has it, measured on the hardware. */
export const FRAMES_A_SECOND = 60.0532;
/**
 * A road position, metres: a unit of the speed shows 0xA6 / 256 km/h (S 0x5F66) and gains the road a position a tick
 * straight ahead (S 0x638E), its race step running once a frame (S 0x151DE, the sub program's frame interrupt).
 */
export const POSITION_METRES = metresAPosition(0xa6 / 256, 1 / FRAMES_A_SECOND, 1);

/**
 * The own car's top speed without the nitro, positions a tick: flat out in high gear its gear table's target 0x1F3 (S
 * 0x5D1A to 0x5D42, the table from S 0x9B26), on level road 1/128 less (S 0x5D98 to 0x5DDC), the speed settling a unit
 * below it (S 0x5EB2 to 0x5EF6): 494, which shows 320 km/h.
 */
export const TOP_SPEED = 494;
/** A lane's width, metres, the scale across (K, 2026-11-05). */
export const LANE_METRES = 3.6;

/** A record as the programs read it. */
export interface TopSpeedRecord {
  /** Its curve's class, signed (byte 0), and its grade, signed: the height rises 8 × it every 0x100 positions (byte 1). */
  readonly curve: number;
  readonly grade: number;
  /** Its event (byte 2's bits 7–5), its palettes' and sky's field (bits 4–2) and its join (bits 1–0: 3 a fork, 1 and 2 a merge). */
  readonly event: number;
  readonly scene: number;
  readonly join: number;
  /** Its lane mask: bits 6 to 1 lanes a to f, P between c and d (byte 3). */
  readonly mask: number;
  /** Its things beside the road, left and right (bytes 4 and 5), and its centre's or its tunnel's parameter (byte 7). */
  readonly left: number;
  readonly right: number;
  readonly parameter: number;
}

const signed = (b: number) => (b << 24) >> 24;

const recordOf = (b: RawRecord): TopSpeedRecord => ({
  curve: signed(b[0]!),
  grade: signed(b[1]!),
  event: b[2]! >> 5,
  scene: (b[2]! >> 2) & 7,
  join: b[2]! & 3,
  mask: b[3]!,
  left: b[4]!,
  right: b[5]!,
  parameter: b[7]!,
});

/** A section: its records and its next sections, for the left and the right (the right where the lateral is P or more). */
export interface TopSpeedSection {
  readonly records: readonly TopSpeedRecord[];
  readonly next: readonly [number, number];
}

/** A stage: its sections 0 to 14, and the goal section of each path by the path's last section (7 to 14). */
export interface TopSpeedStage {
  readonly sections: readonly TopSpeedSection[];
  readonly goals: ReadonlyMap<number, readonly TopSpeedRecord[]>;
}

const long = ([high, low]: readonly number[]) => high! * 0x10000 + low!;

/**
 * Where the sub program holds its tables: its stage's start copies its sections 0 to 14 from 0xDB9A by the stage
 * rotated to 0x1000 a stage (S 0x528C, 0x528E); a car crossing a section's end takes its next from 0x9BBC, 32 bytes a
 * stage (S 0x584C); entering its path's last section, the camera takes that path's goal section from 0x9CF4, 0x100 bytes
 * an index (S 0x57A6), its index from 0x9C7C by the stage and the last section (S 0x569A).
 */
function tables(sub: Uint8Array) {
  instruction(sub, 0x528c, [0xe858], "a stage's records (ror.w #4)");
  const records = long(instruction(sub, 0x528e, [0x207c, null, null], "the stages' records (movea.l)"));
  const next = long(instruction(sub, 0x584c, [0x227c, null, null], "the sections' next (movea.l)"));
  const goalIndices = long(instruction(sub, 0x569a, [0x207c, null, null], "the goal sections' indices (movea.l)"));
  const goals = long(instruction(sub, 0x57a6, [0x207c, null, null], 'the goal sections (movea.l)'));
  return { records, next, goalIndices, goals };
}

/** The five stages' sections and goal sections. */
export function readStages(sub: Uint8Array): readonly TopSpeedStage[] {
  const t = tables(sub);
  return Array.from({ length: STAGES }, (_, stage) => ({
    sections: Array.from({ length: GOAL }, (_, section) => ({
      records: sectionRecords(sub, t.records + stage * STAGE_BYTES + section * SECTION_BYTES).map(recordOf),
      next: nextSections(sub, t.next + stage * 2 * SECTIONS + section * 2),
    })),
    goals: new Map(
      Array.from({ length: GOAL - LAST_FIRST }, (_, k) => {
        const index = u8(sub, t.goalIndices + stage * GOAL_INDICES + k);
        return [LAST_FIRST + k, sectionRecords(sub, t.goals + index * SECTION_BYTES).map(recordOf)] as const;
      }),
    ),
  }));
}

/**
 * The records past the fifth stage's end, the block after the stages' five: as the camera is in a goal section the sub
 * program copies the next stage's sections in whatever the stage, the stage and 1 by 0x1000 bytes from the stages'
 * records (S 0x57C0 to 0x57E6), and from a goal section's end a car takes section 0 (the table at S 0x9BBC). The
 * run ends at the fifth stage's end (S 0x5B32), so these are seen ahead and not driven.
 */
export function recordsPastGoal(sub: Uint8Array): readonly TopSpeedRecord[] {
  const t = tables(sub);
  const copied = long(instruction(sub, 0x57c0, [0x207c, null, null], "the next stage's records (movea.l)"));
  instruction(sub, 0x57c6, [0x122d, 0xa865, 0x5201], 'the stage and 1 (move.b, addq.b #1)');
  instruction(sub, 0x57da, [0x4881, 0xe859, 0xd081], '0x1000 bytes a stage (ext.w, ror.w #4, add.l)');
  if (copied !== t.records) throw romDiffers("The next stage's records are not the stages'");
  if (nextSections(sub, t.next + (STAGES - 1) * 2 * SECTIONS + 2 * GOAL).some((s) => s !== 0))
    throw romDiffers("The fifth stage's goal section's next is not section 0");
  return sectionRecords(sub, t.records + STAGES * STAGE_BYTES).map(recordOf);
}

/**
 * A stage's paths, numbered from 0 in the order its forks are followed from section 0, left before right (K,
 * 2026-11-05): each the sections it runs through to its last before the goal section.
 */
export function stagePaths(stage: TopSpeedStage): readonly (readonly number[])[] {
  const out: number[][] = [];
  const walk = (path: number[]) => {
    if (path.length > SECTIONS) throw romDiffers('A stage path does not reach its goal section');
    const section = path.at(-1)!;
    const [left, right] = stage.sections[section]!.next;
    if (left === GOAL && right === GOAL) return void out.push(path);
    for (const next of left === right ? [left] : [left, right]) walk([...path, next]);
  };
  walk([0]);
  return out;
}

/**
 * Course `course`'s sections, stage by stage, each its stage, its section (`GOAL` its goal section) and its records:
 * road N takes in each stage the path N modulo the stage's count of paths (K, 2026-11-05).
 */
export function courseSections(stages: readonly TopSpeedStage[], course: number) {
  return stages.flatMap((stage, s) => {
    const paths = stagePaths(stage);
    const path = paths[course % paths.length]!;
    const goal = stage.goals.get(path.at(-1)!);
    if (!goal) throw romDiffers(`Stage ${s + 1}'s path ends at section ${path.at(-1)}, which takes no goal section`);
    return [
      ...path.map((section) => ({ stage: s, section, records: stage.sections[section]!.records })),
      { stage: s, section: GOAL, records: goal },
    ];
  });
}
