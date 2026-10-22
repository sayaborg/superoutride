import { interleave } from './program-words.js';
import { PROGRAM_ROM_SIZE, romData, xBoardSpriteWords, xBoardTiles, type Rom } from './super-monaco-gp-rom.js';
import type { ZipFile } from './zip.js';

/** MAME's name of the set, for the refusal of another. */
const SET = 'rachero';

/**
 * RACING HERO's ROMs, MAME's `rachero` (Racing Hero, FD1094 317-0144)
 * ([Original road data](../../docs/original-road-data.md#racing-heros-rom-set)): each CPU's program from ROMs of its
 * even bytes and of its odd bytes, 128 KiB each, the main CPU's in two halves (0x00000 and 0x40000). The main CPU's
 * program is encrypted for instruction fetches alone: its tables are its ROMs' bytes as they are, and it is never
 * decrypted. It holds every table the conversion reads.
 */
export const RACING_HERO_PROGRAM_ROMS = Object.freeze({
  main: [
    { even: { name: 'epr-13129.ic58', crc: 0xad9f32e7 }, odd: { name: 'epr-13130.ic63', crc: 0x6022777b } },
    { even: { name: 'epr-12855.ic57', crc: 0xcecf1e73 }, odd: { name: 'epr-12856.ic62', crc: 0xda900ebb } },
  ],
  sub: { even: { name: 'epr-12857.ic20', crc: 0x8a2328cc }, odd: { name: 'epr-12858.ic29', crc: 0x38a248b7 } },
} as const);
/** The tile ROMs: three bit planes, the lowest first, 8 bytes a tile. */
export const RACING_HERO_TILE_ROMS = Object.freeze([
  { name: 'epr-12879.ic154', crc: 0xc1a9de7a },
  { name: 'epr-12880.ic153', crc: 0x27ff04a5 },
  { name: 'epr-12881.ic152', crc: 0x72f14491 },
] as const);
/**
 * The sprite ROMs: four sets of four, each ROM one byte of a 32-bit word, the least significant first; set g's words
 * are banks 2g and 2g + 1.
 */
export const RACING_HERO_SPRITE_ROMS = Object.freeze([
  [
    { name: 'epr-12872.ic90', crc: 0x68d56139 },
    { name: 'epr-12873.ic94', crc: 0x3d3ec450 },
    { name: 'epr-12874.ic98', crc: 0x7d6bde23 },
    { name: 'epr-12875.ic102', crc: 0xe33092bf },
  ],
  [
    { name: 'epr-12868.ic91', crc: 0x96289583 },
    { name: 'epr-12869.ic95', crc: 0x2ef0de02 },
    { name: 'epr-12870.ic99', crc: 0xc76630e1 },
    { name: 'epr-12871.ic103', crc: 0x23401b1a },
  ],
  [
    { name: 'epr-12864.ic92', crc: 0x77d6cff4 },
    { name: 'epr-12865.ic96', crc: 0x1e7e685b },
    { name: 'epr-12866.ic100', crc: 0xfdf31329 },
    { name: 'epr-12867.ic104', crc: 0xb25e37fd },
  ],
  [
    { name: 'epr-12860.ic93', crc: 0x86b64119 },
    { name: 'epr-12861.ic97', crc: 0xbccff19b },
    { name: 'epr-12862.ic101', crc: 0x7d4c3b05 },
    { name: 'epr-12863.ic105', crc: 0x85095053 },
  ],
] as const);

const hex = (value: number) => value.toString(16).padStart(8, '0');

/**
 * The main CPU's program as it addresses it, every ROM the conversion reads (programs, tiles, sprites) found by its
 * CRC-32 and size; it is not decrypted. The sub CPU's program holds no table the conversion reads: its ROMs are checked
 * alone.
 */
export function assembleRacingHeroMain(files: ReadonlyMap<number, ZipFile>): Uint8Array {
  xBoardTiles(files, RACING_HERO_TILE_ROMS, SET);
  xBoardSpriteWords(files, RACING_HERO_SPRITE_ROMS, SET);
  const half = ({ even, odd }: { readonly even: Rom; readonly odd: Rom }) =>
    interleave(romData(files, even, PROGRAM_ROM_SIZE, SET), romData(files, odd, PROGRAM_ROM_SIZE, SET));
  half(RACING_HERO_PROGRAM_ROMS.sub);
  const halves = RACING_HERO_PROGRAM_ROMS.main.map(half);
  const main = new Uint8Array(2 * PROGRAM_ROM_SIZE * halves.length);
  halves.forEach((h, k) => main.set(h, 2 * PROGRAM_ROM_SIZE * k));
  return main;
}

/** Every ROM the tool reads, by its name in MAME's set, with its CRC-32 as eight hex digits. */
export const racingHeroRoms = (): Record<string, string> =>
  Object.fromEntries(
    [
      ...[...RACING_HERO_PROGRAM_ROMS.main, RACING_HERO_PROGRAM_ROMS.sub].flatMap(({ even, odd }) => [even, odd]),
      ...RACING_HERO_TILE_ROMS,
      ...RACING_HERO_SPRITE_ROMS.flat(),
    ].map(({ name, crc }) => [name, hex(crc)]),
  );

/** The sprite ROMs' words, set after set: banks of 0x10000 words, OUTRUN's. */
export const assembleRacingHeroSprites = (files: ReadonlyMap<number, ZipFile>): Uint32Array =>
  xBoardSpriteWords(files, RACING_HERO_SPRITE_ROMS, SET);

/** The tile ROMs' bit planes, the lowest first, 8 bytes a tile. */
export const assembleRacingHeroTiles = (files: ReadonlyMap<number, ZipFile>): readonly Uint8Array[] =>
  xBoardTiles(files, RACING_HERO_TILE_ROMS, SET);
