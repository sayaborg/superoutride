import { readArray, readDocument, readRecord, readString, requireAdmission } from '../core/admission.js';
import { IndexedPattern, readIndexedPalette, readPatternSymbol } from './indexed-image.js';

/** Text tiles are 8 by 8 pixels. */
export const TEXT_TILE_SIZE = 8;
/** Patterns 0 through 94 are the printable ASCII characters U+0020 through U+007E, in code order. */
const FIRST_CHARACTER = 0x20;
const CHARACTER_COUNT = 0x7f - FIRST_CHARACTER;
/** The empty tile: pattern 0 (the space) has no opaque pixel and is never painted. */
export const EMPTY_TEXT_TILE = 0;
/** Palettes 0 through 3 name the text colors; later palettes are free. */
export const TEXT_PALETTES = Object.freeze({ WHITE: 0, YELLOW: 1, RED: 2, DARK: 3 });
const NAMED_PALETTE_COUNT = Object.keys(TEXT_PALETTES).length;

/** The indexed pattern/palette format with 8x8 transparent-capable tiles and no saved arrangement. */
export interface TextTilesDocument {
  readonly format: 'superoutride.text-tiles';
  readonly version: 1;
  readonly name: string;
  readonly patterns: readonly { readonly indices: readonly number[] }[];
  readonly palettes: readonly (readonly number[])[];
}

/** Admit the saved text tiles and build their immutable tile reader. */
export function compileTextTiles(value: unknown): TextTiles {
  const document = readDocument(
    value,
    ['format', 'version', 'name', 'patterns', 'palettes'],
    'superoutride.text-tiles',
    1,
  );
  const name = readString(document.name, '/name');
  const patterns = readArray(
    document.patterns,
    '/patterns',
    (value, path) =>
      new IndexedPattern(
        TEXT_TILE_SIZE,
        TEXT_TILE_SIZE,
        readArray(readRecord(value, path, ['indices']).indices, `${path}/indices`, readPatternSymbol, {
          length: TEXT_TILE_SIZE * TEXT_TILE_SIZE,
        }),
      ),
    { min: CHARACTER_COUNT },
  );
  requireAdmission(
    isEmpty(patterns[EMPTY_TEXT_TILE]!),
    'invalid_value',
    `/patterns/${EMPTY_TEXT_TILE}`,
    'The space pattern is the empty tile and has only index 0',
  );
  const palettes = readArray(document.palettes, '/palettes', readIndexedPalette, { min: NAMED_PALETTE_COUNT });
  return new TextTiles(name, patterns, palettes);
}

function isEmpty(pattern: IndexedPattern): boolean {
  for (let i = 0; i < TEXT_TILE_SIZE * TEXT_TILE_SIZE; i++) if (pattern.indexAt(i)) return false;
  return true;
}

/** Private packed patterns and palette table; index 0 is transparent. */
export class TextTiles {
  readonly patternCount: number;
  readonly paletteCount: number;
  readonly #patterns: readonly IndexedPattern[];
  readonly #palettes: Uint16Array;

  /** Admitted 8x8 patterns, at least the character patterns with an empty space, and the named 16-color palettes. */
  constructor(
    readonly name: string,
    patterns: readonly IndexedPattern[],
    palettes: readonly (readonly number[])[],
  ) {
    if (
      patterns.length < CHARACTER_COUNT ||
      palettes.length < NAMED_PALETTE_COUNT ||
      !patterns.every((p) => p.width === TEXT_TILE_SIZE && p.height === TEXT_TILE_SIZE) ||
      !isEmpty(patterns[EMPTY_TEXT_TILE]!)
    )
      throw new RangeError('Text tiles need every character as an 8x8 pattern, an empty space and the named palettes');
    this.#patterns = patterns;
    this.#palettes = new Uint16Array(palettes.length * 16);
    palettes.forEach((palette, id) => this.#palettes.set(palette, id << 4));
    this.patternCount = patterns.length;
    this.paletteCount = palettes.length;
    Object.freeze(this);
  }

  /** The pattern of each character of `text`; a character without a pattern is a RangeError. */
  encode(text: string): number[] {
    const result: number[] = [];
    for (const character of text) {
      const code = character.codePointAt(0)! - FIRST_CHARACTER;
      if (code < 0 || code >= CHARACTER_COUNT) throw new RangeError(`No text tile for ${JSON.stringify(character)}`);
      result.push(code);
    }
    return result;
  }

  /** Paint one tile's opaque pixels at `offset` of an RGB555 target with row `stride`; index 0 leaves the target. */
  paint(target: Uint16Array, offset: number, stride: number, pattern: number, palette: number): void {
    const source = this.#patterns[pattern]!,
      base = palette << 4;
    for (let y = 0, i = 0; y < TEXT_TILE_SIZE; y++)
      for (let x = 0; x < TEXT_TILE_SIZE; x++, i++) {
        const index = source.indexAt(i);
        if (index) target[offset + y * stride + x] = this.#palettes[base + index]!;
      }
  }
}
