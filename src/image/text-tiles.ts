import { readArray, readDocument, readRecord, readString, requireAdmission } from '../core/admission.js';
import { IndexedPattern, readIndexedPalette, readPatternSymbols } from './indexed-image.js';

/** Text tiles are 8 by 8 pixels. */
export const TEXT_TILE_SIZE = 8;
/**
 * The marks the text tiles draw besides printable ASCII: solid triangles pointing up, down, left and right, as menus
 * show choices above and below or either side.
 */
export const TEXT_MARKS = Object.freeze({ up: '\u25b2', down: '\u25bc', left: '\u25c0', right: '\u25b6' });
/**
 * Every character the text tiles draw, in their patterns' order: the printable ASCII characters U+0020 through U+007E in
 * code order, then the marks up, down, left and right, so the character mapping needs no saved table.
 */
export const TEXT_CHARACTER_ORDER: readonly string[] = Object.freeze([
  ...Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)),
  TEXT_MARKS.up,
  TEXT_MARKS.down,
  TEXT_MARKS.left,
  TEXT_MARKS.right,
]);
const CHARACTER_COUNT = TEXT_CHARACTER_ORDER.length;
const CHARACTER_PATTERNS: ReadonlyMap<string, number> = new Map(
  TEXT_CHARACTER_ORDER.map((character, i) => [character, i]),
);
/** Text the text tiles can draw: printable ASCII and the marks. */
export const TEXT_CHARACTERS = /^[\x20-\x7e\u25b2\u25bc\u25c0\u25b6]*$/;
/** The empty tile: pattern 0 (the space) has no opaque pixel and is never painted. */
export const EMPTY_TEXT_TILE = 0;
/**
 * The fonts, each a pattern per character in the characters' order for each of its rows: the normal 8-by-8 font, the
 * ornate small 8-by-8 font and the ornate large 8-by-16 font, two rows, all its top patterns and then all its bottom
 * patterns. Row r of character c is pattern `first + r * TEXT_CHARACTER_ORDER.length + c`, drawn in the palette r after
 * its style's: an ornate large style's bottom palette follows its top palette.
 */
export const TEXT_FONTS = Object.freeze({
  normal: Object.freeze({ first: 0, rows: 1 }),
  ornateSmall: Object.freeze({ first: CHARACTER_COUNT, rows: 1 }),
  ornateLarge: Object.freeze({ first: 2 * CHARACTER_COUNT, rows: 2 }),
});
export type TextFont = keyof typeof TEXT_FONTS;
/** The fonts' patterns: the characters' patterns come first, and the HUD part tiles follow. */
const FONT_PATTERNS = 4 * CHARACTER_COUNT;
/** The ornate fonts' styles, each a palette (the large font's a top and a bottom palette) per font. */
export const ORNATE_STYLES = Object.freeze(['SUNSET', 'WHITE', 'RED', 'GREEN'] as const);
export type OrnateStyle = (typeof ORNATE_STYLES)[number];

const named = <const Names extends readonly string[]>(names: Names) =>
  Object.freeze(Object.fromEntries(names.map((name, i) => [name, i]))) as { readonly [K in Names[number]]: number };
/**
 * The authored named palettes: the text colors, GREEN (signal lamps and normal), BAR (unlit and empty HUD parts) and
 * GREEN_YELLOW and YELLOW_RED (a tachometer tile where two of its colors meet). They use the
 * same slots: 1 the main color, 2 the glyph shadow, 3 a bar's ground, 4 a bar's cut part (red), 5 a lamp's gloss, 6 its
 * rim, 7 its shaded body, 8 the main color unlit, and 9 and 10 the second color, lit and unlit.
 */
