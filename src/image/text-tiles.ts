import { readArray, readDocument, readRecord, readString, requireAdmission } from '../core/admission.js';
import { IndexedPattern, readIndexedPalette, readPatternSymbol } from './indexed-image.js';

/** Text tiles are 8 by 8 pixels. */
export const TEXT_TILE_SIZE = 8;
/** Patterns 0 through 94 are the printable ASCII characters U+0020 through U+007E, in code order. */
const FIRST_CHARACTER = 0x20;
const CHARACTER_COUNT = 0x7f - FIRST_CHARACTER;
/** Text the text tiles can draw: printable ASCII only. */
export const TEXT_CHARACTERS = /^[\x20-\x7e]*$/;
/** The empty tile: pattern 0 (the space) has no opaque pixel and is never painted. */
export const EMPTY_TEXT_TILE = 0;
/**
 * Palettes 0 through 6 are named: the text colors, GREEN (signal lamps and normal), BAR (unlit and empty HUD parts) and
 * PICTURE (the HUD pictures' own colors in slots 1 to 6); later palettes are free. Every other named palette uses the
 * same slots: 1 the main color, 2 the glyph shadow, 3 a bar's ground, 5 a lamp's gloss, 6 its rim and 7 its shaded body.
 */
export const TEXT_PALETTES = Object.freeze({ WHITE: 0, YELLOW: 1, RED: 2, DARK: 3, GREEN: 4, BAR: 5, PICTURE: 6 });
const NAMED_PALETTE_COUNT = Object.keys(TEXT_PALETTES).length;
/**
 * The HUD part tiles follow the characters in this order, as the characters follow code order, so the mapping needs no
 * saved table. A bar cell is a 6-pixel-high bar in rows 1 to 6: `BAR_FILL_k` fills k pixels from the left in slot 1
 * over the slot 3 ground, `BAR_FILL_RIGHT_k` k pixels from the right; `BAR_MARK_k` is a full-height line in column k
 * drawn over a bar; `BAR_LEFT` and `BAR_RIGHT` close the bar. A signal lamp is 2 by 2 tiles, lit or unlit. An input
 * cell, `INPUT_FILL_k` and `INPUT_FILL_RIGHT_k`, is the same as a bar cell 4 pixels high in rows 0 to 3.
 */
const HUD_TILE_NAMES = [
  ...Array.from({ length: 9 }, (_, k) => `BAR_FILL_${k}`),
  ...Array.from({ length: 7 }, (_, k) => `BAR_FILL_RIGHT_${k + 1}`),
  ...Array.from({ length: 8 }, (_, k) => `BAR_MARK_${k}`),
  'BAR_LEFT',
  'BAR_RIGHT',
  ...['ON', 'OFF'].flatMap((state) => ['TL', 'TR', 'BL', 'BR'].map((part) => `LAMP_${state}_${part}`)),
  ...Array.from({ length: 9 }, (_, k) => `INPUT_FILL_${k}`),
  ...Array.from({ length: 7 }, (_, k) => `INPUT_FILL_RIGHT_${k + 1}`),
] as const;
/** The pattern of each HUD part tile by name. */
export const HUD_TILES: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(HUD_TILE_NAMES.map((name, i) => [name, CHARACTER_COUNT + i])),
);
/** A HUD picture's frame is 4 by 4 tiles (32 by 32 pixels); a picture has 32 frames. */
export const HUD_PICTURE_TILES = 4;
export const HUD_PICTURE_FRAMES = 32;
const HUD_PICTURE_NAMES = ['STEERING_CAR', 'STEERING_BIKE'] as const;
const PICTURE_PATTERNS = HUD_PICTURE_FRAMES * HUD_PICTURE_TILES * HUD_PICTURE_TILES;
/**
 * The HUD pictures follow the HUD part tiles in this order, each frame by frame and each frame's tiles row by row, so
 * the mapping needs no saved table either: the first pattern of each picture by name.
 */
export const HUD_PICTURES: Readonly<Record<(typeof HUD_PICTURE_NAMES)[number], number>> = Object.freeze(
  Object.fromEntries(
    HUD_PICTURE_NAMES.map((name, i) => [name, CHARACTER_COUNT + HUD_TILE_NAMES.length + i * PICTURE_PATTERNS]),
  ) as Record<(typeof HUD_PICTURE_NAMES)[number], number>,
);
const PATTERN_COUNT = CHARACTER_COUNT + HUD_TILE_NAMES.length + HUD_PICTURE_NAMES.length * PICTURE_PATTERNS;
/** A pattern ID is a 16-bit and a palette ID an 8-bit unsigned integer, so a text grid cell holds any admitted pair. */
export const TEXT_TILE_LIMITS = Object.freeze({ patterns: 2 ** 16, palettes: 2 ** 8 });

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
    { min: PATTERN_COUNT, max: TEXT_TILE_LIMITS.patterns },
  );
  requireAdmission(
    isEmpty(patterns[EMPTY_TEXT_TILE]!),
    'invalid_value',
    `/patterns/${EMPTY_TEXT_TILE}`,
    'The space pattern is the empty tile and has only index 0',
  );
  const palettes = readArray(document.palettes, '/palettes', readIndexedPalette, {
    min: NAMED_PALETTE_COUNT,
    max: TEXT_TILE_LIMITS.palettes,
  });
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

  /**
   * Admitted 8x8 patterns, at least the character, HUD part and HUD picture patterns with an empty space, and the named
   * 16-color palettes.
   */
  constructor(
    readonly name: string,
    patterns: readonly IndexedPattern[],
    palettes: readonly (readonly number[])[],
  ) {
    if (
      patterns.length < PATTERN_COUNT ||
      palettes.length < NAMED_PALETTE_COUNT ||
      !patterns.every((p) => p.width === TEXT_TILE_SIZE && p.height === TEXT_TILE_SIZE) ||
      !isEmpty(patterns[EMPTY_TEXT_TILE]!)
    )
      throw new RangeError(
        'Text tiles need every character, HUD part and HUD picture as 8x8 patterns, an empty space and the named palettes',
      );
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
