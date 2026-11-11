import type { SoftwareSurface } from '../view/software-surface.js';

/**
 * The small print: 3×5 glyphs at the left top of a cell 4 pixels wide and 8 tall, two to a tile's width, their feet on
 * the normal font's (K, 2026-11-12: a 4×8 font, drawn here). Provisional as painted pixels: it becomes a text-tile font
 * with the cards' final design.
 */
export const SMALL_PRINT = Object.freeze({ width: 4, height: 8, rows: 5 });

// Each glyph's five rows from the top, three pixels a row.
const GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '110001010001110',
  '4': '101101111001001',
  '5': '111100110001110',
  '6': '011100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001110',
  '.': '000000000000010',
  ',': '000000000010100',
  '-': '000000111000000',
  '/': '001001010100100',
  ':': '000010000010000',
  "'": '010010000000000',
  '%': '101001010100101',
  '+': '000010111010000',
  '(': '001010010010001',
  ')': '100010010010100',
  '&': '010101010101011',
  '!': '010010010000010',
  '?': '110001010000010',
  ' ': '000000000000000',
});

/** Whether the small print draws every character of `line`: capitals, digits, spaces and `. , - / : ' % + ( ) & ! ?`. */
export const smallPrintDraws = (line: string) => [...line].every((character) => character in GLYPHS);

/**
 * Draw `line` in the small print in `color`, its first cell's left top at (`x`, `y`), clipped to `target`. A character it
 * does not draw is a `RangeError`.
 */
export function drawSmallPrint(target: SoftwareSurface, x: number, y: number, line: string, color: number): void {
  [...line].forEach((character, i) => {
    const glyph = GLYPHS[character];
    if (glyph === undefined) throw new RangeError(`The small print does not draw ${JSON.stringify(character)}`);
    for (let k = 0; k < glyph.length; k++)
      if (glyph[k] === '1') target.setPixel(x + i * SMALL_PRINT.width + (k % 3), y + Math.floor(k / 3), color);
  });
}
