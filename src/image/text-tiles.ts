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
 * Palettes 0 through 5 are named: the text colors, GREEN (signal lamps and normal) and BAR (unlit and empty HUD parts).
 * They use the same slots: 1 the main color, 2 the glyph shadow, 3 a bar's ground, 5 a lamp's gloss, 6 its rim and 7
 * its shaded body. The HUD pictures' palettes follow them; later palettes are free.
 */
export const TEXT_PALETTES = Object.freeze({ WHITE: 0, YELLOW: 1, RED: 2, DARK: 3, GREEN: 4, BAR: 5 });
/**
 * The HUD part tiles follow the characters in this order, as the characters follow code order, so the mapping needs no
 * saved table. A bar cell is a 6-pixel-high bar in rows 1 to 6: `BAR_FILL_k` fills k pixels from the left in slot 1
 * over the slot 3 ground, `BAR_FILL_RIGHT_k` k pixels from the right; `BAR_MARK_k` is a full-height line in column k
 * drawn over a bar; `BAR_LEFT` and `BAR_RIGHT` close the bar. A signal lamp is 2 by 2 tiles, lit or unlit. An input
 * cell, `INPUT_FILL_k` and `INPUT_FILL_RIGHT_k`, is the same as a bar cell 4 pixels high in rows 0 to 3.
 * `ARROW_LEFT` and `ARROW_RIGHT` are arrows drawn as the font's glyphs are, slot 1 with its slot 2 shadow.
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
  'ARROW_LEFT',
  'ARROW_RIGHT',
] as const;
/** The pattern of each HUD part tile by name. */
export const HUD_TILES: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(HUD_TILE_NAMES.map((name, i) => [name, CHARACTER_COUNT + i])),
);
/** A HUD picture's frame is 6 by 6 tiles (48 by 48 pixels). */
export const HUD_PICTURE_TILES = 6;
/**
 * A HUD picture: its first pattern and its palette, and how its frames turn. Frame `upright` stands upright and each
 * next frame is turned `step` radians further clockwise; a `full` picture's frames make a full turn and repeat, a
 * `span` picture's stop at its first and last frames.
 */
export interface HudPicture {
  readonly name: string;
  readonly first: number;
  readonly palette: number;
  readonly frames: number;
  readonly step: number;
  readonly upright: number;
  readonly turn: 'full' | 'span';
}
const STEERING_WHEEL = { frames: 32, step: (2 * Math.PI) / 32, upright: 0, turn: 'full' } as const;
const TOP_BRIDGE = { frames: 33, step: ((45 / 32) * Math.PI) / 180, upright: 16, turn: 'span' } as const;
/** The HUD pictures by name, in their order: steering wheels a full turn in 32 frames, a top bridge ±22.5° in 33. */
const HUD_PICTURE_TURNS = [
  ['prototipo', STEERING_WHEEL],
  ['mod02', STEERING_WHEEL],
  ['montecarlo', STEERING_WHEEL],
  ['top-bridge', TOP_BRIDGE],
] as const;
const NAMED_PALETTE_COUNT = Object.keys(TEXT_PALETTES).length;
const FRAME_PATTERNS = HUD_PICTURE_TILES * HUD_PICTURE_TILES;
/**
 * The HUD pictures follow the HUD part tiles in this order, each frame by frame and each frame's tiles row by row, so
 * the mapping needs no saved table either; picture k's palette is the k-th after the named palettes, its 15 colors in
 * slots 1 to 15.
 */
export const HUD_PICTURES: Readonly<Record<string, HudPicture>> = Object.freeze(
  Object.fromEntries(
    HUD_PICTURE_TURNS.reduce<HudPicture[]>((pictures, [name, turn], k) => {
      const before = pictures[k - 1];
      const first = before ? before.first + before.frames * FRAME_PATTERNS : CHARACTER_COUNT + HUD_TILE_NAMES.length;
      return [...pictures, Object.freeze({ name, first, palette: NAMED_PALETTE_COUNT + k, ...turn })];
    }, []).map((picture) => [picture.name, picture]),
  ),
);
/** The frame a picture shows turned `angle` radians clockwise from upright; the picture is never rotated at run time. */
export function hudPictureFrame(picture: HudPicture, angle: number): number {
  const frame = picture.upright + Math.round(angle / picture.step);
  return picture.turn === 'full'
    ? ((frame % picture.frames) + picture.frames) % picture.frames
    : Math.min(picture.frames - 1, Math.max(0, frame));
}
const LAST_PICTURE = Object.values(HUD_PICTURES).at(-1)!;
const PATTERN_COUNT = LAST_PICTURE.first + LAST_PICTURE.frames * FRAME_PATTERNS;
const PALETTE_COUNT = LAST_PICTURE.palette + 1;
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
    min: PALETTE_COUNT,
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
   * and HUD picture 16-color palettes.
   */
  constructor(
    readonly name: string,
    patterns: readonly IndexedPattern[],
    palettes: readonly (readonly number[])[],
  ) {
    if (
      patterns.length < PATTERN_COUNT ||
      palettes.length < PALETTE_COUNT ||
      !patterns.every((p) => p.width === TEXT_TILE_SIZE && p.height === TEXT_TILE_SIZE) ||
      !isEmpty(patterns[EMPTY_TEXT_TILE]!)
    )
      throw new RangeError(
        'Text tiles need every character, HUD part and HUD picture as 8x8 patterns, an empty space and their palettes',
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
