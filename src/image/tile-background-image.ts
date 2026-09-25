import { readArray, readDocument, readNumber, readRecord, readString } from '../core/admission.js';
import { IndexedPattern, indexedPaletteRgba, readIndexedPalette, readPatternSymbol } from './indexed-image.js';

const BACKGROUND_TILE_SIZE = 16;
const BACKGROUND_TILE_COLUMNS = 80;
const BACKGROUND_TILE_ROWS = 40;
const BACKGROUND_WIDTH = BACKGROUND_TILE_COLUMNS * BACKGROUND_TILE_SIZE;
export const BACKGROUND_HEIGHT = BACKGROUND_TILE_ROWS * BACKGROUND_TILE_SIZE;
export const BACKGROUND_PIXELS_PER_RADIAN = BACKGROUND_WIDTH / (2 * Math.PI);

/** The indexed pattern/palette format with a fixed tile arrangement rather than sprite levels. */
export interface TileBackgroundDocument {
  readonly format: 'superoutride.tile-background';
  readonly version: 1;
  readonly name: string;
  readonly patterns: readonly { readonly indices: readonly number[] }[];
  readonly palettes: readonly (readonly number[])[];
  readonly tiles: readonly (readonly [patternId: number, paletteId: number])[];
}

/** Private packed patterns, palette table and tile bindings are borrowed read-only by the raster. */
export class TileBackgroundImage {
  readonly width = BACKGROUND_WIDTH;
  readonly height = BACKGROUND_HEIGHT;
  readonly #patterns: readonly IndexedPattern[];
  readonly #palettes: Uint32Array;
  readonly #tiles: Uint32Array;

  constructor(value: unknown) {
    const document = readDocument(
      value,
      ['format', 'version', 'name', 'patterns', 'palettes', 'tiles'],
      'superoutride.tile-background',
      1,
    );
    readString(document.name, '/name');
    this.#patterns = readArray(
      document.patterns,
      '/patterns',
      (value, path) =>
        new IndexedPattern(
          16,
          16,
          readArray(readRecord(value, path, ['indices']).indices, `${path}/indices`, readPatternSymbol, {
            length: 256,
          }),
        ),
      { min: 1 },
    );
    const palettes = readArray(document.palettes, '/palettes', readIndexedPalette, { min: 1 });
    this.#palettes = new Uint32Array(palettes.length * 16);
    palettes.forEach((palette, id) => this.#palettes.set(indexedPaletteRgba(palette), id << 4));
    const tiles = readArray(
      document.tiles,
      '/tiles',
      (value, path) => {
        const [pattern, palette] = readArray(value, path, (value) => value, { length: 2 });
        return [
          readNumber(pattern, `${path}/0`, { min: 0, max: this.#patterns.length - 1, integer: true }),
          readNumber(palette, `${path}/1`, { min: 0, max: palettes.length - 1, integer: true }),
        ];
      },
      { length: BACKGROUND_TILE_COLUMNS * BACKGROUND_TILE_ROWS },
    );
    this.#tiles = new Uint32Array(tiles.flat());
    Object.freeze(this);
  }

  /** One horizontal repeat; interiors share their tile lookup instead of branching per destination pixel. */
  paintRow(target: Uint32Array, destination: number, imageX: number, imageY: number, width: number): void {
    let x = ((imageX % this.width) + this.width) % this.width,
      written = 0;
    const tileRow = (imageY >>> 4) * BACKGROUND_TILE_COLUMNS,
      row = (imageY & 15) << 4;
    while (written < width) {
      const column = x & 15,
        count = Math.min(16 - column, width - written);
      const tile = (tileRow + (x >>> 4)) * 2,
        pattern = this.#patterns[this.#tiles[tile]!]!,
        palette = this.#tiles[tile + 1]! << 4;
      for (let i = 0; i < count; i++) {
        const index = pattern.indexAt(row + column + i);
        if (index) target[destination + written + i] = this.#palettes[palette + index]!;
      }
      written += count;
      x += count;
      if (x === this.width) x = 0;
    }
  }
}
