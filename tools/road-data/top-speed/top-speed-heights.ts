/**
 * TOP SPEED's heights ([Original road data](../../../docs/original-road-data.md#profile-from-a-rise-table)): the
 * height its sub program gives a car, its records' grades added each record and risen through each record a step at a
 * time, as a rise table's grades, found by the instructions that read it, and its height unit's length.
 */
import { instruction } from '../cpu/program-words.js';
import { RECORD_UNITS } from '../taito/course-records.js';
import { POSITION_METRES } from './top-speed-road.js';

/** The road positions a step, at which the sub program's height rises (S 0x594E to 0x5954: the position's bits 8 to 12). */
export const STEP_POSITIONS = 0x100;
export const STEP_METRES = STEP_POSITIONS * POSITION_METRES;
/**
 * A height unit, metres: the main program's pitch (M 0x75C8) read back through its eye, whose focal length is 266
 * pixels, as the study found it (K, 2026-11-05: up is across).
 */
export const HEIGHT_METRES = 2.884e-3;

/**
 * The height units a step a unit of grade: the sub program's height is its record's base, the grades before it each a
 * record's worth, and its grade × 8 a step of the record (S 0x5942 to 0x595E: `asl.w #3`, the step, `muls.w`).
 */
function unitsAGrade(sub: Uint8Array) {
  instruction(sub, 0x5942, [0x302b, 0x0026, 0x1030, 0x0001, 0x4880, 0xe740], "a record's grade by 8 (asl.w #3)");
  instruction(sub, 0x594e, [0x222b, 0x0000, 0xe041, 0x0241, 0x001f, 0xc1c1], "a record's step (asr.w #8, andi.w)");
  return 8;
}

/**
 * The grades of a road whose records' grades are `grades` (their byte 1, signed), a grade a step through the steps of
 * every record: each step's rise its record's grade's.
 */
export function stepGrades(sub: Uint8Array, grades: readonly number[]): number[] {
  const scale = (unitsAGrade(sub) * HEIGHT_METRES) / STEP_METRES;
  const steps = RECORD_UNITS / STEP_POSITIONS;
  return grades.flatMap((g) => Array.from({ length: steps }, () => g * scale));
}

/** A rise table's resolution for TOP SPEED: a grade's unit, its height units a step over a step. */
export const gradeResolution = (sub: Uint8Array) => (unitsAGrade(sub) * HEIGHT_METRES) / STEP_METRES;
