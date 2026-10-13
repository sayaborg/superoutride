import { admit, readArray, readRecord, requireAdmission } from '../../src/core/admission.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { readPatternSymbols } from '../../src/image/indexed-image.js';
import { TEXT_CHARACTER_ORDER, TEXT_TILE_SIZE } from '../../src/image/text-tiles.js';
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
