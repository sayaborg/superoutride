/**
 * The arbitrary constants the originals' conversions share, each with its reason
 * ([Original road data](../../docs/original-road-data.md#shared-constants)).
 */

/** K's grade limit: no piece of the grades' rule and no ramp that parts the crossings is steeper. */
export const GRADE_LIMIT = 0.25;
/** Passages at least this far apart along a road may cross, metres. */
export const PASSAGES_APART = 200;
/** A passage runs on over gaps of up to this many cells. */
export const PASSAGE_GAP = 3;
/** The height two overlapping passages are kept apart, metres (K, 2026-10-27). */
export const CLEARANCE = 2;
/** A cut keeps this far from a gate, metres. */
export const GATE_ROOM = 2;
/**
 * The ground between two roads is their asphalt where it is no wider than this, metres, and the ground's beyond: the
 * material changes metres away from where the lanes' rule does.
 */
export const OPEN = 0.5;
/**
 * Each kind's general grid (K, 2026-10-25): cars one a row, alternately at the two lanes' centres from the left, 12 m
 * apart; bikes four a row, two in each lane a quarter of its width either side of its centre, the rows 3 m apart.
 */
export const GRID_FORMS = Object.freeze({ car: { row: 1, spacing: 12 }, bike: { row: 4, spacing: 3 } });
