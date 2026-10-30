/**
 * The Sega 16-bit boards' display as the originals draw on it ([Original road data](../../../docs/original-road-data.md#original-road-data)):
 * the values of its screen that the shared rules take from each original.
 */

/** The originals' screens' rows: they draw 320 × 224. */
export const SCREEN_ROWS = 224;
/** The original's pixels are 14 wide to 15 tall: 320 × 224 shown at 4:3. Its vertical amounts grow by this. */
export const PIXEL_ASPECT = 15 / 14;
/**
 * Pen 10, the sprite hardware's shadow in a picture drawn with shadows allowed: it darkens what lies behind it, its
 * palette color unused.
 */
export const SHADOW_PEN = 10;
/** The back background layer's width and the front's, pixels around: the front turns 4/3 as many pixels a turn. */
export const BACK_WIDTH = 1536;
export const FRONT_WIDTH = 2048;
