import type { ArrowSource, LampSource, SegmentDigitsSource } from './hud-design-sources.js';
import { rgba, rgbaToRgb555 } from '../../src/image/rgb555.js';
import { TACHOMETER_COLORS, TACHOMETER_PATTERNS, type TachometerColor } from '../../src/image/tachometer.js';
import { HUD_TILE_NAMES, TEXT_TILE_SIZE } from '../../src/image/text-tiles.js';

/** A meter cell's rows: 4 pixels high, 2 pixels clear above and below. */
const METER_ROWS = [2, 3, 4, 5];

type Pixels = (x: number, y: number) => number;
/** One 8-by-8 pattern from a function of its pixels. */
const pattern = (pixel: Pixels) =>
  Array.from({ length: TEXT_TILE_SIZE * TEXT_TILE_SIZE }, (_, i) =>
    pixel(i % TEXT_TILE_SIZE, Math.floor(i / TEXT_TILE_SIZE)),
  );

const meter = (filled: (x: number) => number) => pattern((x, y) => (METER_ROWS.includes(y) ? filled(x) : 0));

/**
 * Every HUD part tile's 64 palette indices, in the text tiles' order of `HUD_TILE_NAMES`: the signal lamp, the segment
 * digits and the road arrow as their sources give them, the tachometer's by its rule and the meters drawn.
 */
export function drawHudParts(
  lamp: LampSource,
  segmentDigits: SegmentDigitsSource,
  arrow: ArrowSource,
): (readonly number[])[] {
  const drawn = new Map<string, readonly number[]>();
  ['TL', 'TR', 'BL', 'BR'].forEach((part, k) => drawn.set(`LAMP_${part}`, lamp.tiles[k]!));
  for (let a = 0; a <= TEXT_TILE_SIZE; a++)
    for (let b = a; b <= TEXT_TILE_SIZE; b++)
      drawn.set(
        `METER_${a}_${b}`,
        meter((x) => (x < a ? 1 : x < b ? 4 : 3)),
      );
  for (let k = 1; k < TEXT_TILE_SIZE; k++)
    drawn.set(
      `METER_RIGHT_${k}`,
      meter((x) => (x >= TEXT_TILE_SIZE - k ? 1 : 3)),
    );
  TACHOMETER_PATTERNS.forEach((pattern, n) => drawn.set(`TACH_${n}`, pattern));
  segmentDigits.digits.forEach((tiles, d) =>
    tiles.forEach((tile, k) => drawn.set(`DIGIT_${d < 10 ? d : 'OFF'}_${k}`, tile)),
  );
  arrow.left.forEach((tile, k) => drawn.set(`ARROW_LEFT_${k}`, tile));
  arrow.right.forEach((tile, k) => drawn.set(`ARROW_RIGHT_${k}`, tile));
  if (drawn.size !== HUD_TILE_NAMES.length || HUD_TILE_NAMES.some((name) => !drawn.has(name)))
    throw new Error('The HUD part tiles differ from the text tiles order');
  return HUD_TILE_NAMES.map((name) => drawn.get(name)!);
}

type Rgb = readonly [number, number, number];
/** Each tachometer color's lit ramp `L0..L4`, dark to light, and its unlit `U0` and `U1`, as 8-bit channels. */
const TACHOMETER_RAMPS: Readonly<Record<TachometerColor, readonly Rgb[]>> = Object.freeze({
  GREEN: [
    [16, 112, 40],
    [32, 168, 56],
    [64, 216, 80],
    [136, 244, 136],
    [200, 255, 200],
    [36, 68, 44],
    [28, 56, 36],
  ],
  YELLOW: [
    [160, 104, 0],
    [216, 160, 0],
    [248, 208, 16],
    [255, 240, 112],
    [255, 255, 200],
    [76, 68, 28],
    [64, 56, 20],
  ],
  RED: [
    [128, 16, 8],
    [192, 28, 16],
    [240, 56, 32],
    [255, 136, 112],
    [255, 208, 192],
    [76, 32, 28],
    [64, 24, 20],
  ],
});
const ramp = (color: TachometerColor) => TACHOMETER_RAMPS[color].map(([r, g, b]) => rgbaToRgb555(rgba(r, g, b)));

/**
 * The tachometer's palettes by name: one color in slots 1 to 7 (`L0..L4`, `U0`, `U1`), and where two meet the second
 * in slots 8 to 14.
 */
export function drawTachometerPalettes(): Map<string, readonly number[]> {
  const palette = (first: TachometerColor, second?: TachometerColor) => {
    const colors = [...ramp(first), ...(second ? ramp(second) : [])];
    return [0, ...colors, ...Array<number>(15 - colors.length).fill(0)];
  };
  const [green, yellow, red] = TACHOMETER_COLORS;
  return new Map([
    ...TACHOMETER_COLORS.map((color) => [`TACH_${color}`, palette(color)] as const),
    [`TACH_${green}_${yellow}`, palette(green, yellow)],
    [`TACH_${yellow}_${red}`, palette(yellow, red)],
  ]);
}
