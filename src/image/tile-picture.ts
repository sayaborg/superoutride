import { readArray, readDocument, readNumber, readRecord, readString, requireAdmission } from '../core/admission.js';
import { IndexedPattern, readIndexedPalette, readPatternSymbols } from './indexed-image.js';

/** A tile's side in pixels, 2^`TILE_SHIFT`. */
const TILE_SHIFT = 3;
export const TILE_PICTURE_TILE_SIZE = 1 << TILE_SHIFT;
const TILE_MASK = TILE_PICTURE_TILE_SIZE - 1;
/**
 * The widest and tallest maps: 4096 px across, so a full turn at the longest DEV focal length (400 px, 2513 px) fits,
 * and 640 px down, a sky's height.
 */
export const TILE_PICTURE_LIMITS = Object.freeze({ columns: 512, rows: 80 });

/**
 * The one tile picture format: 8×8 patterns of 4-bit indices, 16-entry RGB555 palettes, and a row-major map of
 * `columns` tiles a row, each binding a pattern and a palette. Index 0 is transparent.
 */
export interface TilePictureDocument {
  readonly format: 'superoutride.tile-picture';
  readonly version: 1;
  readonly name: string;
  readonly columns: number;
  readonly patterns: readonly { readonly indices: readonly number[] }[];
  readonly palettes: readonly (readonly number[])[];
  readonly tiles: readonly (readonly [patternId: number, paletteId: number])[];
}

export const TILE_PICTURE_FORMAT = 'superoutride.tile-picture';

/** A target a picture is drawn into: RGB555 pixels, row-major. */
export interface TilePictureTarget {
  readonly pixels: Uint16Array;
  readonly width: number;
  readonly height: number;
}

/** Admit a saved tile picture and build its immutable raster reader. */
export function compileTilePicture(value: unknown): TilePicture {
  const document = readDocument(
    value,
    ['format', 'version', 'name', 'columns', 'patterns', 'palettes', 'tiles'],
    TILE_PICTURE_FORMAT,
    1,
  );
  const name = readString(document.name, '/name');
  const columns = readNumber(document.columns, '/columns', {
    min: 1,
    max: TILE_PICTURE_LIMITS.columns,
    integer: true,
  });
  const size = TILE_PICTURE_TILE_SIZE * TILE_PICTURE_TILE_SIZE;
  const patterns = readArray(
    document.patterns,
    '/patterns',
    (value, path) =>
      new IndexedPattern(
        TILE_PICTURE_TILE_SIZE,
        TILE_PICTURE_TILE_SIZE,
        readPatternSymbols(readRecord(value, path, ['indices']).indices, `${path}/indices`, size),
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
    { min: columns, max: columns * TILE_PICTURE_LIMITS.rows },
  );
  requireAdmission(
    tiles.length % columns === 0,
    'invalid_value',
    '/tiles',
    `A tile picture has full rows of ${columns} tiles`,
  );
  return new TilePicture(name, columns, patterns, palettes, tiles);
}

/** Private packed patterns, palette table and tile bindings are borrowed read-only by the raster. */
export class TilePicture {
  readonly columns: number;
  readonly rows: number;
  /** In pixels: its tile columns and rows times the tile's side. */
  readonly width: number;
  readonly height: number;
  /** No pattern holds index 0, so the picture writes every pixel it covers. */
  readonly opaque: boolean;
  readonly #patterns: readonly IndexedPattern[];
  readonly #palettes: Uint16Array;
  readonly #tiles: Uint32Array;

  /** Admitted 8×8 patterns, 16-color palettes and one in-range binding per tile, in full rows of `columns`. */
  constructor(
    readonly name: string,
    columns: number,
    patterns: readonly IndexedPattern[],
    palettes: readonly (readonly number[])[],
    tiles: readonly (readonly [patternId: number, paletteId: number])[],
  ) {
    if (
      !Number.isInteger(columns) ||
      columns < 1 ||
      tiles.length === 0 ||
      tiles.length % columns !== 0 ||
      !tiles.every(([pattern, palette]) => pattern < patterns.length && palette < palettes.length)
    )
      throw new RangeError('A tile picture binds full rows of tiles to existing patterns and palettes');
    this.columns = columns;
    this.rows = tiles.length / columns;
    this.width = columns * TILE_PICTURE_TILE_SIZE;
    this.height = this.rows * TILE_PICTURE_TILE_SIZE;
    this.opaque = patterns.every((pattern) => {
      for (let i = 0; i < TILE_PICTURE_TILE_SIZE * TILE_PICTURE_TILE_SIZE; i++) if (!pattern.indexAt(i)) return false;
      return true;
    });
    this.#patterns = patterns;
    this.#palettes = new Uint16Array(palettes.length * 16);
    palettes.forEach((palette, id) => this.#palettes.set(palette, id << 4));
    this.#tiles = new Uint32Array(tiles.flat());
    Object.freeze(this);
  }

  /**
   * Writes every destination pixel of one row of an opaque picture, repeating it horizontally from `imageX`;
   * interiors share their tile lookup.
   */
  paintRow(target: Uint16Array, destination: number, imageX: number, imageY: number, width: number): void {
    let x = ((imageX % this.width) + this.width) % this.width,
      written = 0;
    const tileRow = (imageY >>> TILE_SHIFT) * this.columns,
      row = (imageY & TILE_MASK) << TILE_SHIFT;
    while (written < width) {
      const column = x & TILE_MASK,
        count = Math.min(TILE_PICTURE_TILE_SIZE - column, width - written);
      const tile = (tileRow + (x >>> TILE_SHIFT)) * 2,
        pattern = this.#patterns[this.#tiles[tile]!]!,
        palette = this.#tiles[tile + 1]! << 4;
      for (let i = 0; i < count; i++)
        target[destination + written + i] = this.#palettes[palette + pattern.indexAt(row + column + i)]!;
      written += count;
      x += count;
      if (x === this.width) x = 0;
    }
  }

  /** Draw the picture once with its top-left corner at (`x`, `y`), clipped to the target; index 0 leaves the target. */
  draw(target: TilePictureTarget, x: number, y: number): void {
    const top = Math.max(0, -y),
      bottom = Math.min(this.height, target.height - y),
      left = Math.max(0, -x),
      right = Math.min(this.width, target.width - x);
    for (let imageY = top; imageY < bottom; imageY++) {
      const tileRow = (imageY >>> TILE_SHIFT) * this.columns,
        row = (imageY & TILE_MASK) << TILE_SHIFT,
        destination = (y + imageY) * target.width + x;
      for (let imageX = left; imageX < right; imageX++) {
        const tile = (tileRow + (imageX >>> TILE_SHIFT)) * 2;
        const index = this.#patterns[this.#tiles[tile]!]!.indexAt(row + (imageX & TILE_MASK));
        if (index) target.pixels[destination + imageX] = this.#palettes[(this.#tiles[tile + 1]! << 4) + index]!;
      }
    }
  }
}
