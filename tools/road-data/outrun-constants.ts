/**
 * OUTRUN's own constants and fixed rules, each with its reason
 * ([OUTRUN road data](../../docs/outrun-road-data.md#outruns-constants)): the program's values its research list leaves
 * written, each with where the program holds it, and the conversion's choices. What the ROMs hold otherwise is read
 * where it is used.
 */

/** An object appears at the road's first line; the first of a tick's two turns a 1/64 line nearer (0x3C76, 0x3CA2). */
export const APPEARS = Object.freeze([0x10400, 0x10000]);
/** An object vanishes, passing the car, where its depth reaches this line (each routine's `cmpi.w #$200, d0`, 0x4648). */
export const PASSES = 0x200;
/** Drawing 2 (the clouds) approaches at half the rate (0x4144). */
export const HALF_RATE_DRAWING = 2;
/** A goal stretch's road position the camera stops at (0xA15E to 0xA1EA: braking from 0x163, the scene from 0x18E). */
export const GOAL_STOP = 0x191;
/** Where a last stage entered from a fork's left side turns its centre lane back to b for its goal, positions. */
export const GOAL_CENTRE = 1946;
