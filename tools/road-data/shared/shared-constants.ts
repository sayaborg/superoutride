/**
 * The arbitrary constants the originals' conversions share, each with its reason
 * ([Original road data](../../../docs/original-road-data.md#shared-constants)).
 */

/** K's grade limit: no piece of the grades' rule and no ramp that parts the overpasses is steeper. */
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
/** A course's compass bearing at its entry, degrees: an original's ROMs hold no compass direction, so its plan's own. */
export const BEARING = 0;

/**
 * A heading vector table's resolution, radians, as the originals' road paths hold their vectors about 4096 long: a unit
 * and a half of the 4096, where their runs stop growing fewer (SUPER HANG-ON's AFRICA has 167 runs at one unit, 142 at
 * 1.5 and 141 at 2; ENDURO RACER 148, 132 and 128).
 */
export const VECTOR_RESOLUTION = 1.5 / 4096;
/** A cell: the whole number of the original's positions nearest this many metres (OUTRUN's 5, ENDURO RACER's 8). */
export const CELL_METRES = 10;
/** The read road's distance steps: this many of the original's rows apart on the reading camera's level road. */
export const DISTANCE_STEP_ROWS = 0.2;
/** A hill frame: one where the original's road lies more than this many rows from its level road. */
export const HILL_ROWS = 1;
/**
 * The originals' rows are whole steps of 1/8192 row ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen),
 * Measure, Row steps), and the measure reads them on those steps: what lies below a step moves none of its choices. A
 * row more than a thousandth of a step from one is not an original's: the reading stops.
 */
export const ROW_STEPS = 8192;
export const ROW_STEP_SLACK = 1e-3;
/** A piece is the fewest vertical curves within this many rows of the best look, the looks rounded to `LOOK_PLACES`. */
export const PVI_ROWS = 0.5;
/** The places a look is rounded to before the pieces are compared: thousandths of a row. */
export const LOOK_PLACES = 3;
/**
 * Two written micrometres, metres: two stations reckoned apart and each written to the micrometre lie within this when
 * they are one (a station at a joint, a repeated sprite's station), and two curves that meet are written this much
 * shorter, so that they stay apart.
 */
export const WRITTEN_SLACK = 2e-6;
/** An offset within this of a Section's end, metres, is written at its end. */
export const END_SNAP = 1e-5;
