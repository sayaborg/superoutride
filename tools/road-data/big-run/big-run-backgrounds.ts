/**
 * BIG RUN's skies ([BIG RUN road data](../../../docs/big-run-road-data.md#its-skies)): the JALECO board's
 * (`jaleco/ms1-skies`), read where its programs hold them.
 */
import type { BoardSkies } from '../jaleco/ms1-skies.js';

/** The stages. */
export const STAGES = 6;

/**
 * Where BIG RUN's programs read its skies: plane 0's scenes from M 0x9274 (their records' size at 0x92F6), plane 1's
 * from 0x8E20 (0x8EC8); the planes' tile words at 0x90000 and 0x94000 (MAME's description); each plane turning 8 and
 * 12 pixels a degree, as the program's turn records give them a degree of the road's arcs (M 0x7358, each record's +8
 * the back's and +6 the front's), 2.8125 pictures each; the sky's rows from the second road CPU's table (R2 0xEB8).
 */
export const BIG_RUN_SKIES: BoardSkies = Object.freeze({
  scenes: Object.freeze([0x9274, 0x8e20] as const),
  sizes: Object.freeze([0x92f6, 0x8ec8] as const),
  planeRam: Object.freeze([0x90000, 0x94000] as const),
  turn: Object.freeze([2880, 4320] as const),
  rows: 0xeb8,
});
