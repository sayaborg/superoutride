import { admit, readArray, readRecord, requireAdmission } from '../../src/core/admission.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { readIndexedPalette, readPatternSymbols } from '../../src/image/indexed-image.js';
import {
  ARROW_TILES,
  DIGIT_TILES,
  LAMP_TILES,
  TEXT_CHARACTER_ORDER,
  TEXT_TILE_SIZE,
} from '../../src/image/text-tiles.js';
import type { ContentStore } from '../authoring/content-store.js';

/**
 * The HUD design sources: the drawn pixels of the fonts and HUD parts, saved as given under
 * `content/hud-design-sources/`. They are production-only data, which the build does not deliver; the HUD tiles command
 * reads them.
 */
export const HUD_DESIGN_SOURCES_DIRECTORY = 'hud-design-sources';
const TILE_PIXELS = TEXT_TILE_SIZE * TEXT_TILE_SIZE;
/** The printable ASCII characters, a source's `ascii` list, and the marks after them, its `extra` list. */
const ASCII_COUNT = 0x7f - 0x20;

/** One 8-by-8 pattern's palette slots, each at most `maxSlot`. */
const readTile = (value: unknown, path: string, maxSlot: number) =>
  readPatternSymbols(value, path, TILE_PIXELS, {
    test: (symbol) => symbol <= maxSlot,
    message: `Expected palette slots 0 to ${maxSlot}`,
  });

/**
 * A list of character entries with these fields, the text tiles' characters from `first` in their order: each entry's
 * `char` must be the character at its place.
 */
function readCharacters<T>(
  value: unknown,
  path: string,
  first: number,
  count: number,
  fields: readonly string[],
  read: (record: Record<string, unknown>, path: string, character: string) => T,
): readonly T[] {
  const entries = readArray(value, path, (entry) => entry, { length: count });
  return Object.freeze(
    entries.map((entry, i) => {
      const at = `${path}/${i}`,
        record = readRecord(entry, at, fields),
        character = TEXT_CHARACTER_ORDER[first + i]!;
      requireAdmission(
        record.char === character,
        'invalid_value',
        `${at}/char`,
        `Expected ${JSON.stringify(character)}`,
      );
      return read(record, at, character);
    }),
  );
}

/** A record of source palettes with exactly these names. */
function readSourcePalettes(
  value: unknown,
  path: string,
  names: readonly string[],
): Readonly<Record<string, readonly number[]>> {
  const record = readRecord(value, path, names);
  return Object.freeze(
    Object.fromEntries(names.map((name) => [name, readIndexedPalette(record[name], `${path}/${name}`)])),
  );
}

async function readSource(store: ContentStore, name: string): Promise<{ path: string; value: unknown }> {
  const file = `${HUD_DESIGN_SOURCES_DIRECTORY}/${name}`;
  return { path: `content/${file}`, value: JSON.parse(new TextDecoder().decode(await store.read(file))) as unknown };
}

/**
 * The normal 8-by-8 font, one pattern per character in the text tiles' character order: slot 1 the ink, 2 its shadow.
 * Its `ascii` list holds the printable ASCII characters and `extra` the marks, each with its code point.
 */
export async function readNormalFont(store: ContentStore): Promise<readonly (readonly number[])[]> {
  const { path, value } = await readSource(store, 'font-normal-patterns.json');
  return requireLoaded(
    admit(path, () => {
      const document = readRecord(value, '', ['note', 'ascii', 'extra']);
      const ascii = readCharacters(document.ascii, '/ascii', 0, ASCII_COUNT, ['char', 'indices'], (record, at) =>
        readTile(record.indices, `${at}/indices`, 2),
      );
      const extra = readCharacters(
        document.extra,
        '/extra',
        ASCII_COUNT,
        TEXT_CHARACTER_ORDER.length - ASCII_COUNT,
        ['char', 'codePoint', 'indices'],
        (record, at, character) => {
          const codePoint = `U+${character.codePointAt(0)!.toString(16).toUpperCase()}`;
          requireAdmission(record.codePoint === codePoint, 'invalid_value', `${at}/codePoint`, `Expected ${codePoint}`);
          return readTile(record.indices, `${at}/indices`, 2);
        },
      );
      return Object.freeze([...ascii, ...extra]);
    }),
  );
}

/** The ornate fonts: small, one pattern per character, and large, a top and a bottom pattern per character. */
export interface OrnateFontSource {
  /** Slots 1 to 7 the ink by row, 8 the shadow. */
  readonly small: readonly (readonly number[])[];
  /** Slots 1 to 8 the ink by row within each tile, 9 the shadow. */
  readonly large: readonly { readonly top: readonly number[]; readonly bottom: readonly number[] }[];
  /** The SUNSET style's palettes. */
  readonly palettes: {
    readonly smallSunset: readonly number[];
    readonly largeSunsetTop: readonly number[];
    readonly largeSunsetBottom: readonly number[];
  };
}

const SUNSET_PALETTES = ['smallSunset', 'largeSunsetTop', 'largeSunsetBottom'];
const palettes = (read: Readonly<Record<string, readonly number[]>>): OrnateFontSource['palettes'] =>
  Object.freeze({
    smallSunset: read.smallSunset!,
    largeSunsetTop: read.largeSunsetTop!,
    largeSunsetBottom: read.largeSunsetBottom!,
  });

