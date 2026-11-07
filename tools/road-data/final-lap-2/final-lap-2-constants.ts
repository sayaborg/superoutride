/**
 * FINAL LAP 2's own constants and fixed rules, each with its reason
 * ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-constants)).
 */

/** The conversion's course ids, by the programs' course numbers. */
export const COURSE_IDS = ['final-lap-2-japan', 'final-lap-2-monaco', 'final-lap-2-italy', 'final-lap-2-usa'];
/**
 * The courses with a model and their models (K, 2026-11-08): JAPAN on Suzuka from 1985 to 1987, MONACO on Monaco from
 * 1986 to 1996 and ITALY on Monza from 1976 to 1993, by the programs' course numbers.
 */
export const MODELS: ReadonlyMap<number, string> = new Map([
  [0, 'suzuka_1985_1987'],
  [1, 'monaco_1986_1996'],
  [2, 'monza_1976_1993'],
]);
/** USA's course number: an oval raised from its own table (K, 2026-11-04). */
export const USA = 3;
/** A Formula One car's widest in 1990, metres: its own car's width at its depth (K, 2026-11-04). */
export const CAR_WIDTH = 2.15;
/** Its own car's colored columns seen from behind: big sprites 0 and 1, columns 5 to 61 (research). */
export const CAR_COLUMNS = 57;
/**
 * The back layer's tile rows as the master's 0x2E1E lays face 0: its picture's 18 rows from row 60 (60 to 63, then 0 to
 * 13), above the horizon, then the ground's 14 (14 to 27), one tile each, below it (K, 2026-11-04).
 */
export const BACK_ROWS = Object.freeze({ first: 60, picture: 18, ground: 14 });
/**
 * The back layer's picture, 512 pixels across, three times a turn (1536 pixels): the whole number of times nearest the
 * original's own turn of it (3.48 on USA), least scaled; its clouds face nothing (K, 2026-11-04).
 */
export const BACK_REPEATS = 3;
/** The front band's tile rows, face 1's 8 to 15, as the slave's 0x2030 writes a column of them. */
export const FRONT_ROWS = Object.freeze({ first: 8, count: 8 });
/**
 * The front layer's columns a turn, 1536 pixels, the back's: K's least scaling, not the original's own turn of its
 * columns (USA's 334) (K, 2026-11-04).
 */
export const FRONT_COLUMNS = 192;
