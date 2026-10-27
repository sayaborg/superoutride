/**
 * TURBO OUTRUN's own constants and fixed rules, each with its reason
 * ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-constants)): what its ROMs do not hold,
 * or hold only in its encrypted program, read from it decrypted locally. What they hold is read where it is used.
 */
import type { Mound } from './jump-mound.js';

/**
 * The 959 at GO, road units right of the car (0xC238 places it on the left road, 0xC28E, at the car's depth, 0xC27C
 * and 0x11D28, its x −0x80 at 0xC294 and 0xC29C): the instructions are encrypted, read from the program decrypted
 * locally ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-programs)).
 */
export const RIVAL_X = -0x80;
/**
 * A dip ([Original road data](../../docs/original-road-data.md#profile), Jumps and dips): K's, its 2 m face straight
 * down at 5 % to its bottom 0.1 m deep, back up in 2 m (K, 2026-10-26).
 */
export const DIP: Mound = Object.freeze({ face: 2, root: -0.05, crest: -0.05 });

/**
 * Collision class 2 throws the car (its handler at 0x742A, in the decrypted program alone): here a dip across the
 * road, not an object.
 */
export const DIP_CLASS = 2;
/** The strips that loop, by what they show, by size list (K, 2026-10-24): the fog (0x2603A) and the flower beds (0x2743A). */
export const LOOPING_STRIPS: ReadonlySet<number> = new Set([0x2603a, 0x2743a]);
/**
 * The far strip approaches at half the rate, so it stands still twice as far and twice as large as drawn, a pixel 4
 * road units: its edge 32 of its pixels from P as the original's is from the screen's middle, reaching away from it,
 * and its base point `farUp` road units up, as OUTRUN's clouds.
 */
export const FAR_UNITS = 4;
export const FAR_EDGE = 32;