const AUTHORED_PALETTE_NAMES = [
  'WHITE',
  'YELLOW',
  'RED',
  'DARK',
  'GREEN',
  'BAR',
  'GREEN_YELLOW',
  'YELLOW_RED',
] as const;
/**
 * The named palettes the HUD tiles command draws, after the authored ones, in this order: the ornate small font's
 * styles, slots 1 to 7 its ink by row from the top and 8 its shadow, and the ornate large font's, each a top and a
 * bottom palette (`_BOTTOM`), slots 1 to 8 the ink by row within the tile and 9 the shadow; and the segment digits'
 * colors, slots 1 and 2 the lit core and edge and 3 and 4 the unlit core and edge: SEG_VFD, the instruments' color,
 * SEG_YELLOW and SEG_RED, state colors.
 */
export const HUD_DRAWN_PALETTE_NAMES = [
  'ORNATE_SMALL_SUNSET',
  'ORNATE_SMALL_WHITE',
  'ORNATE_SMALL_RED',
  'ORNATE_SMALL_GREEN',
  'ORNATE_LARGE_SUNSET',
  'ORNATE_LARGE_SUNSET_BOTTOM',
  'ORNATE_LARGE_WHITE',
  'ORNATE_LARGE_WHITE_BOTTOM',
  'ORNATE_LARGE_RED',
  'ORNATE_LARGE_RED_BOTTOM',
  'ORNATE_LARGE_GREEN',
  'ORNATE_LARGE_GREEN_BOTTOM',
  'SEG_VFD',
  'SEG_YELLOW',
  'SEG_RED',
] as const;
/**
 * The named palettes: the authored ones, then the drawn ones. The HUD pictures' palettes follow them; later palettes
 * are free.
 */
export const TEXT_PALETTES = named([...AUTHORED_PALETTE_NAMES, ...HUD_DRAWN_PALETTE_NAMES] as const);
/** The tachometer's bars, a pixel wide and eight to a tile, from the left. */
export const TACHOMETER_BARS = 80;
/** Tachometer bar i's height in pixels: a quadratic curve from 4 at the left to 24, three tiles, at the right. */
export const tachometerBarHeight = (i: number) => 4 + Math.round(20 * (i / (TACHOMETER_BARS - 1)) ** 2);
/**
 * The tachometer's tiles that hold part of a bar, as [column, row] within its 10-by-3 tiles, the bars standing on the
 * bottom row.
 */
export const TACHOMETER_TILES: readonly (readonly [number, number])[] = Object.freeze(
  Array.from({ length: TACHOMETER_BARS / 8 }, (_, column) => [0, 1, 2].map((row) => [column, row] as const))
    .flat()
    .filter(([column, row]) =>
      Array.from({ length: 8 }, (_, x) => tachometerBarHeight(column * 8 + x)).some((h) => h > (2 - row) * 8),
    ),
);
/** A segment digit is 2 by 3 tiles, its six patterns row by row from the top left. */
export const DIGIT_TILES = Object.freeze({ columns: 2, rows: 3 });
/** The road arrow is 4 by 4 tiles, its patterns row by row from the top left. */
export const ARROW_TILES = 4;
const tiles = (prefix: string, count: number) => Array.from({ length: count }, (_, k) => `${prefix}_${k}`);
/**
 * The HUD part tiles the HUD tiles command writes, after the signal lamps, in this order:
 * - `METER_a_b` (0 <= a <= b <= 8): a meter cell, 4 pixels high in rows 2 to 5, slot 1 in columns before a, slot 4 (the
 *   cut part) from a to b and the slot 3 ground after; `METER_RIGHT_k` (1 to 7) fills k pixels from the right instead.
 * - `TACH_c_r_b_k` (b 1 to 8, k 0 to 8): the tachometer tile at column c and row r of `TACHOMETER_TILES`, its eight
 *   bars' parts in that row; bars before b take the first color and the rest the second, and bars before k are lit:
 *   slot 1 or 9 lit, 8 or 10 unlit.
 * - `DIGIT_d_k` (d 0 to 9, and `OFF`): tile k of a 16-by-24-pixel italic segment digit from the design sources, lit
 *   segments in slots 1 and 2 and the others in 3 and 4.
 * - `ARROW_LEFT_k` and `ARROW_RIGHT_k`: tile k of the 32-by-32-pixel road arrow, slot 1 outlined in slot 2.
 */
