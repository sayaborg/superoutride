/**
 * The Sega 16-bit hardware's display as the originals draw on it ([Original road data](../../../docs/original-road-data.md#original-road-data)):
 * the values of its screen that the shared rules take from each original.
 */

/** The video's frames a second: the hardware's, whatever a program's tick. */
export const FRAMES_A_SECOND = 60;
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
/**
 * The layers at the road's heading 0, from the program's scrolls there, `front` and `back`: the screen's middle shows a
 * layer's map pixel `layerMiddle` − its scroll (the hardware's display offset), and the back layer's 1536 pixels are the
 * map's last (from `FRONT_WIDTH` − `BACK_WIDTH`), so the back's pixel `middle` is at the middle and the front's pixel f
 * lies over the back's 0.75f + `overlap`.
 */
export function layerMiddles(layerMiddle: number, front: number, back: number) {
  const start = FRONT_WIDTH - BACK_WIDTH;
  const middle = layerMiddle - back - start;
  return {
    middle: ((middle % BACK_WIDTH) + BACK_WIDTH) % BACK_WIDTH,
    overlap: layerMiddle / 4 - start - (back - 0.75 * front),
  };
}
