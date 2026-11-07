/**
 * The course records of Taito's boards that hold their courses in one form, CHASE H.Q.'s and TOP SPEED's ([Original
 * road data](../../../docs/original-road-data.md#an-originals-modules)): a section of 32 records of 8 bytes, each record
 * 0x2000 road units long, and each section's next for the left and for the right, a byte each. What a record's bytes
 * mean is each original's.
 */
import { u8 } from '../cpu/program-words.js';

/** A record's bytes, a section's records and the road units a record spans. */
export const RECORD_BYTES = 8;
export const SECTION_RECORDS = 32;
export const RECORD_UNITS = 0x2000;

/** A record's 8 bytes, unsigned, in their order. */
export type RawRecord = readonly number[];

/** The section's 32 records from `at` in program `p`. */
export function sectionRecords(p: Uint8Array, at: number): RawRecord[] {
  return Array.from({ length: SECTION_RECORDS }, (_, k) =>
    Array.from({ length: RECORD_BYTES }, (_, i) => u8(p, at + k * RECORD_BYTES + i)),
  );
}

/** A section's next for the left and for the right, the two bytes at `at` in program `p`. */
export const nextSections = (p: Uint8Array, at: number): readonly [number, number] => [u8(p, at), u8(p, at + 1)];
