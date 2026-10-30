import { programImage, spriteWordSets, tilePlanes } from '../sega-16/rom-images.js';
import { romRecords, type RomSet, type RomSource } from '../rom-set.js';

/** Where TURBO OUTRUN's ROMs come from: MAME's `toutrun` ([Development](../../../docs/development.md#road-data-commands)). */
export const TURBO_OUTRUN_ROMS: RomSource = Object.freeze({
  original: 'turbo-outrun',
  sets: Object.freeze(['toutrun']),
});

/** The ROMs' sizes: a program's byte ROM, the road ROM, a tile ROM, a sprite ROM. */
const PROGRAM_ROM_SIZE = 0x10000;
const ROAD_ROM_SIZE = 0x8000;
const TILE_ROM_SIZE = 0x10000;
const SPRITE_ROM_SIZE = 0x20000;

/**
 * The program ROMs of MAME's `toutrun` (Turbo Out Run, the Out Run upgrade, FD1094 317-0118)
 * ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md)): for each CPU, pairs of 64 KiB ROMs, one holding
 * the even bytes and one the odd bytes of a 128 KiB part of its program. The main CPU's program is encrypted for
 * instruction fetches alone: its tables are its ROMs' bytes as they are, and it is never decrypted.
 */
export const TURBO_OUTRUN_PROGRAM_ROMS = Object.freeze({
  main: [
    {
      even: { name: 'epr-12513.133', size: PROGRAM_ROM_SIZE, crc: 0xae8835a5 },
      odd: { name: 'epr-12512.118', size: PROGRAM_ROM_SIZE, crc: 0xf90372ad },
    },
    {
      even: { name: 'epr-12515.132', size: PROGRAM_ROM_SIZE, crc: 0x1f047df4 },
      odd: { name: 'epr-12514.117', size: PROGRAM_ROM_SIZE, crc: 0x5539e9c3 },
    },
    {
      even: { name: 'epr-12293.131', size: PROGRAM_ROM_SIZE, crc: 0xf4321eea },
      odd: { name: 'epr-12292.116', size: PROGRAM_ROM_SIZE, crc: 0x51d98af0 },
    },
  ],
  sub: [
    {
      even: { name: 'opr-12295.76', size: PROGRAM_ROM_SIZE, crc: 0xd43a3a84 },
      odd: { name: 'opr-12294.58', size: PROGRAM_ROM_SIZE, crc: 0x27cdcfd3 },
    },
    {
      even: { name: 'opr-12297.75', size: PROGRAM_ROM_SIZE, crc: 0x1d9b5677 },
      odd: { name: 'opr-12296.57', size: PROGRAM_ROM_SIZE, crc: 0x0a513671 },
    },
  ],
} as const);
/** The road ROM, twice with the same contents: 256 lines of 512 pixels, two bit planes, the second at 0x4000. */
export const TURBO_OUTRUN_ROAD_ROMS = Object.freeze([
  { name: 'epr-12298.11', size: ROAD_ROM_SIZE, crc: 0xfc9bc41b },
  { name: 'epr-12299.47', size: ROAD_ROM_SIZE, crc: 0xfc9bc41b },
] as const);
/** The tile ROMs: three bit planes, the lowest first, 8 bytes a tile. */
export const TURBO_OUTRUN_TILE_ROMS = Object.freeze([
  { name: 'opr-12323.102', size: TILE_ROM_SIZE, crc: 0x4de43a6f },
  { name: 'opr-12324.103', size: TILE_ROM_SIZE, crc: 0x24607a55 },
  { name: 'opr-12325.104', size: TILE_ROM_SIZE, crc: 0x1405137a },
] as const);
/** The sprite ROMs: two sets of four, each ROM one byte of a 32-bit word, the least significant first. */
export const TURBO_OUTRUN_SPRITE_ROMS = Object.freeze([
  [
    { name: 'mpr-12336.9', size: SPRITE_ROM_SIZE, crc: 0xdda465c7 },
    { name: 'mpr-12337.10', size: SPRITE_ROM_SIZE, crc: 0x828233d1 },
    { name: 'mpr-12338.11', size: SPRITE_ROM_SIZE, crc: 0x46b4b5f4 },
    { name: 'mpr-12339.12', size: SPRITE_ROM_SIZE, crc: 0x0d7e3bab },
  ],
  [
    { name: 'mpr-12364.13', size: SPRITE_ROM_SIZE, crc: 0xa4b83e65 },
    { name: 'mpr-12365.14', size: SPRITE_ROM_SIZE, crc: 0x4a80b2a9 },
    { name: 'mpr-12366.15', size: SPRITE_ROM_SIZE, crc: 0x385cb3ab },
    { name: 'mpr-12367.16', size: SPRITE_ROM_SIZE, crc: 0x4930254a },
  ],
] as const);

/** The two CPUs' programs as each CPU addresses them. */
export interface TurboOutrunPrograms {
  readonly main: Uint8Array;
  readonly sub: Uint8Array;
}

/**
 * The main and sub CPUs' programs from the ROM set, assembled as OUTRUN's are and not decrypted. Every ROM the
 * conversion reads (programs, road, tiles, sprites) is found first.
 */
export function assembleTurboOutrunPrograms(set: RomSet): TurboOutrunPrograms {
  for (const rom of TURBO_OUTRUN_ROAD_ROMS) set.data(rom);
  for (const rom of TURBO_OUTRUN_TILE_ROMS) set.data(rom);
  for (const rom of TURBO_OUTRUN_SPRITE_ROMS.flat()) set.data(rom);
  return {
    main: programImage(set, TURBO_OUTRUN_PROGRAM_ROMS.main),
    sub: programImage(set, TURBO_OUTRUN_PROGRAM_ROMS.sub),
  };
}

/** Every ROM the tool reads, the dump's record of them. */
export const turboOutrunRoms = (): Record<string, string> =>
  romRecords([
    ...[...TURBO_OUTRUN_PROGRAM_ROMS.main, ...TURBO_OUTRUN_PROGRAM_ROMS.sub].flatMap(({ even, odd }) => [even, odd]),
    ...TURBO_OUTRUN_ROAD_ROMS,
    ...TURBO_OUTRUN_TILE_ROMS,
    ...TURBO_OUTRUN_SPRITE_ROMS.flat(),
  ]);

/** The sprite ROMs' words (`spriteWords`: .9 and .13 the lowest bytes, .12 and .16 the highest), set 1's after set 0's. */
export const assembleTurboOutrunSprites = (set: RomSet): Uint32Array => spriteWordSets(set, TURBO_OUTRUN_SPRITE_ROMS);

/** The tile ROMs' bit planes, the lowest first, 8 bytes a tile. */
export const assembleTurboOutrunTiles = (set: RomSet): readonly Uint8Array[] => tilePlanes(set, TURBO_OUTRUN_TILE_ROMS);
