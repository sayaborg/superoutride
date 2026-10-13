/**
 * The tachometer: 26 italic bars over a strip of 10 by 3 text tiles (80 by 24 pixels), their lighting to 110 % of
 * redline and their colors, and the tile patterns that draw every state it can reach. The HUD lights it and the HUD
 * tiles command writes its patterns, so both read this one rule.
 */
export const TACHOMETER = Object.freeze({
  bars: 26,
  /** The full scale as a multiple of redline. */
  fullScale: 1.1,
  /** The bars before the first red bar that are yellow. */
  yellowBars: 4,
  columns: 10,
  rows: 3,
});
const TILE = 8;
const HEIGHT = TACHOMETER.rows * TILE;

/** Bar i's height in pixels: `4 + round(20*(i/25)^2)`, a quadratic curve from 4 to 24, standing on the strip's bottom. */
export const tachometerBarHeight = (i: number) => 4 + Math.round(20 * (i / (TACHOMETER.bars - 1)) ** 2);
/**
 * Bar i's two strip columns at height k (0 at the bottom): an italic lean of one pixel per 8 rows, so the last bar's
 * top reaches pixel 79.
 */
const barColumn = (i: number, k: number) => 3 * i + Math.floor(k / TILE);
/** The engine speed at which bar i lights. */
export const tachometerBarRpm = (i: number, redlineRpm: number) =>
  ((i + 1) / TACHOMETER.bars) * TACHOMETER.fullScale * redlineRpm;
/** The number of bars lit at this engine speed. */
export function tachometerLitBars(engineRpm: number, redlineRpm: number): number {
  let lit = 0;
  while (lit < TACHOMETER.bars && engineRpm >= tachometerBarRpm(lit, redlineRpm)) lit++;
  return lit;
}
/** The first bar whose speed reaches the redline, the same for every redline. */
const FIRST_RED = Array.from({ length: TACHOMETER.bars }, (_, i) => tachometerBarRpm(i, 1) >= 1).indexOf(true);

/** The tachometer's colors, in its palettes' order. */
export const TACHOMETER_COLORS = Object.freeze(['GREEN', 'YELLOW', 'RED'] as const);
export type TachometerColor = (typeof TACHOMETER_COLORS)[number];
/**
 * Bar i's color: red from the first bar at or above redline, yellow for the bars just before it and green below; every
 * bar is red while fuel cut is latched.
 */
export function tachometerBarColor(i: number, fuelCut: boolean): TachometerColor {
  if (fuelCut || i >= FIRST_RED) return 'RED';
  return i >= FIRST_RED - TACHOMETER.yellowBars ? 'YELLOW' : 'GREEN';
}

/**
 * A lit pixel's shade in its color's ramp `L0..L4`, dark to light, or an unlit pixel's `U0` (5) or `U1` (6): band
 * `b = min(3, floor(k*4/24))` lights the left column `L[b+1]` and the right `L[b]` (`L3` and `L2` at b = 3), the bar's
 * top pixel is `L4`, and unlit the left column is `U0` and the right `U1`.
 */
function shade(k: number, top: boolean, right: boolean, lit: boolean): number {
  if (!lit) return right ? 6 : 5;
  if (top) return 4;
  const band = Math.min(3, Math.floor((k * 4) / HEIGHT));
  return band === 3 ? (right ? 2 : 3) : right ? band : band + 1;
}

/** A tile that holds part of a bar: its place in the strip and its bars, from the left. */
export interface TachometerTile {
  readonly column: number;
  readonly row: number;
  readonly bars: readonly number[];
}
/** Each strip pixel's bar and height, or null where no bar stands. */
const PIXELS = (() => {
  const pixels: ({ bar: number; k: number; right: boolean } | null)[] = Array(TACHOMETER.columns * TILE * HEIGHT).fill(
    null,
  );
  for (let bar = 0; bar < TACHOMETER.bars; bar++)
    for (let k = 0; k < tachometerBarHeight(bar); k++)
      for (const right of [false, true])
        pixels[(HEIGHT - 1 - k) * TACHOMETER.columns * TILE + barColumn(bar, k) + Number(right)] = { bar, k, right };
  return pixels;
})();
const pixelAt = (tile: { column: number; row: number }, x: number, y: number) =>
  PIXELS[(tile.row * TILE + y) * TACHOMETER.columns * TILE + tile.column * TILE + x];
