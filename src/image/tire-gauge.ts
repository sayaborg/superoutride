import { tachometerRamp, type TachometerColor } from './tachometer.js';

/**
 * The tire gauge: the player vehicle's axles seen from above over 2 by 3 text tiles (16 by 24 pixels), the front tires
 * in the top row's tiles and the rear in the bottom row's, so each axle's tires take the palette of its own state. The
 * HUD chooses the palettes and the HUD tiles command writes the patterns and palettes, so both read this one rule.
 */
export const TIRE_GAUGE = Object.freeze({ columns: 2, rows: 3 });
const TILE = 8;
const WIDTH = TIRE_GAUGE.columns * TILE;
const HEIGHT = TIRE_GAUGE.rows * TILE;

/** The gauge's palette slots: its black outline, the tires and the lines between them. */
const OUTLINE = 1;
const TIRE = 2;
const LINE = 3;
/** A drawn rectangle, `[x0, y0, x1, y1]` inclusive, and its slot. */
type Part = readonly [number, number, number, number, typeof TIRE | typeof LINE];
/**
 * The author's figures, by the vehicle's form: tires 4 by 6 pixels and lines 2 pixels wide. A car is an H, each axle a
 * line between its two tires and one line joining the axles; a bike its two tires joined by one line.
 */
const FIGURES: Readonly<Record<'car' | 'bike', readonly Part[]>> = Object.freeze({
  car: [
    [1, 1, 4, 6, TIRE],
    [11, 1, 14, 6, TIRE],
    [1, 17, 4, 22, TIRE],
    [11, 17, 14, 22, TIRE],
    [6, 3, 9, 4, LINE],
    [6, 19, 9, 20, LINE],
    [7, 5, 8, 18, LINE],
  ],
  bike: [
    [6, 1, 9, 6, TIRE],
    [6, 17, 9, 22, TIRE],
    [7, 7, 8, 16, LINE],
  ],
});
export type TireGaugeForm = keyof typeof FIGURES;

/** A figure's pixels: its parts' slots, and the outline on every other pixel beside one of them, diagonals included. */
function figurePixels(parts: readonly Part[]): number[] {
  const pixels = Array<number>(WIDTH * HEIGHT).fill(0);
  for (const [x0, y0, x1, y1, slot] of parts)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pixels[y * WIDTH + x] = slot;
  return pixels.map((slot, i) => {
    if (slot) return slot;
    const x = i % WIDTH,
      y = Math.floor(i / WIDTH);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const u = x + dx,
          v = y + dy;
        if (u >= 0 && u < WIDTH && v >= 0 && v < HEIGHT && pixels[v * WIDTH + u]) return OUTLINE;
      }
    return 0;
  });
}

/**
 * Each form's 6 patterns, row by row from the top left, 64 palette slots each: 1 the outline, 2 the tires and 3 the
 * lines. A tile holds one palette, so the front tires lie in the top row alone, the rear in the bottom row alone and
 * the middle row holds only lines.
 */
export const TIRE_GAUGE_PATTERNS: Readonly<Record<TireGaugeForm, readonly (readonly number[])[]>> = Object.freeze(
  Object.fromEntries(
    Object.entries(FIGURES).map(([form, parts]) => {
      const pixels = figurePixels(parts);
      pixels.forEach((slot, i) => {
        if (slot === TIRE && Math.floor(i / WIDTH / TILE) === 1) throw new Error('A tire lies in the middle row');
      });
      const tiles = Array.from({ length: TIRE_GAUGE.columns * TIRE_GAUGE.rows }, (_, k) =>
        Object.freeze(
          Array.from({ length: TILE * TILE }, (_, i) => {
            const x = (k % TIRE_GAUGE.columns) * TILE + (i % TILE),
              y = Math.floor(k / TIRE_GAUGE.columns) * TILE + Math.floor(i / TILE);
            return pixels[y * WIDTH + x]!;
          }),
        ),
      );
      return [form, Object.freeze(tiles)];
    }),
  ) as Record<TireGaugeForm, readonly (readonly number[])[]>,
);

/** RGB555 channels, red first. */
const channels = (color: number) => [(color >> 10) & 31, (color >> 5) & 31, color & 31];
/** The middle of a tachometer color's lit ramp, `L2`. */
const rampColor = (color: TachometerColor) => tachometerRamp(color)[2]!;
/**
 * The colors from `from` to `to`, both included, in RGB555 steps: as many steps as the channel that differs most
 * differs, so that channel changes by one each step and the others by their nearest share.
 */
function steps(from: number, to: number): number[] {
  const a = channels(from),
    b = channels(to);
  const count = Math.max(...a.map((value, c) => Math.abs(b[c]! - value)));
  return Array.from({ length: count + 1 }, (_, k) => {
    const [r, g, bl] = a.map((value, c) => Math.round(value + ((b[c]! - value) * k) / count));
    return (r! << 10) | (g! << 5) | bl!;
  });
}
const GREEN_TO_YELLOW = steps(rampColor('GREEN'), rampColor('YELLOW'));
const YELLOW_TO_RED = steps(rampColor('YELLOW'), rampColor('RED'));
/** The step at which the tires are yellow, the tire's knee. */
const KNEE_STEP = GREEN_TO_YELLOW.length - 1;
const RED_STEPS = YELLOW_TO_RED.length - 1;
/**
 * The tire colors in order, one palette each: the tachometer's green, yellow and red (each its ramp's `L2`), and every
 * RGB555 step from green to yellow and from yellow to red.
 */
export const TIRE_GAUGE_COLORS: readonly number[] = Object.freeze([...GREEN_TO_YELLOW, ...YELLOW_TO_RED.slice(1)]);

/**
 * The step of `TIRE_GAUGE_COLORS` an axle's tires show at `utilization` of their friction ellipse: green at 0, yellow
 * at the tire's `knee` and red at 1, the nearest step of green to yellow at `utilization / knee` and of yellow to red
 * at `(utilization - knee) / (1 - knee)` beyond it.
 */
export function tireGaugeStep(utilization: number, knee: number): number {
  const u = Math.min(1, Math.max(0, utilization));
  return u <= knee ? Math.round((u / knee) * KNEE_STEP) : KNEE_STEP + Math.round(((u - knee) / (1 - knee)) * RED_STEPS);
}
