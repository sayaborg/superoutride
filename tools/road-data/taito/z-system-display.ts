/**
 * Taito's Z system's display, as CHASE H.Q. and CONTINENTAL CIRCUS draw on it
 * ([Original road data](../../../docs/original-road-data.md#the-hardwares-constants)): its frames a second and its
 * pixel's aspect.
 */

/** The video's frames a second: a 26.686 MHz clock over 4, 424 clocks a line, 262 lines a frame (60.056). */
export const FRAMES_A_SECOND = 26_686_000 / 4 / 424 / 262;

/** A pixel's height over its width: the 320 × 240 pixels it shows (MAME's description) at 4:3, square. */
export const PIXEL_ASPECT = 1;
