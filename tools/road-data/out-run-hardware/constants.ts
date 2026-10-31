/**
 * The Out Run hardware's constants, each with its reason ([Original road data](../../../docs/original-road-data.md#the-hardwares-constants)):
 * the originals on it share them; what its programs hold is read where it is used.
 */

/** Metres a road-width unit: K's 3.6 m lane over the hardware's lane spacing, 424/3 units (the road ROM's lines). */
export const UNIT_METRES = (3.6 * 3) / 424;
/**
 * The Out Run hardware shows a tile layer's pixel `LAYER_MIDDLE` − its scroll at the screen's middle column, a larger
 * scroll moving the picture right: the hardware's display offset, which no program holds (K's reading of SUPER HANG-ON's
 * front layer at its heading 0, its pixel 1880 at its scroll 8).
 */
export const LAYER_MIDDLE = 1888;
