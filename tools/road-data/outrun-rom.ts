import { programImage, spriteWordSets, tilePlanes } from './rom-images.js';
import type { Rom, RomSet } from './rom-set.js';

/** The ROMs' sizes: a program's half, a tile ROM, a sprite ROM, the road ROM, a sound ROM. */
const ROM_SIZE = 0x10000;
const TILE_ROM_SIZE = 0x8000;
const SPRITE_ROM_SIZE = 0x20000;
const ROAD_ROM_SIZE = 0x8000;
export const SOUND_ROM_SIZE = 0x8000;

/**
 * The program ROMs of MAME's `outrun` (Rev. B) that hold the road data ([OUTRUN road data](../../docs/outrun-road-data.md)):
 * for each CPU, pairs of 64 KiB ROMs, one holding the even bytes and one the odd bytes of a 128 KiB half of its program.
 */
export const OUTRUN_PROGRAM_ROMS = Object.freeze({
  main: [
    {
      even: { name: 'epr-10380b.133', size: ROM_SIZE, crc: 0x1f6cadad },
      odd: { name: 'epr-10382b.118', size: ROM_SIZE, crc: 0xc4c3fa1a },
    },
    {
      even: { name: 'epr-10381b.132', size: ROM_SIZE, crc: 0xbe8c412b },
      odd: { name: 'epr-10383b.117', size: ROM_SIZE, crc: 0x10a2014a },
    },
  ],
  sub: [
    {
      even: { name: 'epr-10327a.76', size: ROM_SIZE, crc: 0xe28a5baf },
      odd: { name: 'epr-10329a.58', size: ROM_SIZE, crc: 0xda131c81 },
    },
    {
      even: { name: 'epr-10328a.75', size: ROM_SIZE, crc: 0xd5ec5e5d },
      odd: { name: 'epr-10330a.57', size: ROM_SIZE, crc: 0xba9ec82a },
    },
  ],
} as const);

/** The ROMs the dump records: the programs', even before odd. */
export const OUTRUN_DUMP_ROMS: readonly Rom[] = Object.freeze(
  [...OUTRUN_PROGRAM_ROMS.main, ...OUTRUN_PROGRAM_ROMS.sub].flatMap(({ even, odd }) => [even, odd]),
);

/** The two CPUs' programs as each CPU addresses them. */
export interface OutrunPrograms {
  readonly main: Uint8Array;
  readonly sub: Uint8Array;
}

/** The main and sub CPUs' programs from the ROM set. */
export function assemblePrograms(set: RomSet): OutrunPrograms {
  return { main: programImage(set, OUTRUN_PROGRAM_ROMS.main), sub: programImage(set, OUTRUN_PROGRAM_ROMS.sub) };
}

/** The tile ROMs: three bit planes, each two 32 KiB ROMs (tiles 0–4095, then 4096–8191), the lowest bit first. */
export const OUTRUN_TILE_ROMS = Object.freeze([
  [
    { name: 'opr-10268.99', size: TILE_ROM_SIZE, crc: 0x95344b04 },
    { name: 'opr-10232.102', size: TILE_ROM_SIZE, crc: 0x776ba1eb },
  ],
  [
    { name: 'opr-10267.100', size: TILE_ROM_SIZE, crc: 0xa85bb823 },
    { name: 'opr-10231.103', size: TILE_ROM_SIZE, crc: 0x8908bcbf },
  ],
  [
    { name: 'opr-10266.101', size: TILE_ROM_SIZE, crc: 0x9f6f1a74 },
    { name: 'opr-10230.104', size: TILE_ROM_SIZE, crc: 0x686f5e50 },
  ],
] as const);

/** The tile ROMs' three bit planes, each 8 bytes a tile (a byte a row, its bit 7 the leftmost pixel). */
export const assembleTiles = (set: RomSet): readonly Uint8Array[] => tilePlanes(set, OUTRUN_TILE_ROMS);

/** The sprite ROMs: two sets of four, each ROM one byte of a 32-bit word, the least significant first. */
export const OUTRUN_SPRITE_ROMS = Object.freeze([
  [
    { name: 'mpr-10371.9', size: SPRITE_ROM_SIZE, crc: 0x7cc86208 },
    { name: 'mpr-10373.10', size: SPRITE_ROM_SIZE, crc: 0xb0d26ac9 },
    { name: 'mpr-10375.11', size: SPRITE_ROM_SIZE, crc: 0x59b60bd7 },
    { name: 'mpr-10377.12', size: SPRITE_ROM_SIZE, crc: 0x17a1b04a },
  ],
  [
    { name: 'mpr-10372.13', size: SPRITE_ROM_SIZE, crc: 0xb557078c },
    { name: 'mpr-10374.14', size: SPRITE_ROM_SIZE, crc: 0x8051e517 },
    { name: 'mpr-10376.15', size: SPRITE_ROM_SIZE, crc: 0xf3b8f318 },
    { name: 'mpr-10378.16', size: SPRITE_ROM_SIZE, crc: 0xa1062984 },
  ],
] as const);

/** The sprite ROMs' words (`spriteWords`: .9 and .13 the lowest bytes, .12 and .16 the highest), set 1's after set 0's. */
export const assembleSprites = (set: RomSet): Uint32Array => spriteWordSets(set, OUTRUN_SPRITE_ROMS);

/**
 * The road ROM: 256 lines of 512 pixels, two bit planes of 64 bytes a line one after the other, 32 KiB.
 */
export const OUTRUN_ROAD_ROM = Object.freeze({ name: 'opr-10185.11', size: ROAD_ROM_SIZE, crc: 0x22794426 });

/** The sound program, and the PCM ROMs by bank: each 32 KiB, a bank's 64 KiB holding it twice. */
export const OUTRUN_SOUND_ROMS = Object.freeze({
  program: { name: 'epr-10187.88', size: SOUND_ROM_SIZE, crc: 0xa10abaa9 },
  pcm: [
    { name: 'opr-10193.66', size: SOUND_ROM_SIZE, crc: 0xbcd10dde },
    { name: 'opr-10192.67', size: SOUND_ROM_SIZE, crc: 0x770f1270 },
    { name: 'opr-10191.68', size: SOUND_ROM_SIZE, crc: 0x20a284ab },
    { name: 'opr-10190.69', size: SOUND_ROM_SIZE, crc: 0x7cab70e2 },
    { name: 'opr-10189.70', size: SOUND_ROM_SIZE, crc: 0x01366b54 },
    { name: 'opr-10188.71', size: SOUND_ROM_SIZE, crc: 0xbad30ad9 },
  ],
} as const);

/** The sound program and the PCM banks from the ROM set. */
export function assembleSound(set: RomSet) {
  return { program: set.data(OUTRUN_SOUND_ROMS.program), banks: OUTRUN_SOUND_ROMS.pcm.map((rom) => set.data(rom)) };
}
