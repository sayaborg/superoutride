/**
 * FINAL LAP 2's own constants and fixed rules, each with its reason
 * ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-constants)).
 */

/** The conversion's course ids, by the programs' course numbers. */
export const COURSE_IDS = ['final-lap-2-japan', 'final-lap-2-monaco', 'final-lap-2-italy', 'final-lap-2-usa'];
/**
 * The courses with a model and their models (K, 2026-11-04): JAPAN on Suzuka in 1990, MONACO on Monaco in 1990 and ITALY
 * on Monza in 1990, by the programs' course numbers.
 */
export const MODELS: ReadonlyMap<number, string> = new Map([
  [0, 'suzuka_1990'],
  [1, 'monaco_1990'],
  [2, 'monza_1990'],
]);
/** USA's course number: an oval raised from its own table (K, 2026-11-04). */
export const USA = 3;
/** A Formula One car's widest in 1990, metres: its own car's width at its depth (K, 2026-11-04). */
export const CAR_WIDTH = 2.15;
/** Its own car's colored columns seen from behind: big sprites 0 and 1, columns 5 to 61 (research). */
export const CAR_COLUMNS = 57;
/** The sky until the background is laid (NM-11): a plain blue, RGB555. */
export const PLAIN_SKY = 0x2a7f;
