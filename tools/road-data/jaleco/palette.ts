/**
 * A palette word of JALECO's driving board (BIG RUN's and CISCO HEAT's, [BIG RUN road data](../../../docs/big-run-road-data.md#its-rom-set))
 * as this repository's color: RRRRGGGGBBBBRGBx, each channel's four high bits and then its low bit, put in RGB555's
 * places (red in bits 10–14, green 5–9, blue 0–4), so that nothing past it reads the board's order.
 */
export function rgb555Of(word: number): number {
  const red = ((word >> 11) & 0x1e) | ((word >> 3) & 1);
  const green = ((word >> 7) & 0x1e) | ((word >> 2) & 1);
  const blue = ((word >> 3) & 0x1e) | ((word >> 1) & 1);
  return (red << 10) | (green << 5) | blue;
}

/** Pens a palette entry holds. */
export const PENS = 16;

/** The RGB555 colors of the palette entry `entry` of the palette words from `at` in `program`: its 16 pens. */
export function paletteEntry(program: Uint8Array, at: number, entry: number): number[] {
  return Array.from({ length: PENS }, (_, pen) => {
    const a = at + 2 * (PENS * entry + pen);
    return rgb555Of((program[a]! << 8) | program[a + 1]!);
  });
}
