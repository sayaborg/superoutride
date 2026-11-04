/**
 * The Namco Pole Position hardware's colors ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-hardware)):
 * its palette PROMs' colors and its road's palettes.
 */
import { romDiffers } from '../shared/conversion-errors.js';

/** A palette PROM's four bits' weights in a channel's 8 bits, the least significant first (its resistors). */
const BIT_WEIGHTS = [0x0e, 0x1f, 0x43, 0x8f] as const;
/** The palette's color a road pixel takes: the road PROM's entry over this base. */
const ROAD_BASE = 0x40;
/** A road palette's entries: one a step of the road ROM's lateral count, 0 to 63. */
export const ROAD_PALETTE_ENTRIES = 64;

/** A channel's 8 bits from a palette PROM's entry. */
const channel = (nibble: number) => BIT_WEIGHTS.reduce((sum, weight, bit) => sum + ((nibble >> bit) & 1) * weight, 0);

/** The palette's color `index` as RGB555, from the red, green and blue PROMs. */
export function paletteColor(red: Uint8Array, green: Uint8Array, blue: Uint8Array, index: number): number {
  if (!(index >= 0 && index < red.length)) throw romDiffers(`The palette has no color ${index}`);
  const five = (nibble: number) => Math.round((channel(nibble & 15) * 31) / 255);
  return (five(red[index]!) << 10) | (five(green[index]!) << 5) | five(blue[index]!);
}

/** Road palette `palette`'s colors as RGB555, one a step of the road ROM's lateral count. */
export function roadPalette(
  road: Uint8Array,
  palettes: { readonly red: Uint8Array; readonly green: Uint8Array; readonly blue: Uint8Array },
  palette: number,
): number[] {
  const at = palette * ROAD_PALETTE_ENTRIES;
  if (!(at >= 0 && at + ROAD_PALETTE_ENTRIES <= road.length))
    throw romDiffers(`The road PROM has no palette ${palette}`);
  return Array.from({ length: ROAD_PALETTE_ENTRIES }, (_, u) =>
    paletteColor(palettes.red, palettes.green, palettes.blue, ROAD_BASE + (road[at + u]! & 15)),
  );
}
