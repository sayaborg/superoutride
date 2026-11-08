/**
 * Taito's Z system's display, as CHASE H.Q. and CONTINENTAL CIRCUS draw on it
 * ([Original road data](../../../docs/original-road-data.md#the-hardwares-constants)): its frames a second.
 */

/** The video's frames a second: a 26.686 MHz clock over 4, 424 clocks a line, 262 lines a frame (60.056). */
export const FRAMES_A_SECOND = 26_686_000 / 4 / 424 / 262;
