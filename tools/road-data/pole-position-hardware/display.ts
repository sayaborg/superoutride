/**
 * The Namco Pole Position hardware's display as POLE POSITION II draws on it
 * ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-hardware)): its clock and
 * its screen.
 */

/** The video's frames a second: a 24.576 MHz clock over 4, 384 clocks a line, 264 lines a frame (60.606…). */
export const FRAMES_A_SECOND = 24_576_000 / 4 / 384 / 264;
/** The screen's visible rows and columns: 256 × 224. */
export const SCREEN_ROWS = 224;
export const SCREEN_COLUMNS = 256;
/** Its pixels are 7 wide to 6 tall: 256 × 224 shown at 4:3. Its vertical amounts grow by this. */
export const PIXEL_ASPECT = 6 / 7;
