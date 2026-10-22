/**
 * RACING HERO's backgrounds as its main program holds them
 * ([Original road data](../../docs/original-road-data.md#racing-heros-backgrounds)): each country's background number,
 * its command list of layers and their blocks of tiles, the tiles' palettes with the palette sets that load them, and
 * the sky's colors.
 */
import { entries, long, sword, word } from './program-words.js';

/** The background numbers: a word a country, by its first section's description, from 0x518C. */
const BACKGROUND_NUMBERS = 0x518c;
const BACKGROUND_NUMBER_COUNT = 16;
/** The command lists: a long a background number, from 0x40000. */
const COMMAND_LISTS = 0x40000;

/** Country `section`'s background number. */
export const backgroundNumber = (main: Uint8Array, section: number) => word(main, BACKGROUND_NUMBERS + 2 * section);
/** Every country's background number, by its first section's description. */
export const readBackgroundNumbers = (main: Uint8Array) =>
  Array.from({ length: BACKGROUND_NUMBER_COUNT }, (_, k) => backgroundNumber(main, k));

/** A layer's kinds: 4 on the front plane (tile pages 1–4), 8 on the back plane (pages 5–8). */
export const FRONT = 4;
export const BACK = 8;
/** A block is 8 tiles across. */
export const BLOCK_COLUMNS = 8;
/** No layer has more blocks or a block more rows than these. */
const MOST_BLOCKS = 64;
const MOST_ROWS = 64;

/** A block of tiles: its rows of 8 tile words, the top first, its first word as it is (not read by the program). */
export interface Block {
  readonly first: number;
  readonly rows: readonly (readonly number[])[];
}

/** A layer scrolling across: its plane, its bottom row (of the plane's 0–63), its speed and its blocks left to right. */
export interface Layer {
  readonly kind: typeof FRONT | typeof BACK;
  readonly bottom: number;
  readonly speed: number;
  readonly blocks: readonly Block[];
}

/**
 * Background `number`'s command list: commands {word kind, word bottom row, word speed, long blocks} up to a kind of
 * 0, the blocks a list of longs up to 0, each block {word, word rows h, h rows of 8 tile words}. Only kinds 4 and 8 are
 * read; RACING HERO's lists use no other.
 */
export function readCommandList(main: Uint8Array, number: number): Layer[] {
  const address = long(main, COMMAND_LISTS + 4 * number);
  return entries(
    address,
    10,
    (a) => word(main, a) === 0,
    (a): Layer => {
      const kind = word(main, a);
      if (kind !== FRONT && kind !== BACK)
        throw new RangeError(`Background ${number}'s command at 0x${a.toString(16)} is of kind ${kind}, not read`);
      const blocks: Block[] = [];
      for (let b = long(main, a + 6); long(main, b) !== 0; b += 4) {
        if (blocks.length >= MOST_BLOCKS) throw new RangeError(`Background ${number}'s layer has no end`);
        const block = long(main, b);
        const height = word(main, block + 2);
        if (height < 1 || height > MOST_ROWS) throw new RangeError(`The block at 0x${block.toString(16)} is no block`);
        blocks.push({
          first: word(main, block),
          rows: Array.from({ length: height }, (_, r) =>
            Array.from({ length: BLOCK_COLUMNS }, (_, c) => word(main, block + 4 + 2 * (BLOCK_COLUMNS * r + c))),
          ),
        });
      }
      return { kind, bottom: word(main, a + 2), speed: word(main, a + 4), blocks };
    },
  );
}

/** The tiles' palette words 0x1C00–0x1FFF as power on loads them: a word each from 0x3A008. */
const TILE_PALETTE_WORDS = 0x3a008;
export const TILE_PALETTE_FIRST = 0x1c00;
const TILE_PALETTE_COUNT = 0x400;
export const readTilePaletteWords = (main: Uint8Array) =>
  Array.from({ length: TILE_PALETTE_COUNT }, (_, k) => word(main, TILE_PALETTE_WORDS + 2 * k));

/** The palette sets: the long at 0x3A000 points to a list of words, set n's at 2n plus that word. */
const PALETTE_SETS = 0x3a000;
/** No set holds more commands. */
const MOST_COMMANDS = 64;

/** A palette set's command, as the program runs it in order. */
export type PaletteCommand =
  | { readonly copy: number; readonly from: number; readonly to: number }
  | { readonly fill: number; readonly count: number; readonly to: number }
  | { readonly repeat: number; readonly size: number; readonly from: number; readonly to: number }
  | { readonly motion: number };

const FILL = 0xff00;
const REPEAT = 0xc000;
const MOTION = 0x8000;

/**
 * Palette set `n`'s commands up to a word 0: 1–0x7FFF copy that many words {long from, long to}; 0xFF00 fills {word
 * value, word count, long to}; another word from 0xC000 repeats a block (word & 0x3FF times) {word size, long from, long
 * to}; 0x8000–0xBFFF start a palette motion of number word − 0x8000. A `to` is a palette RAM address, 0x120000 plus
 * twice the palette word.
 */
export function readPaletteSet(main: Uint8Array, n: number): PaletteCommand[] {
  const list = long(main, PALETTE_SETS);
  const commands: PaletteCommand[] = [];
  for (let a = list + 2 * n + sword(main, list + 2 * n); ;) {
    const w = word(main, a);
    if (w === 0) return commands;
    if (commands.length >= MOST_COMMANDS) throw new RangeError(`Palette set ${n} has no end`);
    if (w < MOTION) {
      commands.push({ copy: w, from: long(main, a + 2), to: long(main, a + 6) });
      a += 10;
    } else if (w === FILL) {
      commands.push({ fill: word(main, a + 2), count: word(main, a + 4), to: long(main, a + 6) });
      a += 10;
    } else if (w >= REPEAT) {
      commands.push({ repeat: w & 0x3ff, size: word(main, a + 2), from: long(main, a + 4), to: long(main, a + 8) });
      a += 12;
    } else {
      commands.push({ motion: w - MOTION });
      a += 2;
    }
  }
}

/** The sky's colors: 64 words each, for the blue, grey and orange skies. */
export const SKY_COLORS = Object.freeze({ blue: 0x3f4fa, grey: 0x3f5fa, orange: 0x3f67a } as const);
const SKY_COLOR_COUNT = 64;
export const readSkyColors = (main: Uint8Array, address: number) =>
  Array.from({ length: SKY_COLOR_COUNT }, (_, k) => word(main, address + 2 * k));

/** The palette motion numbers that choose the sprites' palette set for palettes 0x80–0xFF. */
const MOTION_SETS: ReadonlyMap<number, 'A' | 'B'> = new Map([
  [2, 'A'],
  [1, 'B'],
]);

/** Country `section`'s sprite palette set: its background's palette set's palette motion number's. */
export function spritePaletteSet(main: Uint8Array, section: number): 'A' | 'B' {
  const motions = readPaletteSet(main, backgroundNumber(main, section) + 1).flatMap((c) =>
    'motion' in c ? [c.motion] : [],
  );
  const set = motions.length === 1 ? MOTION_SETS.get(motions[0]!) : undefined;
  if (!set) throw new RangeError(`Country ${section}'s palette set starts no known palette motion`);
  return set;
}
