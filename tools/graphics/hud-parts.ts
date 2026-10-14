import type { ArrowSource, LampSource, SegmentDigitsSource } from './hud-design-sources.js';
import {
  TACHOMETER_COLORS,
  TACHOMETER_PATTERNS,
  tachometerRamp,
  type TachometerColor,
} from '../../src/image/tachometer.js';
import { HUD_TILE_NAMES, TEXT_TILE_SIZE } from '../../src/image/text-tiles.js';
import { TIRE_GAUGE_COLORS, TIRE_GAUGE_PATTERNS } from '../../src/image/tire-gauge.js';

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
 * digits and the road arrow as their sources give them, the tachometer's and the tire gauge's by their rules and the
 * meters drawn.
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
  for (const [form, tiles] of Object.entries(TIRE_GAUGE_PATTERNS))
    tiles.forEach((tile, k) => drawn.set(`TIRES_${form.toUpperCase()}_${k}`, tile));
  if (drawn.size !== HUD_TILE_NAMES.length || HUD_TILE_NAMES.some((name) => !drawn.has(name)))
    throw new Error('The HUD part tiles differ from the text tiles order');
  return HUD_TILE_NAMES.map((name) => drawn.get(name)!);
}

/**
 * The tachometer's palettes by name: one color in slots 1 to 7 (`L0..L4`, `U0`, `U1`), and where two meet the second
 * in slots 8 to 14.
 */
export function drawTachometerPalettes(): Map<string, readonly number[]> {
  const palette = (first: TachometerColor, second?: TachometerColor) => {
    const colors = [...tachometerRamp(first), ...(second ? tachometerRamp(second) : [])];
    return [0, ...colors, ...Array<number>(15 - colors.length).fill(0)];
  };
  const [green, yellow, red] = TACHOMETER_COLORS;
  return new Map([
    ...TACHOMETER_COLORS.map((color) => [`TACH_${color}`, palette(color)] as const),
    [`TACH_${green}_${yellow}`, palette(green, yellow)],
    [`TACH_${yellow}_${red}`, palette(yellow, red)],
  ]);
}

/**
 * The tire gauge's palettes by name, each slot 1 the `outline`, 2 the tires and 3 the `line`: `TIRES_k` with the k-th
 * tire color, and `TIRES_AIR` with the `air` grey of tires without load.
 */
export function drawTireGaugePalettes(outline: number, line: number, air: number): Map<string, readonly number[]> {
  const palette = (tire: number) => [0, outline, tire, line, ...Array<number>(12).fill(0)];
  return new Map([
    ...TIRE_GAUGE_COLORS.map((color, k) => [`TIRES_${k}`, palette(color)] as const),
    ['TIRES_AIR', palette(air)],
  ]);
}