/** The tiles that hold part of a bar, row by row from the top left. */
export const TACHOMETER_TILES: readonly TachometerTile[] = Object.freeze(
  Array.from({ length: TACHOMETER.rows * TACHOMETER.columns }, (_, t) => {
    const tile = { column: t % TACHOMETER.columns, row: Math.floor(t / TACHOMETER.columns) };
    const bars = new Set<number>();
    for (let i = 0; i < TILE * TILE; i++) {
      const pixel = pixelAt(tile, i % TILE, Math.floor(i / TILE));
      if (pixel) bars.add(pixel.bar);
    }
    return Object.freeze({ ...tile, bars: Object.freeze([...bars].sort((a, b) => a - b)) });
  }).filter(({ bars }) => bars.length > 0),
);

/**
 * A tile's pattern for `split` of its bars in its first color and the rest in its second, and its first `lit` bars lit:
 * slots 1 to 7 the first color's `L0..L4`, `U0` and `U1`, and 8 to 14 the second's.
 */
function tilePattern(tile: TachometerTile, split: number, lit: number): number[] {
  return Array.from({ length: TILE * TILE }, (_, i) => {
    const pixel = pixelAt(tile, i % TILE, Math.floor(i / TILE));
    if (!pixel) return 0;
    const j = tile.bars.indexOf(pixel.bar);
    const top = pixel.k === tachometerBarHeight(pixel.bar) - 1;
    return 1 + (j < split ? 0 : 7) + shade(pixel.k, top, pixel.right, j < lit);
  });
}

/** A tile's state: how many of its bars take its first color and how many are lit, and its colors. */
interface TileState {
  readonly split: number;
  readonly lit: number;
  readonly first: TachometerColor;
  readonly second: TachometerColor | null;
}
/** A tile's state with `litBars` of all the bars lit. */
function tileState(tile: TachometerTile, litBars: number, fuelCut: boolean): TileState {
  const colors = tile.bars.map((bar) => tachometerBarColor(bar, fuelCut));
  const first = colors[0]!;
  const split = colors.filter((color) => color === first).length;
  if (colors.slice(0, split).some((color) => color !== first))
    throw new Error('A tachometer tile holds its colors in order');
  if (new Set(colors).size > 2) throw new Error('A tachometer tile holds at most two colors');
  const lit = Math.min(tile.bars.length, Math.max(0, litBars - tile.bars[0]!));
  return { split, lit, first, second: split < colors.length ? colors[split]! : null };
}

const stateKey = (t: number, split: number, lit: number) => `${t}_${split}_${lit}`;
/**
 * Every pattern the tachometer can show, without duplicates, in order of first use: tile by tile in
 * `TACHOMETER_TILES` order, each without fuel cut and then with it, from no bar lit to every bar, and the pattern of
 * each tile's reachable state.
 */
const { patterns: UNIQUE_PATTERNS, states: STATE_PATTERNS } = (() => {
  const patterns: number[][] = [],
    byPixels = new Map<string, number>(),
    states = new Map<string, number>();
  TACHOMETER_TILES.forEach((tile, t) => {
    for (const fuelCut of [false, true])
      for (let litBars = 0; litBars <= TACHOMETER.bars; litBars++) {
        const { split, lit } = tileState(tile, litBars, fuelCut);
        const pattern = tilePattern(tile, split, lit),
          pixels = pattern.join();
        if (!byPixels.has(pixels)) byPixels.set(pixels, patterns.push(pattern) - 1);
        states.set(stateKey(t, split, lit), byPixels.get(pixels)!);
      }
  });
  return { patterns, states };
})();
/** The tachometer's patterns' 64 palette slots each, in the text tiles' order of `TACH_n`. */
export const TACHOMETER_PATTERNS: readonly (readonly number[])[] = Object.freeze(
  UNIQUE_PATTERNS.map((pattern) => Object.freeze(pattern)),
);

/** What one tachometer tile shows: its place, its pattern among `TACHOMETER_PATTERNS` and its one or two colors. */
export interface TachometerTileView extends TileState {
  readonly column: number;
  readonly row: number;
  readonly pattern: number;
}
/** Every tile that holds part of a bar, with `litBars` lit and fuel cut latched or not. */
export function tachometerTiles(litBars: number, fuelCut: boolean): TachometerTileView[] {
  return TACHOMETER_TILES.map((tile, t) => {
    const state = tileState(tile, litBars, fuelCut);
    return {
      column: tile.column,
      row: tile.row,
      ...state,
      pattern: STATE_PATTERNS.get(stateKey(t, state.split, state.lit))!,
    };
  });
}
