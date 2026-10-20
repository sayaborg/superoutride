import { requireInput } from '../course/authoring-io.js';
import { interleave } from './program-words.js';
import type { ZipFile } from './zip.js';

/** A ROM by its name in the set and its CRC-32. */
interface Rom {
  readonly name: string;
  readonly crc: number;
}

/**
 * The program ROMs of MAME's `shangon` (Super Hang-On, sitdown/upright, unprotected) that hold the road data
 * ([Original road data](../../docs/original-road-data.md#super-hang-on)): for each CPU, pairs of 64 KiB ROMs, one
 * holding the even bytes and one the odd bytes of a 128 KiB half of its program.
 */
export const SUPER_HANG_ON_PROGRAM_ROMS = Object.freeze({
  main: [
    { even: { name: 'epr-10886.133', crc: 0x8be3cd36 }, odd: { name: 'epr-10884.118', crc: 0xcb06150d } },
    { even: { name: 'epr-10887.132', crc: 0x8d248bb0 }, odd: { name: 'epr-10885.117', crc: 0x70795f26 } },
  ],
  sub: [
    { even: { name: 'epr-10792.76', crc: 0x16299d25 }, odd: { name: 'epr-10790.58', crc: 0x2246cbc1 } },
    { even: { name: 'epr-10793.75', crc: 0xd9525427 }, odd: { name: 'epr-10791.57', crc: 0x5faf4cbe } },
  ],
} as const);
/** The sprite ROMs: four 256 KiB banks of 16-bit words, each two ROMs of its even (high) and odd (low) bytes. */
export const SUPER_HANG_ON_SPRITE_ROMS = Object.freeze([
  { even: { name: 'mpr-10798.16', crc: 0x7d58f807 }, odd: { name: 'mpr-10794.8', crc: 0x7c958e63 } },
  { even: { name: 'mpr-10799.14', crc: 0x96d90d3d }, odd: { name: 'mpr-10795.6', crc: 0xd9d31f8c } },
  { even: { name: 'mpr-10800.12', crc: 0xfeaff98e }, odd: { name: 'mpr-10796.4', crc: 0xfb48957c } },
  { even: { name: 'mpr-10801.10', crc: 0x12781795 }, odd: { name: 'mpr-10797.2', crc: 0x27f2870d } },
] as const);
/** The tile ROMs: three bit planes, the lowest first, 8 bytes a tile. */
export const SUPER_HANG_ON_TILE_ROMS = Object.freeze([
  { name: 'epr-10652.54', crc: 0x260286f9 },
  { name: 'epr-10651.55', crc: 0xc609ee7b },
  { name: 'epr-10650.56', crc: 0xb236a403 },
] as const);
/** The road ROM: 256 lines of 512 pixels, two bit planes of 64 bytes a line one after the other. */
export const SUPER_HANG_ON_ROAD_ROM = Object.freeze({ name: 'epr-10642.47', crc: 0x7836bcc3 });

const PROGRAM_ROM_SIZE = 0x10000;
const SPRITE_ROM_SIZE = 0x20000;
const TILE_ROM_SIZE = 0x8000;
const ROAD_ROM_SIZE = 0x8000;
/** The main CPU's 0x30000–0x3FFFF holds what 0x10000–0x1FFFF holds: the tables are read at the latter. */
const MIRROR = { from: 0x30000, of: 0x10000, length: 0x10000 } as const;

const hex = (value: number) => value.toString(16).padStart(8, '0');

/** A ROM of the set: present, `size` bytes, its CRC-32 the set's. */
function romData(files: ReadonlyMap<string, ZipFile>, rom: Rom, size: number): Uint8Array {
  const file = files.get(rom.name);
  requireInput(file, `/rom/${rom.name}`, `The ROM set has no ${rom.name}`);
  requireInput(
    file.data.length === size && file.crc === rom.crc,
    `/rom/${rom.name}`,
    `${rom.name} is CRC ${hex(file.crc)} of ${file.data.length} bytes, not MAME shangon's ${hex(rom.crc)} of ${size}`,
  );
  return file.data;
}

/** The two CPUs' programs as each CPU addresses them. */
export interface SuperHangOnPrograms {
  readonly main: Uint8Array;
  readonly sub: Uint8Array;
}

/**
 * The main and sub CPUs' programs from a ROM set's files, each ROM checked by name, size and CRC-32, and the main CPU's
 * mirrored half checked against the half it mirrors.
 */
export function assembleSuperHangOnPrograms(files: ReadonlyMap<string, ZipFile>): SuperHangOnPrograms {
  const program = (halves: readonly { readonly even: Rom; readonly odd: Rom }[]) => {
    const out = new Uint8Array(halves.length * 2 * PROGRAM_ROM_SIZE);
    halves.forEach(({ even, odd }, half) =>
      out.set(
        interleave(romData(files, even, PROGRAM_ROM_SIZE), romData(files, odd, PROGRAM_ROM_SIZE)),
        half * 2 * PROGRAM_ROM_SIZE,
      ),
    );
    return out;
  };
  const main = program(SUPER_HANG_ON_PROGRAM_ROMS.main);
  const mirrored = main.subarray(MIRROR.from, MIRROR.from + MIRROR.length);
  requireInput(
    mirrored.every((byte, i) => byte === main[MIRROR.of + i]),
    '/rom/main',
    "The main CPU's 0x30000–0x3FFFF does not mirror its 0x10000–0x1FFFF",
  );
  return { main, sub: program(SUPER_HANG_ON_PROGRAM_ROMS.sub) };
}

/** The sprite ROMs' 16-bit words, bank after bank: each word its even ROM's byte over its odd ROM's. */
export function assembleSuperHangOnSprites(files: ReadonlyMap<string, ZipFile>): Uint16Array {
  const words = new Uint16Array(SUPER_HANG_ON_SPRITE_ROMS.length * SPRITE_ROM_SIZE);
  SUPER_HANG_ON_SPRITE_ROMS.forEach(({ even, odd }, bank) => {
    const [high, low] = [romData(files, even, SPRITE_ROM_SIZE), romData(files, odd, SPRITE_ROM_SIZE)];
    for (let i = 0; i < SPRITE_ROM_SIZE; i++) words[bank * SPRITE_ROM_SIZE + i] = (high[i]! << 8) | low[i]!;
  });
  return words;
}

/** The tile ROMs' three bit planes, the lowest first. */
export const assembleSuperHangOnTiles = (files: ReadonlyMap<string, ZipFile>): readonly Uint8Array[] =>
  SUPER_HANG_ON_TILE_ROMS.map((rom) => romData(files, rom, TILE_ROM_SIZE));

/** The road ROM's bytes. */
export const superHangOnRoadRom = (files: ReadonlyMap<string, ZipFile>) =>
  romData(files, SUPER_HANG_ON_ROAD_ROM, ROAD_ROM_SIZE);

/** Every ROM the tool reads, by name, with its CRC-32 as eight hex digits. */
export const superHangOnRoms = (): Record<string, string> =>
  Object.fromEntries(
    [
      ...[...SUPER_HANG_ON_PROGRAM_ROMS.main, ...SUPER_HANG_ON_PROGRAM_ROMS.sub, ...SUPER_HANG_ON_SPRITE_ROMS].flatMap(
        ({ even, odd }) => [even, odd],
      ),
      ...SUPER_HANG_ON_TILE_ROMS,
      SUPER_HANG_ON_ROAD_ROM,
    ].map(({ name, crc }) => [name, hex(crc)]),
  );
