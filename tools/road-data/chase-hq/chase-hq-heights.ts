/**
 * CHASE H.Q.'s heights ([Original road data](../../../docs/original-road-data.md#profile-from-a-rise-table)): the
 * height its sub program adds a step of its road, each record's grade clamped, held over the record's first half and
 * blended to the next record's over its second, as a rise table's grades, each rule found by the instructions that read
 * it, and its height unit's length.
 */
import { instruction, long, shiftCount } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { lateralMetres, POSITION_METRES } from './chase-hq-road.js';

/** The road positions a step, at which the sub program adds height (its window's 0x100-unit steps). */
export const STEP_POSITIONS = 0x100;
/**
 * A height unit, road laterals: the sub program's height scale over its lateral scale at its nearest row, as its eye
 * reads it back (the research note); its length follows the scale across, up being across (K, 2026-11-05).
 */
export const HEIGHT_LATERALS = 2.165;

/**
 * The sub program's rules for a record's heights: the steps a record (S 0x1A46); its grade clamped to `low` to `high`
 * (S 0xC3C to 0xC64, over the window's records); the height units a step a unit of grade, the grade shifted left and
 * right in 16.16 (S 0x1C38, 0x1C3E); and from the blend table (S 0x1C30), 128 bytes a change of grade (S 0x1C2E), the
 * change to the next record's grade clamped to `most` either way (S 0x1C12 to 0x1C2A), the 16.16 height units added at
 * each of a record's steps beside its own grade's.
 */
function rules(sub: Uint8Array) {
  const [steps] = instruction(sub, 0x1a46, [0x3c3c, null], "a record's steps (move.w)");
  instruction(sub, 0xc44, [0x163c, 0x0011], 'the grade above its highest (move.b #$11)');
  const [high] = instruction(sub, 0xc54, [0x10bc, null], 'the highest grade (move.b)');
  instruction(sub, 0xc48, [0x183c, 0xfff6], 'the lowest grade (move.b #$f6)');
  const [low] = instruction(sub, 0xc64, [0x10bc, null], 'the lowest grade (move.b)');
  const [most] = instruction(sub, 0x1c12, [0x0c43, null], "the grade's largest change (cmpi.w)");
  instruction(sub, 0x1c1a, [0x363c, most], "the grade's largest rise (move.w)");
  instruction(sub, 0x1c22, [0x0c43, 0x10000 - most], "the grade's largest fall (cmpi.w)");
  instruction(sub, 0x1c2a, [0x363c, 0x10000 - most], "the grade's largest fall (move.w)");
  const row =
    2 ** shiftCount(instruction(sub, 0x1c2e, [null], 'a change of grade to its row (asl.w)')[0], 0xe140, 'row');
  const [high16, low16] = instruction(sub, 0x1c30, [0x4bf9, null, null], 'the blend table (lea)');
  const blend = high16 * 0x10000 + low16;
  const up = shiftCount(instruction(sub, 0x1c38, [null], "the grade's rise (asl.w)")[0], 0xe140, 'rise');
  const down = shiftCount(instruction(sub, 0x1c3e, [null], "the grade's rise in 16.16 (asr.l)")[0], 0xe080, 'fall');
  if (row !== 4 * steps) throw romDiffers("The blend table's rows are not a record's steps");
  return {
    steps,
    low: (low << 24) >> 24,
    high: (high << 24) >> 24,
    most,
    unitsAGrade: 2 ** (up - down),
    blend: (change: number, step: number) => (long(sub, blend + row * change + 4 * step) | 0) / 65536,
  };
}

/** A height unit, metres, and a step's length. */
export const heightMetres = (main: Uint8Array) => HEIGHT_LATERALS * lateralMetres(main);
export const STEP_METRES = STEP_POSITIONS * POSITION_METRES;

/**
 * The grades of a road whose records' grades are `grades` (their byte 1, signed), a grade a step from its first
 * record's first step through the steps of every record but its last: each record's grade clamped, its height units a
 * step its grade's and the blend table's for its change to the next record's, over a step's length.
 */
export function stepGrades(main: Uint8Array, sub: Uint8Array, grades: readonly number[]): number[] {
  const r = rules(sub);
  const clamp = (g: number) => Math.min(r.high, Math.max(r.low, g));
  const scale = heightMetres(main) / STEP_METRES;
  return grades.slice(0, -1).flatMap((g, i) => {
    const change = Math.min(r.most, Math.max(-r.most, clamp(grades[i + 1]!) - clamp(g)));
    return Array.from({ length: r.steps }, (_, j) => (r.unitsAGrade * clamp(g) + r.blend(change, j)) * scale);
  });
}

/** A rise table's resolution for CHASE H.Q.: a grade's unit, its height units a step over a step. */
export const gradeResolution = (main: Uint8Array, sub: Uint8Array) =>
  (rules(sub).unitsAGrade * heightMetres(main)) / STEP_METRES;
