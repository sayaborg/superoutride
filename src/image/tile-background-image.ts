import { readArray, readDocument, readNumber, readRecord, readString, requireAdmission } from '../core/admission.js';
import { IndexedPattern, readIndexedPalette, readPatternSymbol } from './indexed-image.js';

const BACKGROUND_TILE_SIZE = 16;
const BACKGROUND_TILE_ROWS = 40;
/** The widest map, 4096 px: a full turn at the longest DEV focal length (400 px) is 2513 px. */
const BACKGROUND_MAX_TILE_COLUMNS = 256;
export const BACKGROUND_HEIGHT = BACKGROUND_TILE_ROWS * BACKGROUND_TILE_SIZE;

/** The indexed pattern/palette format with a fixed tile arrangement rather than sprite levels. */
export interface TileBackgroundDocument {
  readonly format: 'superoutride.tile-background';
  readonly version: 1;
  readonly name: string;
  readonly patterns: readonly { readonly indices: readonly number[] }[];
  readonly palettes: readonly (readonly number[])[];
  readonly tiles: readonly (readonly [patternId: number, paletteId: number])[];
}

/** An opaque background symbol: the background is the frame's base plane, so index 0 is not admitted. */
function readOpaqueSymbol(value: unknown, path: string): number {
  const index = readPatternSymbol(value, path);
  requireAdmission(index !== 0, 'invalid_value', path, 'Background patterns are opaque and cannot use index 0');
  return index;
}

/** Admit a saved tiled background and build its immutable raster reader. */
export function compileTileBackground(value: unknown): TileBackgroundImage {
  const document = readDocument(
    value,
    ['format', 'version', 'name', 'patterns', 'palettes', 'tiles'],
    'superoutride.tile-background',
    1,
  );
  const name = readString(document.name, '/name');
  const patterns = readArray(
    document.patterns,
    '/patterns',
    (value, path) =>
      new IndexedPattern(
        16,
        16,
        readArray(readRecord(value, path, ['indices']).indices, `${path}/indices`, readOpaqueSymbol, {
          length: 256,
        }),
      ),
    { min: 1 },
  );
  const palettes = readArray(document.palettes, '/palettes', readIndexedPalette, { min: 1 });
  const tiles = readArray(
    document.tiles,
    '/tiles',
    (value, path) => {
      const [pattern, palette] = readArray(value, path, (value) => value, { length: 2 });
      return [
        readNumber(pattern, `${path}/0`, { min: 0, max: patterns.length - 1, integer: true }),
        readNumber(palette, `${path}/1`, { min: 0, max: palettes.length - 1, integer: true }),
      ] as const;
    },
    { min: BACKGROUND_TILE_ROWS, max: BACKGROUND_MAX_TILE_COLUMNS * BACKGROUND_TILE_ROWS },
  );
  requireAdmission(
    tiles.length % BACKGROUND_TILE_ROWS === 0,
    'invalid_value',
    '/tiles',
    `A tiled background has ${BACKGROUND_TILE_ROWS} full rows of tiles`,
  );
  return new TileBackgroundImage(name, patterns, palettes, tiles);
}

/** Private packed patterns, palette table and tile bindings are borrowed read-only by the raster. */
export class TileBackgroundImage {
  /** The map's width in pixels: its tile columns, which its tiles give, times 16. */
  readonly width: number;
  readonly height = BACKGROUND_HEIGHT;
  readonly #columns: number;
  readonly #patterns: readonly IndexedPattern[];
  readonly #palettes: Uint16Array;
  readonly #tiles: Uint32Array;

  /** Admitted opaque 16x16 patterns, 16-color palettes and one in-range binding per tile. */
  constructor(
    readonly name: string,
    patterns: readonly IndexedPattern[],
    palettes: readonly (readonly number[])[],
    tiles: readonly (readonly [patternId: number, paletteId: number])[],
  ) {
    if (
      tiles.length === 0 ||
      tiles.length % BACKGROUND_TILE_ROWS !== 0 ||
      !tiles.every(([pattern, palette]) => pattern < patterns.length && palette < palettes.length)
    )
      throw new RangeError('A tiled background binds 40 full rows of tiles to existing patterns and palettes');
    this.#columns = tiles.length / BACKGROUND_TILE_ROWS;
    this.width = this.#columns * BACKGROUND_TILE_SIZE;
    for (const pattern of patterns)
      for (let i = 0; i < 256; i++)
        if (!pattern.indexAt(i)) throw new RangeError('A tiled background pattern is opaque and has no index 0');
    this.#patterns = patterns;
    this.#palettes = new Uint16Array(palettes.length * 16);
    palettes.forEach((palette, id) => this.#palettes.set(palette, id << 4));
    this.#tiles = new Uint32Array(tiles.flat());
    Object.freeze(this);
  }

  /** Writes every destination pixel of the row; interiors share their tile lookup. */
  paintRow(target: Uint16Array, destination: number, imageX: number, imageY: number, width: number): void {
    let x = ((imageX % this.width) + this.width) % this.width,
      written = 0;
    const tileRow = (imageY >>> 4) * this.#columns,
      row = (imageY & 15) << 4;
    while (written < width) {
      const column = x & 15,
        count = Math.min(16 - column, width - written);
      const tile = (tileRow + (x >>> 4)) * 2,
        pattern = this.#patterns[this.#tiles[tile]!]!,
        palette = this.#tiles[tile + 1]! << 4;
      for (let i = 0; i < count; i++)
        target[destination + written + i] = this.#palettes[palette + pattern.indexAt(row + column + i)]!;
      written += count;
      x += count;
      if (x === this.width) x = 0;
    }
  }
}
