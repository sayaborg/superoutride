import { IndexedPattern, indexedPaletteRgba, readIndexedPalette } from './indexed-image.js';

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
    const document = record(value, ['format', 'version', 'name', 'patterns', 'palettes', 'tiles']);
    if (document.format !== 'superoutride.tile-background' || document.version !== 1)
      throw new RangeError('unsupported tiled background format/version');
    if (typeof document.name !== 'string' || !document.name.trim()) throw new RangeError('background name is required');
    if (
      !Array.isArray(document.patterns) ||
      !document.patterns.length ||
      !Array.isArray(document.palettes) ||
      !document.palettes.length
    )
      throw new RangeError('background requires indexed patterns and palettes');
    this.#patterns = Object.freeze(
      Array.from(
        document.patterns,
        (pattern: unknown) => new IndexedPattern(16, 16, record(pattern, ['indices']).indices as readonly number[]),
      ),
    );
    const palettes = Array.from(document.palettes, readIndexedPalette);
    this.#palettes = new Uint32Array(palettes.length * 16);
    palettes.forEach((palette, id) => this.#palettes.set(indexedPaletteRgba(palette), id << 4));
    if (!Array.isArray(document.tiles) || document.tiles.length !== BACKGROUND_TILE_COLUMNS * BACKGROUND_TILE_ROWS)
      throw new RangeError('background requires exactly 80 by 40 tiles');
    this.#tiles = new Uint32Array(document.tiles.length * 2);
    Array.from(document.tiles).forEach((tile: unknown, i: number) => {
      if (
        !Array.isArray(tile) ||
        tile.length !== 2 ||
        !Number.isInteger(tile[0]) ||
        tile[0] < 0 ||
        tile[0] >= this.#patterns.length ||
        !Number.isInteger(tile[1]) ||
        tile[1] < 0 ||
        tile[1] >= palettes.length
      )
        throw new RangeError('background tile must reference an existing pattern and palette');
      this.#tiles[i * 2] = tile[0];
      this.#tiles[i * 2 + 1] = tile[1];
    });
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

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RangeError('background record is required');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some((key) => !Object.hasOwn(object, key)))
    throw new RangeError('background record has missing or unknown fields');
  return object;
}
