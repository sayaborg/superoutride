import { rgba, rgbaToRgb555 } from '../../src/image/rgb555.js';
import { ORNATE_STYLES, type OrnateStyle } from '../../src/image/text-tiles.js';
import type { OrnateFontSource } from './hud-design-sources.js';

type Rgb = readonly [number, number, number];
/**
 * The ramps of the ornate styles the sources give no palette for, as 8-bit channels: a light top, a strong middle and a
 * dark bottom, as the SUNSET ramp is built.
 */
const STYLE_RAMPS: Readonly<Record<Exclude<OrnateStyle, 'SUNSET'>, readonly [Rgb, Rgb, Rgb]>> = Object.freeze({
  WHITE: [
    [255, 255, 255],
    [184, 200, 224],
    [104, 112, 136],
  ],
  RED: [
    [255, 200, 200],
    [232, 32, 24],
    [120, 8, 8],
  ],
  GREEN: [
    [208, 255, 200],
    [40, 200, 56],
    [8, 96, 24],
  ],
});
/** The glyph shadow of every style: black. */
const SHADOW = 0;
/** The large font's ink spans 14 rows, its top tile's 8 and its bottom tile's first 6. */
const LARGE_INK_ROWS = 14;

/** `rows` RGB555 colors from the light top through the strong middle, halfway down, to the dark bottom. */
function ramp([light, strong, dark]: readonly [Rgb, Rgb, Rgb], rows: number): number[] {
  return Array.from({ length: rows }, (_, row) => {
    const f = (2 * row) / (rows - 1),
      [from, to, t] = f <= 1 ? [light, strong, f] : [strong, dark, f - 1];
    return rgbaToRgb555(rgba(...(from.map((c, i) => c + (to[i]! - c) * t) as [number, number, number])));
  });
}
/** A 16-color palette with these colors from slot 1 and transparent slot 0. */
const palette = (colors: readonly number[]) => [0, ...colors, ...Array<number>(15 - colors.length).fill(0)];

/**
 * The ornate fonts' patterns in the text tiles' order, the small font's and then the large font's tops and bottoms,
 * and each style's palettes: the small font's and the large font's top and bottom, the SUNSET style's as the source
 * gives them.
 */
export function drawOrnateFonts(source: OrnateFontSource) {
  const { smallSunset, largeSunsetTop, largeSunsetBottom } = source.palettes;
  const styles = ORNATE_STYLES.map((style) => {
    if (style === 'SUNSET') return { style, small: smallSunset, top: largeSunsetTop, bottom: largeSunsetBottom };
    const large = ramp(STYLE_RAMPS[style], LARGE_INK_ROWS),
      bottom = Array.from({ length: 8 }, (_, row) => large[Math.min(8 + row, LARGE_INK_ROWS - 1)]!);
    return {
      style,
      small: palette([...ramp(STYLE_RAMPS[style], 7), SHADOW]),
      top: palette([...large.slice(0, 8), SHADOW]),
      bottom: palette([...bottom, SHADOW]),
    };
  });
  const palettes = new Map<string, readonly number[]>([
    ...styles.map(({ style, small }) => [`ORNATE_SMALL_${style}`, small] as const),
    ...styles.flatMap(({ style, top, bottom }) => [
      [`ORNATE_LARGE_${style}`, top] as const,
      [`ORNATE_LARGE_${style}_BOTTOM`, bottom] as const,
    ]),
  ]);
  return {
    patterns: [...source.small, ...source.large.map(({ top }) => top), ...source.large.map(({ bottom }) => bottom)],
    palettes,
  };
}
