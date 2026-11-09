/**
 * A palette word of Taito's Z system as this repository's color ([Original road data](../../../docs/original-road-data.md#an-originals-modules)):
 * its palette chip (TC0110PCR) holds a color in 15 bits, in the order its board wires it, and this repository's RGB555
 * holds red in bits 10–14 and blue in 0–4; each board's reading puts red and blue in their places, and nothing past it
 * reads the chip's order.
 */

/** CHASE H.Q.'s and TOP SPEED's boards: red in bits 0–4, green in 5–9 and blue in 10–14 (xBGR555). */
export const rgb555Of = (word: number): number => ((word & 0x1f) << 10) | (word & 0x3e0) | ((word >> 10) & 0x1f);

/** CONTINENTAL CIRCUS's board: red in bits 10–14, green in 5–9 and blue in 0–4 (xRGB555), as this repository's. */
export const xrgb555Of = (word: number): number => word & 0x7fff;
