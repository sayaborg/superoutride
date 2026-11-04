/**
 * The Namco System 2 hardware's display as FINAL LAP 2 draws on it
 * ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-hardware)): its clock and its screen.
 */

/** The video's frames a second: a 6.144 MHz pixel clock, 384 clocks a line, 264 lines a frame (60.606…). */
export const FRAMES_A_SECOND = 6_144_000 / 384 / 264;
/** The screen's visible rows and columns: 288 × 224. */
export const SCREEN_ROWS = 224;
export const SCREEN_COLUMNS = 288;
/** Its pixels are 28 wide to 27 tall: 288 × 224 shown at 4:3. Its vertical amounts grow by this. */
export const PIXEL_ASPECT = 27 / 28;
