import { romDiffers } from '../shared/conversion-errors.js';
import { programImage, tilePlanes } from '../sega-16/rom-images.js';
import { romRecords, type RomSet, type RomSource } from '../shared/rom-set.js';

/** Where SUPER HANG-ON's ROMs come from: MAME's `shangon` ([Development](../../../docs/development.md#road-data-commands)). */
export const SUPER_HANG_ON_ROMS: RomSource = Object.freeze({
  original: 'super-hang-on',
  sets: Object.freeze(['shangon']),
});

/** The ROMs' sizes: a program's half's byte ROM, a sprite ROM, a tile ROM, the road ROM. */
const PROGRAM_ROM_SIZE = 0x10000;
const SPRITE_ROM_SIZE = 0x20000;
const TILE_ROM_SIZE = 0x8000;
const ROAD_ROM_SIZE = 0x8000;

/**
 * The program ROMs of MAME's `shangon` (Super Hang-On, sitdown/upright, unprotected) that hold the road data
 * ([SUPER HANG-ON road data](../../../docs/super-hang-on-road-data.md)): for each CPU, pairs of 64 KiB ROMs, one
 * holding the even bytes and one the odd bytes of a 128 KiB half of its program.
 */
export const SUPER_HANG_ON_PROGRAM_ROMS = Object.freeze({
  main: [
    {
      even: { name: 'epr-10886.133', size: PROGRAM_ROM_SIZE, crc: 0x8be3cd36 },
      odd: { name: 'epr-10884.118', size: PROGRAM_ROM_SIZE, crc: 0xcb06150d },
    },
    {
      even: { name: 'epr-10887.132', size: PROGRAM_ROM_SIZE, crc: 0x8d248bb0 },
      odd: { name: 'epr-10885.117', size: PROGRAM_ROM_SIZE, crc: 0x70795f26 },
    },
  ],
  sub: [
    {
      even: { name: 'epr-10792.76', size: PROGRAM_ROM_SIZE, crc: 0x16299d25 },
      odd: { name: 'epr-10790.58', size: PROGRAM_ROM_SIZE, crc: 0x2246cbc1 },
    },
    {
      even: { name: 'epr-10793.75', size: PROGRAM_ROM_SIZE, crc: 0xd9525427 },
      odd: { name: 'epr-10791.57', size: PROGRAM_ROM_SIZE, crc: 0x5faf4cbe },
    },
  ],
} as const);
/** The sprite ROMs: four 256 KiB pairs of 16-bit words, each two ROMs of its even (high) and odd (low) bytes. */
export const SUPER_HANG_ON_SPRITE_ROMS = Object.freeze([
  {
    even: { name: 'mpr-10798.16', size: SPRITE_ROM_SIZE, crc: 0x7d58f807 },
    odd: { name: 'mpr-10794.8', size: SPRITE_ROM_SIZE, crc: 0x7c958e63 },
  },
  {
    even: { name: 'mpr-10799.14', size: SPRITE_ROM_SIZE, crc: 0x96d90d3d },
    odd: { name: 'mpr-10795.6', size: SPRITE_ROM_SIZE, crc: 0xd9d31f8c },
  },
  {
    even: { name: 'mpr-10800.12', size: SPRITE_ROM_SIZE, crc: 0xfeaff98e },
    odd: { name: 'mpr-10796.4', size: SPRITE_ROM_SIZE, crc: 0xfb48957c },
  },
  {
    even: { name: 'mpr-10801.10', size: SPRITE_ROM_SIZE, crc: 0x12781795 },
    odd: { name: 'mpr-10797.2', size: SPRITE_ROM_SIZE, crc: 0x27f2870d },
  },
] as const);
/** The tile ROMs: three bit planes, the lowest first, 8 bytes a tile. */
export const SUPER_HANG_ON_TILE_ROMS = Object.freeze([
  { name: 'epr-10652.54', size: TILE_ROM_SIZE, crc: 0x260286f9 },
  { name: 'epr-10651.55', size: TILE_ROM_SIZE, crc: 0xc609ee7b },
  { name: 'epr-10650.56', size: TILE_ROM_SIZE, crc: 0xb236a403 },
] as const);
/** The road ROM: 256 lines of 512 pixels, two bit planes of 64 bytes a line one after the other. */
export const SUPER_HANG_ON_ROAD_ROM = Object.freeze({ name: 'epr-10642.47', size: ROAD_ROM_SIZE, crc: 0x7836bcc3 });

/** The main CPU's 0x30000–0x3FFFF holds what 0x10000–0x1FFFF holds: the tables are read at the latter. */
const MIRROR = { from: 0x30000, of: 0x10000, length: 0x10000 } as const;

/** The two CPUs' programs as each CPU addresses them. */
export interface SuperHangOnPrograms {
  readonly main: Uint8Array;
  readonly sub: Uint8Array;
}

/**
 * The main and sub CPUs' programs from the ROM set, and the main CPU's
 * mirrored half checked against the half it mirrors.
 */
export function assembleSuperHangOnPrograms(set: RomSet): SuperHangOnPrograms {
  const main = programImage(set, SUPER_HANG_ON_PROGRAM_ROMS.main);
  const mirrored = main.subarray(MIRROR.from, MIRROR.from + MIRROR.length);
  if (!mirrored.every((byte, i) => byte === main[MIRROR.of + i]))
    throw romDiffers("The main CPU's 0x30000–0x3FFFF does not mirror its 0x10000–0x1FFFF");
  return { main, sub: programImage(set, SUPER_HANG_ON_PROGRAM_ROMS.sub) };
}

/** The sprite ROMs' 16-bit words, pair after pair: each word its even ROM's byte over its odd ROM's. */
export function assembleSuperHangOnSprites(set: RomSet): Uint16Array {
  const words = new Uint16Array(SUPER_HANG_ON_SPRITE_ROMS.length * SPRITE_ROM_SIZE);
  SUPER_HANG_ON_SPRITE_ROMS.forEach(({ even, odd }, pair) => {
    const [high, low] = [set.data(even), set.data(odd)];
    for (let i = 0; i < SPRITE_ROM_SIZE; i++) words[pair * SPRITE_ROM_SIZE + i] = (high[i]! << 8) | low[i]!;
  });
  return words;
}

/** The tile ROMs' three bit planes, the lowest first. */
export const assembleSuperHangOnTiles = (set: RomSet): readonly Uint8Array[] =>
  tilePlanes(set, SUPER_HANG_ON_TILE_ROMS);

/** The road ROM's bytes. */
export const superHangOnRoadRom = (set: RomSet) => set.data(SUPER_HANG_ON_ROAD_ROM);

/** Every ROM the tool reads, the dump's record of them. */
export const superHangOnRoms = (): Record<string, string> =>
  romRecords([
    ...[...SUPER_HANG_ON_PROGRAM_ROMS.main, ...SUPER_HANG_ON_PROGRAM_ROMS.sub, ...SUPER_HANG_ON_SPRITE_ROMS].flatMap(
      ({ even, odd }) => [even, odd],
    ),
    ...SUPER_HANG_ON_TILE_ROMS,
    SUPER_HANG_ON_ROAD_ROM,
  ]);