/** The ornate fonts, each in the text tiles' character order, and the SUNSET style's palettes. */
export async function readOrnateFonts(store: ContentStore): Promise<OrnateFontSource> {
  const { path, value } = await readSource(store, 'font-ornate-patterns.json');
  return requireLoaded(
    admit(path, () => {
      const document = readRecord(value, '', ['note', 'small', 'large', 'palettes']);
      const count = TEXT_CHARACTER_ORDER.length;
      return Object.freeze({
        small: readCharacters(document.small, '/small', 0, count, ['char', 'indices'], (record, at) =>
          readTile(record.indices, `${at}/indices`, 8),
        ),
        large: readCharacters(document.large, '/large', 0, count, ['char', 'top', 'bottom'], (record, at) =>
          Object.freeze({
            top: readTile(record.top, `${at}/top`, 9),
            bottom: readTile(record.bottom, `${at}/bottom`, 9),
          }),
        ),
        palettes: palettes(readSourcePalettes(document.palettes, '/palettes', SUNSET_PALETTES)),
      });
    }),
  );
}

/** The segment digits 0 to 9 and then OFF, in the text tiles' order of `DIGIT_d_k`. */
const SEGMENT_DIGITS = Object.freeze([...'0123456789'.split(''), 'OFF']);

/** The italic segment digits and their palettes. */
export interface SegmentDigitsSource {
  /** Each digit's 2-by-3 tiles row by row: slot 1 the lit core, 2 the lit edge, 3 the unlit core, 4 the unlit edge. */
  readonly digits: readonly (readonly (readonly number[])[])[];
  readonly palettes: {
    readonly VFD: readonly number[];
    readonly YELLOW: readonly number[];
    readonly RED: readonly number[];
  };
}

/** The italic segment digits, 0 to 9 and OFF, each 2 by 3 tiles, and the VFD, YELLOW and RED palettes. */
export async function readSegmentDigits(store: ContentStore): Promise<SegmentDigitsSource> {
  const { path, value } = await readSource(store, 'seg-digits.json');
  return requireLoaded(
    admit(path, () => {
      const document = readRecord(value, '', ['note', 'digits', 'palettes']);
      const digits = readArray(document.digits, '/digits', (entry) => entry, { length: SEGMENT_DIGITS.length }).map(
        (entry, i) => {
          const at = `/digits/${i}`,
            record = readRecord(entry, at, ['digit', 'tiles']);
          requireAdmission(
            record.digit === SEGMENT_DIGITS[i],
            'invalid_value',
            `${at}/digit`,
            `Expected ${SEGMENT_DIGITS[i]}`,
          );
          return readArray(record.tiles, `${at}/tiles`, (tile, tilePath) => readTile(tile, tilePath, 4), {
            length: DIGIT_TILES.columns * DIGIT_TILES.rows,
          });
        },
      );
      const read = readSourcePalettes(document.palettes, '/palettes', ['VFD', 'YELLOW', 'RED']);
      return Object.freeze({
        digits: Object.freeze(digits),
        palettes: Object.freeze({ VFD: read.VFD!, YELLOW: read.YELLOW!, RED: read.RED! }),
      });
    }),
  );
}

/** The signal lamp: one pattern set, 2 by 2 tiles row by row, whose palette gives its state. */
export interface LampSource {
  /** Slot 1 the outline, 4 to 6 the bezel dark to light, 7 to 12 the lens dark edge to hot centre, 13 the specular and
   * 15 the inner glow rim. */
  readonly tiles: readonly (readonly number[])[];
  readonly palettes: {
    readonly OFF: readonly number[];
    readonly RED_ON: readonly number[];
    readonly GREEN_ON: readonly number[];
  };
}

/** The signal lamp and its OFF, RED_ON and GREEN_ON palettes. */
export async function readLamp(store: ContentStore): Promise<LampSource> {
  const { path, value } = await readSource(store, 'lamp.json');
  return requireLoaded(
    admit(path, () => {
      const document = readRecord(value, '', ['note', 'tiles', 'palettes']);
      const read = readSourcePalettes(document.palettes, '/palettes', ['RED_ON', 'GREEN_ON', 'OFF']);
      return Object.freeze({
        tiles: readArray(document.tiles, '/tiles', (tile, at) => readTile(tile, at, 15), {
          length: LAMP_TILES * LAMP_TILES,
        }),
        palettes: Object.freeze({ OFF: read.OFF!, RED_ON: read.RED_ON!, GREEN_ON: read.GREEN_ON! }),
      });
    }),
  );
}

/** The road arrow, 4 by 4 tiles row by row pointing left and right, and its palette. */
export interface ArrowSource {
  /** Slot 1 the outline, 2 the shadow and 3 to 10 the gradient from the top. */
  readonly left: readonly (readonly number[])[];
  readonly right: readonly (readonly number[])[];
  readonly palette: readonly number[];
}

/** The road arrow, a triple chevron pointing left and right, and its palette. */
export async function readArrow(store: ContentStore): Promise<ArrowSource> {
  const { path, value } = await readSource(store, 'arrow.json');
  return requireLoaded(
    admit(path, () => {
      const document = readRecord(value, '', ['note', 'left', 'right', 'palette']);
      const side = (key: 'left' | 'right') =>
        readArray(document[key], `/${key}`, (tile, at) => readTile(tile, at, 10), {
          length: ARROW_TILES * ARROW_TILES,
        });
      return Object.freeze({
        left: side('left'),
        right: side('right'),
        palette: readIndexedPalette(document.palette, '/palette'),
      });
    }),
  );
}