export const HUD_DRAWN_TILE_NAMES: readonly string[] = Object.freeze([
  ...Array.from({ length: 9 }, (_, a) => Array.from({ length: 9 - a }, (_, k) => `METER_${a}_${a + k}`)).flat(),
  ...Array.from({ length: 7 }, (_, k) => `METER_RIGHT_${k + 1}`),
  ...TACHOMETER_TILES.flatMap(([c, r]) =>
    Array.from({ length: 8 }, (_, b) => Array.from({ length: 9 }, (_, k) => `TACH_${c}_${r}_${b + 1}_${k}`)).flat(),
  ),
  ...[...'0123456789'.split(''), 'OFF'].flatMap((d) => tiles(`DIGIT_${d}`, DIGIT_TILES.columns * DIGIT_TILES.rows)),
  ...tiles('ARROW_LEFT', ARROW_TILES * ARROW_TILES),
  ...tiles('ARROW_RIGHT', ARROW_TILES * ARROW_TILES),
]);
/**
 * The HUD part tiles follow the fonts in this order, as the characters follow their order, so the mapping needs no
 * saved table: the signal lamps, 2 by 2 tiles lit or unlit, and then the drawn part tiles.
 */
const HUD_TILE_NAMES = [
  ...['ON', 'OFF'].flatMap((state) => ['TL', 'TR', 'BL', 'BR'].map((part) => `LAMP_${state}_${part}`)),
  ...HUD_DRAWN_TILE_NAMES,
];
/** The pattern of each HUD part tile by name. */
export const HUD_TILES: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(HUD_TILE_NAMES.map((name, i) => [name, FONT_PATTERNS + i])),
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
      const first = before ? before.first + before.frames * FRAME_PATTERNS : FONT_PATTERNS + HUD_TILE_NAMES.length;
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
        readPatternSymbols(
          readRecord(value, path, ['indices']).indices,
          `${path}/indices`,
          TEXT_TILE_SIZE * TEXT_TILE_SIZE,
        ),
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
   * Admitted 8x8 patterns, at least the fonts', HUD part and HUD picture patterns with an empty space, and the named and
   * HUD picture 16-color palettes.
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
        'Text tiles need every font, HUD part and HUD picture as 8x8 patterns, an empty space and their palettes',
      );
    this.#patterns = patterns;
    this.#palettes = new Uint16Array(palettes.length * 16);
    palettes.forEach((palette, id) => this.#palettes.set(palette, id << 4));
    this.patternCount = patterns.length;
    this.paletteCount = palettes.length;
    Object.freeze(this);
  }

  /**
   * The pattern of each character of `text` in row `row` of `font`; a character without a pattern is a RangeError.
   */
  encode(text: string, font: TextFont = 'normal', row = 0): number[] {
    const { first, rows } = TEXT_FONTS[font];
    if (!Number.isInteger(row) || row < 0 || row >= rows) throw new RangeError(`${font} has no row ${row}`);
    const base = first + row * CHARACTER_COUNT,
      result: number[] = [];
    for (const character of text) {
      const pattern = CHARACTER_PATTERNS.get(character);
      if (pattern === undefined) throw new RangeError(`No text tile for ${JSON.stringify(character)}`);
      result.push(base + pattern);
    }
    return result;
  }

  /** A named palette's main color (slot 1), for pixels drawn beside the text in its colors. */
  mainColor(palette: number): number {
    if (!Number.isInteger(palette) || palette < 0 || palette >= this.paletteCount)
      throw new RangeError('unknown text palette');
    return this.#palettes[(palette << 4) + 1]!;
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
