import { EMPTY_TEXT_TILE, TEXT_TILE_SIZE, type TextTiles } from '../image/text-tiles.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './display-scale.js';
import type { SoftwareSurface } from './software-surface.js';

/** The text layer's 40 by 30 tile grid covers the logical frame. */
export const TEXT_COLUMNS = LOGICAL_WIDTH / TEXT_TILE_SIZE;
export const TEXT_ROWS = LOGICAL_HEIGHT / TEXT_TILE_SIZE;

/**
 * The one way to draw text in the frame: a grid of [pattern, palette] tiles over the scene. Drawing paints every
 * non-empty tile's opaque pixels; index 0 leaves the frame below visible.
 */
export function createTextLayer(tiles: TextTiles) {
  const patterns = new Uint16Array(TEXT_COLUMNS * TEXT_ROWS),
    palettes = new Uint8Array(TEXT_COLUMNS * TEXT_ROWS);
  const at = (column: number, row: number, length: number) => {
    if (
      !Number.isInteger(column) ||
      !Number.isInteger(row) ||
      column < 0 ||
      row < 0 ||
      row >= TEXT_ROWS ||
      column + length > TEXT_COLUMNS
    )
      throw new RangeError('text lies outside the text grid');
    return row * TEXT_COLUMNS + column;
  };
  const requirePalette = (palette: number) => {
    if (!Number.isInteger(palette) || palette < 0 || palette >= tiles.paletteCount)
      throw new RangeError('unknown text palette');
  };
  return Object.freeze({
    /** Empty every tile. */
    clear() {
      patterns.fill(EMPTY_TEXT_TILE);
      palettes.fill(0);
    },
    /** Place `text` from (`column`, `row`) rightward in one palette; it must fit the row. */
    write(column: number, row: number, text: string, palette: number) {
      requirePalette(palette);
      const codes = tiles.encode(text);
      const start = at(column, row, codes.length);
      patterns.set(codes, start);
      palettes.fill(palette, start, start + codes.length);
    },
    /** Place one tile. */
    put(column: number, row: number, pattern: number, palette: number) {
      requirePalette(palette);
      if (!Number.isInteger(pattern) || pattern < 0 || pattern >= tiles.patternCount)
        throw new RangeError('unknown text pattern');
      const index = at(column, row, 1);
      patterns[index] = pattern;
      palettes[index] = palette;
    },
    /** Paint the non-empty tiles over a logical frame. */
    draw(frame: SoftwareSurface) {
      if (frame.width !== LOGICAL_WIDTH || frame.height !== LOGICAL_HEIGHT)
        throw new RangeError('the text layer draws over the logical frame');
      for (let row = 0, i = 0; row < TEXT_ROWS; row++)
        for (let column = 0; column < TEXT_COLUMNS; column++, i++)
          if (patterns[i] !== EMPTY_TEXT_TILE)
            tiles.paint(
              frame.pixels,
              row * TEXT_TILE_SIZE * LOGICAL_WIDTH + column * TEXT_TILE_SIZE,
              LOGICAL_WIDTH,
              patterns[i]!,
              palettes[i]!,
            );
    },
  });
}
export type TextLayer = ReturnType<typeof createTextLayer>;
