import { programImage, spriteWordSets, tilePlanes } from './rom-images.js';
import { romRecords, type RomSet, type RomSource } from './rom-set.js';

/** Where SUPER MONACO GP's ROMs come from: MAME's `smgp` ([Development](../../docs/development.md#road-data-commands)). */
export const SUPER_MONACO_GP_ROMS: RomSource = Object.freeze({
  original: 'super-monaco-gp',
  sets: Object.freeze(['smgp']),
});

/** The X board's program, tile and sprite ROMs' sizes, bytes. */
export const PROGRAM_ROM_SIZE = 0x20000;
const TILE_ROM_SIZE = 0x10000;
const SPRITE_ROM_SIZE = 0x20000;

/**
 * SUPER MONACO GP's ROMs, MAME's `smgp` (Super Monaco GP, World, Rev B, FD1094 317-0126a)
 * ([SUPER MONACO GP road data](../../docs/super-monaco-gp-road-data.md#super-monaco-gps-rom-set)): each CPU's program from a ROM of
 * its even bytes and a ROM of its odd bytes, 128 KiB each. The main CPU's program is encrypted for instruction fetches
 * alone: its tables are its ROMs' bytes as they are, and it is never decrypted. The sub CPU's holds the courses.
 */
export const SUPER_MONACO_GP_PROGRAM_ROMS = Object.freeze({
  main: {
    even: { name: 'epr-12563b.58', size: PROGRAM_ROM_SIZE, crc: 0xbaf1f333 },
    odd: { name: 'epr-12564b.63', size: PROGRAM_ROM_SIZE, crc: 0xb5191af0 },
  },
  sub: {
    even: { name: 'epr-12576a.20', size: PROGRAM_ROM_SIZE, crc: 0x2c9599c1 },
    odd: { name: 'epr-12577a.29', size: PROGRAM_ROM_SIZE, crc: 0xabf9a50b },
  },
} as const);
/** The tile ROMs: three bit planes, the lowest first, 8 bytes a tile. */
export const SUPER_MONACO_GP_TILE_ROMS = Object.freeze([
  { name: 'epr-12429.154', size: TILE_ROM_SIZE, crc: 0x5851e614 },
  { name: 'epr-12430.153', size: TILE_ROM_SIZE, crc: 0x05e00134 },
  { name: 'epr-12431.152', size: TILE_ROM_SIZE, crc: 0x35572f4a },
] as const);
/**
 * The sprite ROMs: four sets of four, each ROM one byte of a 32-bit word, the least significant first; set g's words
 * are banks 2g (their first half) and 2g + 1.
 */
export const SUPER_MONACO_GP_SPRITE_ROMS = Object.freeze([
  [
    { name: 'mpr-12425.90', size: SPRITE_ROM_SIZE, crc: 0x14bf2a15 },
    { name: 'mpr-12426.94', size: SPRITE_ROM_SIZE, crc: 0x28b60dc0 },
    { name: 'mpr-12427.98', size: SPRITE_ROM_SIZE, crc: 0x0a367928 },
    { name: 'mpr-12428.102', size: SPRITE_ROM_SIZE, crc: 0xefa80ad5 },
  ],
  [
    { name: 'mpr-12421.91', size: SPRITE_ROM_SIZE, crc: 0x25f46140 },
    { name: 'mpr-12422.95', size: SPRITE_ROM_SIZE, crc: 0xcb51c8f6 },
    { name: 'mpr-12423.99', size: SPRITE_ROM_SIZE, crc: 0x0be9818e },
    { name: 'mpr-12424.103', size: SPRITE_ROM_SIZE, crc: 0x0ce00dfc },
  ],
  [
    { name: 'mpr-12417.92', size: SPRITE_ROM_SIZE, crc: 0xa806eabf },
    { name: 'mpr-12418.96', size: SPRITE_ROM_SIZE, crc: 0xed1a0f2b },
    { name: 'mpr-12419.100', size: SPRITE_ROM_SIZE, crc: 0xce4568cb },
    { name: 'mpr-12420.104', size: SPRITE_ROM_SIZE, crc: 0x679442eb },
  ],
  [
    { name: 'epr-12609.93', size: SPRITE_ROM_SIZE, crc: 0xa867812f },
    { name: 'epr-12610.97', size: SPRITE_ROM_SIZE, crc: 0x53b99417 },
    { name: 'epr-12611.101', size: SPRITE_ROM_SIZE, crc: 0xbd5c6ab0 },
    { name: 'epr-12612.105', size: SPRITE_ROM_SIZE, crc: 0xac86e890 },
  ],
] as const);

/** The two CPUs' programs as each CPU addresses them. */
export interface SuperMonacoGpPrograms {
  readonly main: Uint8Array;
  readonly sub: Uint8Array;
}

/**
 * The main and sub CPUs' programs, every ROM the conversion reads (programs, tiles, sprites) found by its CRC-32 and
 * size; the main CPU's program is not decrypted.
 */
export function assembleSuperMonacoGpPrograms(set: RomSet): SuperMonacoGpPrograms {
  tilePlanes(set, SUPER_MONACO_GP_TILE_ROMS);
  spriteWordSets(set, SUPER_MONACO_GP_SPRITE_ROMS);
  return {
    main: programImage(set, [SUPER_MONACO_GP_PROGRAM_ROMS.main]),
    sub: programImage(set, [SUPER_MONACO_GP_PROGRAM_ROMS.sub]),
  };
}

/** Every ROM the tool reads, the dump's record of them. */
export const superMonacoGpRoms = (): Record<string, string> =>
  romRecords([
    ...[SUPER_MONACO_GP_PROGRAM_ROMS.main, SUPER_MONACO_GP_PROGRAM_ROMS.sub].flatMap(({ even, odd }) => [even, odd]),
    ...SUPER_MONACO_GP_TILE_ROMS,
    ...SUPER_MONACO_GP_SPRITE_ROMS.flat(),
  ]);

/** The sprite ROMs' words (`spriteWords`), set after set: banks of 0x10000 words, OUTRUN's. */
export const assembleSuperMonacoGpSprites = (set: RomSet): Uint32Array =>
  spriteWordSets(set, SUPER_MONACO_GP_SPRITE_ROMS);

/** The tile ROMs' bit planes, the lowest first, 8 bytes a tile. */
export const assembleSuperMonacoGpTiles = (set: RomSet): readonly Uint8Array[] =>
  tilePlanes(set, SUPER_MONACO_GP_TILE_ROMS);
